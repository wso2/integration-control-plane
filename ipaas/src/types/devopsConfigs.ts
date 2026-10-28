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
 * Generic devops config primitives — ConfigMaps, Secrets, their container
 * config-mounts, and the release (app-environment) that owns the container.
 * Shared by the Integration "Configs & Secrets" admin surface and the Tailscale
 * proxy feature. Wire shapes mirror Devant's devops REST API.
 */

export interface DevopsSecret {
  ID: string;
  name: string;
  environment_id: string;
  app_environment_id: string;
  keys: string[];
  version: number;
  config_type: string;
  secret_type: string;
}

/** Secret values are write-only — `data` is `null` when read back. */
export interface DevopsSecretDetails extends DevopsSecret {
  data: Record<string, string> | null;
}

export interface DevopsConfigMap {
  ID: string;
  name: string;
  environment_id: string;
  app_environment_id: string;
  version: number;
  config_type: string;
  keys?: string[];
}

export interface DevopsConfigMapDetails extends DevopsConfigMap {
  data: Record<string, string>;
}

export interface DevopsConfigMount {
  ID: string;
  configmap_id: string | null;
  secret_id: string | null;
  container_id: string;
  app_environment_id: string;
  mount_path: string;
  config_key: string;
  mount_type: string;
  mount_permissions: string | null;
}

/** Image Pull Policy — how the runtime decides whether to pull the image. */
export const IMAGE_PULL_POLICY = {
  ALWAYS: 'Always',
  IF_NOT_PRESENT: 'IfNotPresent',
} as const;
export type ImagePullPolicy = (typeof IMAGE_PULL_POLICY)[keyof typeof IMAGE_PULL_POLICY];

/** A container port mapping. */
export interface ContainerPort {
  name?: string;
  port: number;
  service_port: number;
  protocol: 'TCP' | 'UDP';
}

/** Built-image metadata attached to a container (absent for custom images). */
export interface ContainerImage {
  image_name_with_tag?: string;
  git_hash?: string;
}

/**
 * A release container. The list/edit surfaces read the full record; `mainContainer`
 * and the Configs page only touch `ID`/`name`/`type`, so the rest is optional.
 * `cpu`/`cpu_limit` are milli-CPU (100 = 0.1 CPU); `memory`/`memory_limit` are Mi.
 * `args`/`command` come back decoded from the API and are base64-encoded on write.
 */
export interface ReleaseContainer {
  ID: string;
  name: string;
  type?: string;
  image_id?: string | null;
  image?: ContainerImage | null;
  custom_image?: string;
  image_registry_id?: string | null;
  cpu?: number;
  memory?: number;
  cpu_limit?: number;
  memory_limit?: number;
  limit_disabled?: boolean;
  ports?: ContainerPort[] | null;
  image_pull_policy?: ImagePullPolicy;
  args?: string[] | null;
  command?: string[] | null;
  UpdatedAt?: string;
  CreatedAt?: string;
}

export interface ReleaseNamespace {
  ID: string;
  name: string;
}

/** The PUT body for updating a release container. `args`/`command` are base64-encoded. */
export interface ContainerWriteData {
  image_pull_policy: ImagePullPolicy;
  args: string[];
  command: string[];
  ports: ContainerPort[];
  cpu: number;
  cpu_limit: number;
  memory: number;
  memory_limit: number;
  limit_disabled: boolean;
}

/** Subset of the devops release (app-environment) record we consume. */
export interface ReleaseDetails {
  ID: string;
  containers: ReleaseContainer[];
  /** App-environment metadata; `choreo_env` is `'private_dp'` on a Private Data Plane. */
  metadata?: { choreo_env?: string } | null;
  environment?: { namespaces?: ReleaseNamespace[]; choreo_env?: string };
}

// ── request payloads ────────────────────────────────────────────────────────

export interface ConfigMapWriteData {
  name: string;
  metadata: Record<string, unknown>;
  environment_id: string;
  organization_id: string;
  project_id: string;
  app_environment_id?: string;
  config_type: string;
  isBase64: boolean;
  /** Present for Variable/VariableList/File configs. */
  data?: Record<string, string>;
  /** Present only for the `EnvFile` import variant. */
  env_file_content?: string;
}

export interface SecretWriteData {
  name: string;
  metadata: Record<string, unknown>;
  environment_id: string;
  organization_id: string;
  project_id: string;
  app_environment_id?: string;
  isBase64: boolean;
  save_type: string;
  secret_type: string;
  config_type: string;
  data?: Record<string, string>;
  /** Env-var secrets: stored keys that keep their current value (not re-sent in `data`). */
  keep?: string[];
  env_file_content?: string;
  version?: number;
}

export interface ConfigMountWriteData {
  app_environment_id: string;
  container_id: string;
  configmap_id: string | null;
  secret_id: string | null;
  mount_path?: string;
  config_key?: string;
  mount_type: string;
  mount_permissions: string;
  deploy_changes?: boolean;
}

export interface ConfigMountPath {
  componentId: string;
  releaseId: string;
  containerId: string;
  mountId: string;
}

/** Env-var set vs single file mount — the two "Create a Config or Secret" kinds. */
export type ConfigKind = 'envVars' | 'fileMount';

/** A config-mount joined with its source ConfigMap/Secret — one row in the list. */
export interface ConfigRow {
  mount: DevopsConfigMount;
  isSecret: boolean;
  kind: ConfigKind;
  /** Resolved config/secret name (falls back to the id when not yet loaded). */
  name: string;
  /** Env-var keys, for display. */
  keys: string[];
}

/** UI → hook input for creating/updating a config or secret + its container mount. */
export interface SaveConfigInput {
  componentId: string;
  releaseId: string;
  containerId: string;
  /** environment_id of the target environment. */
  envId: string;
  isSecret: boolean;
  kind: ConfigKind;
  /** Display name of the config/secret. */
  name: string;
  /** Env vars: `{ KEY: value }`. File mount: `{ data: <file contents> }`. */
  data: Record<string, string>;
  /** Editing env-var secrets: stored keys left unchanged (their values are write-only). */
  keep?: string[];
  /** File mount only — absolute container path. */
  mountPath?: string;
  /** Editing an existing config: its id + mount id (skip create + mount, just update data). */
  existing?: { configId: string; mountId: string };
}
