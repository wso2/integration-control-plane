/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

/**
 * Cloud (OpenChoreo) devops config API. Calls the ipaas-service BFF.
 *
 * The Configs & Secrets page speaks devant's ConfigMap/Secret + config-mount
 * model. OpenChoreo exposes two flat per-(component, environment) surfaces the
 * BFF fronts:
 *   - File mounts:  GET/PUT/DELETE  /components/{c}/environments/{e}/files[/{fileName}]
 *   - Env-var groups: GET/PUT/DELETE /components/{c}/environments/{e}/env-groups[/{name}]
 *     (a named bundle of KEY=value pairs; the BFF's workaround for the config
 *     groups OpenChoreo lacks natively — Ballerina bundles them into Config.toml,
 *     others get raw env vars).
 * This layer maps both onto the devant shapes the page expects:
 *   - the shared id is the file name (file mounts) or the group name (env vars),
 *     used as both the ConfigMap/Secret `ID` and the config-mount `ID`/`mountId`,
 *     so `buildConfigRows` joins mounts to sources and the editor ids round-trip.
 *   - `sensitive` distinguishes a Secret (secret_id set) from a ConfigMap.
 *   - file mounts are `mount_type:'File'`; env-var groups are `'ENVFile'`, which
 *     `mountKind` classifies as the "envVars" editor kind.
 *   - getConfigMaps/getSecrets list env-var groups (with their keys); file mounts
 *     have no env-scoped source and surface only via getContainerConfigMounts.
 *   - getConfigMapDetails fetches a group's values / a file's content on edit so
 *     the editor prefills; secret values are write-only (re-entered).
 *
 * Env-scoped reads (getConfigMaps/getSecrets/getConfigMapDetails) receive an env
 * + name but not the component, while the endpoints are component-scoped. The
 * release/mounts reads (which carry the component and run first) publish the
 * component per env via `componentForEnv`; the env-scoped readers await it.
 */

import { bff, items, q, seg, type ListResponse } from './_client';
import type {
  ConfigMapWriteData,
  ConfigMountPath,
  ConfigMountWriteData,
  ContainerWriteData,
  DevopsConfigMap,
  DevopsConfigMapDetails,
  DevopsConfigMount,
  DevopsSecret,
  DevopsSecretDetails,
  ReleaseContainer,
  ReleaseDetails,
  SecretWriteData,
} from '../types/devopsConfigs';

// _orgUuid/_projectId are kept for devant contract parity where cloud does not
// need them; cloud derives the org from the token and addresses everything by
// name (componentId/envId/projectId are OpenChoreo names, not UUIDs).

interface BffFileMount {
  fileName: string;
  mountPath: string;
  sensitive: boolean;
  configType?: string;
  /** Inline content of a non-secret file; absent/empty for secret files. */
  content?: string;
}

interface BffEnvGroup {
  name: string;
  sensitive: boolean;
  keys?: string[];
  /** KEY→value map; only on the single-group GET, redacted for secret groups. */
  data?: Record<string, string>;
}

// The env-scoped reads (getConfigMaps/getSecrets/getConfigMapDetails) receive an
// env + name but not the component, while the endpoints are component-scoped. The
// release/mounts reads (which DO carry the component) publish the latest component
// per env here; the env-scoped reads read it. It is a LATEST-WINS value, not a
// one-shot promise, so navigating between components that share an environment
// re-points to the current component instead of pinning the first one seen.
const componentByEnv = new Map<string, string>();
const componentWaiters = new Map<string, Array<(id: string) => void>>();
const setComponentForEnv = (env: string, componentId: string): void => {
  if (!componentId) return;
  componentByEnv.set(env, componentId);
  const waiters = componentWaiters.get(env);
  if (waiters) {
    componentWaiters.delete(env);
    waiters.forEach((w) => w(componentId));
  }
};

// Resolve the current component for an env. Returns the latest known value
// immediately; otherwise waits for the first publish, bounded by COMPONENT_WAIT_MS
// so an env whose component is never deployed yields '' (→ empty list) rather than
// a query that pends forever.
const COMPONENT_WAIT_MS = 8000;
const componentForEnv = (env: string): Promise<string> => {
  const known = componentByEnv.get(env);
  if (known) return Promise.resolve(known);
  return new Promise<string>((resolve) => {
    const waiters = componentWaiters.get(env) ?? [];
    waiters.push(resolve);
    componentWaiters.set(env, waiters);
    setTimeout(() => resolve(componentByEnv.get(env) ?? ''), COMPONENT_WAIT_MS);
  });
};

const filesBase = (componentId: string, env: string): string => `/components/${seg(componentId)}/environments/${seg(env)}`;

// Coalesce the concurrent env-group reads a page load fires (getContainerConfig-
// Mounts + getConfigMaps + getSecrets all read the same list): share the in-flight
// request per (component, env). Dropped on settle, so a refetch after a mutation
// reloads fresh. Errors degrade to [] (matches the file-mount read).
const inflightEnvGroups = new Map<string, Promise<BffEnvGroup[]>>();
const fetchEnvGroups = (componentId: string, projectId: string, env: string): Promise<BffEnvGroup[]> => {
  const key = `${componentId} ${env}`;
  const existing = inflightEnvGroups.get(key);
  if (existing) return existing;
  const promise = bff
    .get<{ groups?: BffEnvGroup[] }>(`${filesBase(componentId, env)}/env-groups${q({ projectName: projectId })}`)
    .then((r) => r?.groups ?? [])
    .catch(() => [] as BffEnvGroup[])
    .finally(() => inflightEnvGroups.delete(key));
  inflightEnvGroups.set(key, promise);
  return promise;
};

// File mount → config-mount. GET /files returns content-free metadata.
const toFileMount = (f: BffFileMount, env: string, releaseId: string): DevopsConfigMount => ({
  ID: f.fileName,
  configmap_id: f.sensitive ? null : f.fileName,
  secret_id: f.sensitive ? f.fileName : null,
  container_id: env,
  app_environment_id: releaseId,
  mount_path: f.mountPath,
  config_key: 'data',
  mount_type: 'File',
  mount_permissions: '0644',
});

// Env-var group → an ENVFile config-mount (mountKind → "envVars").
const toEnvMount = (g: BffEnvGroup, env: string, releaseId: string): DevopsConfigMount => ({
  ID: g.name,
  configmap_id: g.sensitive ? null : g.name,
  secret_id: g.sensitive ? g.name : null,
  container_id: env,
  app_environment_id: releaseId,
  mount_path: '',
  config_key: '',
  mount_type: 'ENVFile',
  mount_permissions: '0000',
});

// The BFF upserts a file (content + mountPath + sensitivity) in one PUT, but the
// Configs hook creates the config/secret (content) and then mounts it (mountPath)
// as two calls. Stage the content by fileName between the two so the mount call
// can issue the combined PUT. (Env-var groups need no staging — the group PUT
// carries everything and happens in create/update directly.)
interface PendingFile {
  content: string;
  sensitive: boolean;
}
const pendingFiles = new Map<string, PendingFile>();
const stageFile = (fileName: string, data: { data?: Record<string, string> }, sensitive: boolean): void => {
  pendingFiles.set(fileName, { content: data.data?.data ?? '', sensitive });
};

// Cloud has no release resource and no lookup route, so the env is recovered by matching release_name.
interface BffReleaseBinding {
  environment_id?: string;
  release_name?: string;
}
const envForRelease = (componentId: string, releaseId: string): Promise<string> =>
  bff.get<ListResponse<BffReleaseBinding>>(`/components/${seg(componentId)}/release-mgt-deployments`).then((r) => items(r).find((d) => d.release_name === releaseId)?.environment_id ?? '');

// PUT the combined file mount, draining any staged content for this fileName.
const putFile = (componentId: string, projectId: string, env: string, fileName: string, mountPath: string, secretIdSet: boolean): Promise<unknown> => {
  const staged = pendingFiles.get(fileName);
  pendingFiles.delete(fileName);
  return bff.put(`${filesBase(componentId, env)}/files/${seg(fileName)}${q({ projectName: projectId })}`, {
    fileName,
    mountPath,
    content: staged?.content ?? '',
    isBase64: false,
    sensitive: staged?.sensitive ?? secretIdSet,
  });
};

// PUT a whole env-var group. The component is not on the create/update signatures
// (they carry only the env via data.environment_id), so resolve it per env.
// `keep` names stored secret keys that stay as they are; any other stored key
// missing from `data` is removed.
const putEnvGroup = async (projectId: string, env: string, name: string, sensitive: boolean, data: Record<string, string>, keep?: string[]): Promise<void> => {
  const componentId = await componentForEnv(env);
  if (!componentId) return;
  await bff.put(`${filesBase(componentId, env)}/env-groups/${seg(name)}${q({ projectName: projectId })}`, { name, sensitive, data, ...(keep?.length ? { keep } : {}) });
};

const listEnvGroups = async (projectId: string, env: string): Promise<BffEnvGroup[]> => {
  const componentId = await componentForEnv(env);
  if (!componentId) return [];
  return fetchEnvGroups(componentId, projectId, env);
};

// ── release (real container data, keyed by the resolved env) ───────────────────

// Cloud has no release distinct from an app-environment binding, so releaseId
// resolves to an env via envForRelease. `ID` is aliased to that env on purpose —
// downstream consumers address the container by env, not a real container id.
// Other fields come straight from the BFF's Containers endpoint (same shape as
// ReleaseContainer), except `name` falls back to the env only if BFF omits it.
export const getReleaseById = async (_orgUuid: string, _projectId: string, componentId: string, releaseId: string): Promise<ReleaseDetails> => {
  const env = await envForRelease(componentId, releaseId);
  if (!env) return { ID: releaseId, containers: [] };
  setComponentForEnv(env, componentId);
  const list = await bff.get<ListResponse<ReleaseContainer>>(`${filesBase(componentId, env)}/containers`).catch(() => null);
  const real = items(list)[0];
  if (!real) return { ID: releaseId, containers: [] };
  return { ID: releaseId, containers: [{ ...real, ID: env, name: real.name ?? env, type: real.type ?? 'MAIN' }] };
};

// BFF splits this PUT into a ReleaseBinding write (resources/pull-policy, live after
// rollout) and a Workload write (command/args, live after next cut+promote).
// containerId is really the env; the URL's "main" segment is a fixed literal.
export const updateContainer = async (_orgUuid: string, _projectId: string, componentId: string, _releaseId: string, containerId: string, data: ContainerWriteData): Promise<ReleaseContainer> => {
  const env = containerId;
  await bff.put(`${filesBase(componentId, env)}/containers/main`, data);
  return { ID: env, name: env, type: 'MAIN', ...data };
};

// ── config maps / secrets = env-var groups (files have no env-scoped source) ───

const toConfigMap = (g: BffEnvGroup, environmentId: string): DevopsConfigMap => ({ ID: g.name, name: g.name, environment_id: environmentId, app_environment_id: '', version: 1, config_type: 'VariableList', keys: g.keys ?? [] });
const toSecret = (g: BffEnvGroup, environmentId: string): DevopsSecret => ({ ID: g.name, name: g.name, environment_id: environmentId, app_environment_id: '', keys: g.keys ?? [], version: 1, config_type: 'VariableList', secret_type: 'Opaque' });

export const getConfigMaps = async (_orgUuid: string, projectId: string, environmentId: string): Promise<DevopsConfigMap[]> => (await listEnvGroups(projectId, environmentId)).filter((g) => !g.sensitive).map((g) => toConfigMap(g, environmentId));

export const getSecrets = async (_orgUuid: string, projectId: string, environmentId: string): Promise<DevopsSecret[]> => (await listEnvGroups(projectId, environmentId)).filter((g) => g.sensitive).map((g) => toSecret(g, environmentId));

// Secret values are write-only; the page never reads secret details (the editor
// re-enters them from the row's keys), so a benign redacted default suffices.
export const getSecretDetails = (_orgUuid: string, _projectId: string, environmentId: string, secretId: string): Promise<DevopsSecretDetails> =>
  Promise.resolve({ ID: secretId, name: secretId, environment_id: environmentId, app_environment_id: '', keys: [], version: 1, config_type: 'VariableList', secret_type: 'Opaque', data: null });

// On edit, prefill values. The id can be an env-var group (→ its KEY=value map)
// or a file mount (→ its content under `data`); try the group first, fall back to
// the file. Secret values are unreadable → empty (re-entered); a 404 → empty.
export const getConfigMapDetails = async (_orgUuid: string, projectId: string, environmentId: string, configMapId: string): Promise<DevopsConfigMapDetails> => {
  const base: DevopsConfigMapDetails = { ID: configMapId, name: configMapId, environment_id: environmentId, app_environment_id: '', version: 1, config_type: 'File', keys: [], data: { data: '' } };
  const componentId = await componentForEnv(environmentId);
  if (!componentId) return base;
  const group = await bff.get<BffEnvGroup>(`${filesBase(componentId, environmentId)}/env-groups/${seg(configMapId)}${q({ projectName: projectId })}`).catch(() => null);
  if (group) return { ...base, config_type: 'VariableList', keys: group.keys ?? [], data: group.data ?? {} };
  const file = await bff.get<BffFileMount>(`${filesBase(componentId, environmentId)}/files/${seg(configMapId)}${q({ projectName: projectId })}`).catch(() => null);
  return { ...base, data: { data: file?.content ?? '' } };
};

// ── create / update ────────────────────────────────────────────────────────────
// Env-var groups (config_type 'VariableList') PUT the whole group here — the hook
// does not re-mount env-var edits. File mounts (config_type 'File') stage their
// content; the paired mount call issues the combined PUT.

const isEnvVars = (configType: string): boolean => configType === 'VariableList';

export const createSecret = async (_orgUuid: string, _projectId: string, data: SecretWriteData): Promise<DevopsSecret> => {
  if (isEnvVars(data.config_type)) await putEnvGroup(data.project_id, data.environment_id, data.name, true, data.data ?? {});
  else stageFile(data.name, data, true);
  return { ID: data.name, name: data.name, environment_id: data.environment_id, app_environment_id: data.app_environment_id ?? '', keys: Object.keys(data.data ?? {}), version: 1, config_type: data.config_type, secret_type: data.secret_type };
};

export const updateSecret = async (_orgUuid: string, _projectId: string, secretId: string, data: SecretWriteData): Promise<DevopsSecret> => {
  if (isEnvVars(data.config_type)) await putEnvGroup(data.project_id, data.environment_id, secretId, true, data.data ?? {}, data.keep);
  else stageFile(secretId, data, true);
  return {
    ID: secretId,
    name: data.name,
    environment_id: data.environment_id,
    app_environment_id: data.app_environment_id ?? '',
    keys: [...Object.keys(data.data ?? {}), ...(data.keep ?? [])],
    version: 1,
    config_type: data.config_type,
    secret_type: data.secret_type,
  };
};

export const createConfigMap = async (_orgUuid: string, _projectId: string, data: ConfigMapWriteData): Promise<DevopsConfigMap> => {
  if (isEnvVars(data.config_type)) await putEnvGroup(data.project_id, data.environment_id, data.name, false, data.data ?? {});
  else stageFile(data.name, data, false);
  return { ID: data.name, name: data.name, environment_id: data.environment_id, app_environment_id: data.app_environment_id ?? '', version: 1, config_type: data.config_type, keys: Object.keys(data.data ?? {}) };
};

export const updateConfigMapData = async (_orgUuid: string, _projectId: string, configMapId: string, data: ConfigMapWriteData): Promise<DevopsConfigMapDetails> => {
  if (isEnvVars(data.config_type)) await putEnvGroup(data.project_id, data.environment_id, configMapId, false, data.data ?? {});
  else stageFile(configMapId, data, false);
  return { ID: configMapId, name: data.name, environment_id: data.environment_id, app_environment_id: data.app_environment_id ?? '', version: 1, config_type: data.config_type, keys: Object.keys(data.data ?? {}), data: data.data ?? {} };
};

// Env-scoped deletes lack a component, so they cannot address a group/file; the
// page deletes by unmounting (removeConfigMount) instead. Kept as benign no-ops.
export const deleteSecret = (_orgUuid: string, _projectId: string, _environmentId: string, _secretId: string): Promise<void> => Promise.resolve();
export const deleteConfigMap = (_orgUuid: string, _projectId: string, _environmentId: string, _configMapId: string): Promise<void> => Promise.resolve();

// ── container config mounts (files + env-var groups) ───────────────────────────

export const getContainerConfigMounts = async (_orgUuid: string, projectId: string, componentId: string, releaseId: string, containerId: string): Promise<DevopsConfigMount[]> => {
  const env = containerId; // carried through from getReleaseById
  if (!env) return [];
  setComponentForEnv(env, componentId);
  const [filesR, groups] = await Promise.all([bff.get<{ files?: BffFileMount[] }>(`${filesBase(componentId, env)}/files${q({ projectName: projectId })}`).catch(() => null), fetchEnvGroups(componentId, projectId, env)]);
  return [...(filesR?.files ?? []).map((f) => toFileMount(f, env, releaseId)), ...groups.map((g) => toEnvMount(g, env, releaseId))];
};

// On create, the hook mounts the config after creating it. Env-var groups are
// already fully written by createConfigMap/createSecret, so the ENVFile mount is
// a no-op that echoes a synthetic mount; file mounts issue the combined PUT here.
export const mountConfig = async (_orgUuid: string, projectId: string, componentId: string, data: ConfigMountWriteData): Promise<DevopsConfigMount> => {
  const id = data.configmap_id ?? data.secret_id ?? '';
  if (data.mount_type !== 'File') {
    return {
      ID: id,
      configmap_id: data.configmap_id,
      secret_id: data.secret_id,
      container_id: data.container_id,
      app_environment_id: data.app_environment_id,
      mount_path: '',
      config_key: '',
      mount_type: data.mount_type,
      mount_permissions: data.mount_permissions,
    };
  }
  const mountPath = data.mount_path ?? '';
  await putFile(componentId, projectId, data.container_id, id, mountPath, !!data.secret_id);
  return {
    ID: id,
    configmap_id: data.configmap_id,
    secret_id: data.secret_id,
    container_id: data.container_id,
    app_environment_id: data.app_environment_id,
    mount_path: mountPath,
    config_key: data.config_key ?? 'data',
    mount_type: 'File',
    mount_permissions: data.mount_permissions,
  };
};

// The hook only updates a mount for file-mount edits (mount path is editable);
// env-var edits update the group via updateConfigMapData/updateSecret instead.
export const updateConfigMount = async (_orgUuid: string, projectId: string, path: ConfigMountPath, data: ConfigMountWriteData): Promise<DevopsConfigMount> => {
  const fileName = path.mountId;
  const env = path.containerId;
  const mountPath = (data.mount_path as string) ?? '';
  const secretId = (data.secret_id as string | null) ?? null;
  await putFile(path.componentId, projectId, env, fileName, mountPath, !!secretId);
  return {
    ID: fileName,
    configmap_id: (data.configmap_id as string | null) ?? null,
    secret_id: secretId,
    container_id: env,
    app_environment_id: env,
    mount_path: mountPath,
    config_key: 'data',
    mount_type: 'File',
    mount_permissions: (data.mount_permissions as string | null) ?? '0644',
  };
};

// Unmount = delete. The id is an env-var group or a file mount; delete the group
// if it exists, else resolve the file's mount path and delete the file. A config
// already gone is a no-op. path carries the component, so no env→component lookup.
export const removeConfigMount = async (_orgUuid: string, projectId: string, path: ConfigMountPath): Promise<void> => {
  const env = path.containerId;
  const name = path.mountId;
  const base = filesBase(path.componentId, env);
  const group = await bff.get<BffEnvGroup>(`${base}/env-groups/${seg(name)}${q({ projectName: projectId })}`).catch(() => null);
  if (group) {
    await bff.delete(`${base}/env-groups/${seg(name)}${q({ projectName: projectId })}`);
    return;
  }
  const list = await bff.get<{ files?: BffFileMount[] }>(`${base}/files${q({ projectName: projectId })}`).catch(() => null);
  const file = (list?.files ?? []).find((f) => f.fileName === name);
  if (!file) return;
  await bff.delete(`${base}/files/${seg(name)}${q({ projectName: projectId, mountPath: file.mountPath })}`);
};
