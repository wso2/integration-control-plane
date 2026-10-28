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

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createConfigMap, createSecret, getConfigMapDetails, getConfigMaps, getContainerConfigMounts, getReleaseById, getSecrets, mountConfig, removeConfigMount, updateConfigMapData, updateConfigMount, updateContainer, updateSecret } from '../api/devopsConfigs';
import type { ConfigMapWriteData, ConfigMountPath, ConfigMountWriteData, ContainerWriteData, DevopsConfigMap, DevopsConfigMapDetails, DevopsConfigMount, DevopsSecret, ReleaseDetails, SaveConfigInput, SecretWriteData } from '../types/devopsConfigs';
import { useOrgUuid } from './useOrgUuid';

const ROOT = 'devopsConfigs';

// ── reads ─────────────────────────────────────────────────────────────────────

/** The env's release (app-environment) — used to resolve the main container. */
export function useRelease(projectId: string, componentId: string | undefined, releaseId: string | undefined) {
  const orgUuid = useOrgUuid();
  return useQuery<ReleaseDetails>({
    queryKey: [ROOT, 'release', orgUuid, projectId, componentId, releaseId],
    queryFn: () => getReleaseById(orgUuid!, projectId, componentId!, releaseId!),
    enabled: !!orgUuid && !!projectId && !!componentId && !!releaseId,
  });
}

export function useConfigMaps(projectId: string, environmentId: string | undefined) {
  const orgUuid = useOrgUuid();
  return useQuery<DevopsConfigMap[]>({
    queryKey: [ROOT, 'configmaps', orgUuid, projectId, environmentId],
    queryFn: () => getConfigMaps(orgUuid!, projectId, environmentId!),
    enabled: !!orgUuid && !!projectId && !!environmentId,
  });
}

export function useSecrets(projectId: string, environmentId: string | undefined) {
  const orgUuid = useOrgUuid();
  return useQuery<DevopsSecret[]>({
    queryKey: [ROOT, 'secrets', orgUuid, projectId, environmentId],
    queryFn: () => getSecrets(orgUuid!, projectId, environmentId!),
    enabled: !!orgUuid && !!projectId && !!environmentId,
  });
}

/** Full data (incl. values) for one ConfigMap — used to prefill the edit form. */
export function useConfigMapDetails(projectId: string, environmentId: string | undefined, configMapId: string | undefined) {
  const orgUuid = useOrgUuid();
  return useQuery<DevopsConfigMapDetails>({
    queryKey: [ROOT, 'configMapDetails', orgUuid, projectId, environmentId, configMapId],
    queryFn: () => getConfigMapDetails(orgUuid!, projectId, environmentId!, configMapId!),
    enabled: !!orgUuid && !!projectId && !!environmentId && !!configMapId,
  });
}

/** Config-mounts on a component's container — the configs actually injected here. */
export function useContainerConfigMounts(projectId: string, componentId: string | undefined, releaseId: string | undefined, containerId: string | undefined) {
  const orgUuid = useOrgUuid();
  return useQuery<DevopsConfigMount[]>({
    queryKey: [ROOT, 'mounts', orgUuid, projectId, componentId, releaseId, containerId],
    queryFn: () => getContainerConfigMounts(orgUuid!, projectId, componentId!, releaseId!, containerId!),
    enabled: !!orgUuid && !!projectId && !!componentId && !!releaseId && !!containerId,
  });
}

// ── mutations ──────────────────────────────────────────────────────────────────

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: [ROOT] });
  qc.invalidateQueries({ queryKey: ['componentDeployment'] });
}

/**
 * Create or update a config/secret and (on create) mount it onto the container.
 * Env-var configs use `config_type: VariableList` + an `ENVFile` mount; file
 * mounts use `config_type: File` + a `File` mount at `mountPath`. Secrets go to
 * the `/secret` endpoint with `secret_type: Opaque`. Mirrors Devant + the HAR.
 */
export function useSaveConfig(projectId: string) {
  const orgUuid = useOrgUuid();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaveConfigInput) => {
      if (!orgUuid) throw new Error('Organization is not available.');
      const { componentId, releaseId, containerId, envId, isSecret, kind, name, data, keep, mountPath, existing } = input;
      const config_type = kind === 'envVars' ? 'VariableList' : 'File';

      // 1. Create or update the ConfigMap / Secret.
      const configId = await (async () => {
        if (isSecret) {
          const body: SecretWriteData = {
            name,
            metadata: {},
            environment_id: envId,
            organization_id: orgUuid,
            project_id: projectId,
            app_environment_id: releaseId,
            isBase64: false,
            save_type: 'Save',
            secret_type: 'Opaque',
            config_type,
            data,
            ...(keep?.length ? { keep } : {}),
          };
          if (existing) {
            await updateSecret(orgUuid, projectId, existing.configId, body);
            return existing.configId;
          }
          return (await createSecret(orgUuid, projectId, body)).ID;
        }
        const body: ConfigMapWriteData = { name, metadata: {}, environment_id: envId, organization_id: orgUuid, project_id: projectId, app_environment_id: releaseId, isBase64: false, config_type, data };
        if (existing) {
          await updateConfigMapData(orgUuid, projectId, existing.configId, body);
          return existing.configId;
        }
        return (await createConfigMap(orgUuid, projectId, body)).ID;
      })();

      // 2. On create, mount the config onto the container. On edit, env-var mounts
      // never change, but a file mount's `mount_path` is editable — push it to the
      // existing mount so the change actually takes effect (the same payload as create).
      if (!existing) {
        const mount: ConfigMountWriteData =
          kind === 'envVars'
            ? { app_environment_id: releaseId, container_id: containerId, configmap_id: isSecret ? null : configId, secret_id: isSecret ? configId : null, mount_type: 'ENVFile', mount_permissions: '0000', mount_path: '', config_key: '', deploy_changes: true }
            : {
                app_environment_id: releaseId,
                container_id: containerId,
                configmap_id: isSecret ? null : configId,
                secret_id: isSecret ? configId : null,
                mount_type: 'File',
                mount_permissions: '0644',
                mount_path: mountPath ?? '',
                config_key: 'data',
                deploy_changes: true,
              };
        await mountConfig(orgUuid, projectId, componentId, mount);
      } else if (kind === 'fileMount') {
        const mount: ConfigMountWriteData = {
          app_environment_id: releaseId,
          container_id: containerId,
          configmap_id: isSecret ? null : configId,
          secret_id: isSecret ? configId : null,
          mount_type: 'File',
          mount_permissions: '0644',
          mount_path: mountPath ?? '',
          config_key: 'data',
          deploy_changes: true,
        };
        await updateConfigMount(orgUuid, projectId, { componentId, releaseId, containerId, mountId: existing.mountId }, mount);
      }
      return configId;
    },
    onSuccess: () => invalidateAll(qc),
  });
}

/** Update a release container (resources, image-pull policy, command/args). */
export function useUpdateContainer(projectId: string, componentId: string, releaseId: string) {
  const orgUuid = useOrgUuid();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ containerId, data }: { containerId: string; data: ContainerWriteData }) => {
      if (!orgUuid) throw new Error('Organization is not available.');
      return updateContainer(orgUuid, projectId, componentId, releaseId, containerId, data);
    },
    onSuccess: () => invalidateAll(qc),
  });
}

/** Remove a config from the container by deleting its config-mount. */
export function useDeleteConfig(projectId: string) {
  const orgUuid = useOrgUuid();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (path: ConfigMountPath) => {
      if (!orgUuid) throw new Error('Organization is not available.');
      return removeConfigMount(orgUuid, projectId, path);
    },
    onSuccess: () => invalidateAll(qc),
  });
}
