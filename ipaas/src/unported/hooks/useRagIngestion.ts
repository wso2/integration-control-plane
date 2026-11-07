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

import { useCallback, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createByoiComponent, deployByoiImage, getSampleRegistryId } from '../../api/tailscale';
import { createConfigMap, createSecret, deleteConfigMap, deleteSecret, getReleaseById, mountConfig } from '../../api/devopsConfigs';
import { fetchComponentDetail, fetchFirstEnvironment } from '../../api/prebuilt';
import { deleteComponent, fetchComponents } from '../../api/components';
import { getServer, getServerAdminUser } from '../../api/platformServices';
import { retrieveChunks } from '../../api/ragBackend';
import {
  RAG_INGESTION_COMPONENT_TYPE,
  RAG_INGESTION_SUBTYPE,
  RAG_RETRIEVAL_SERVICE_DEFAULT_IMAGE,
  RAG_RETRIEVAL_SERVICE_DISPLAY_NAME,
  RAG_RETRIEVAL_SERVICE_NAME,
  RAG_RETRIEVAL_SERVICE_SUBTYPE,
  RAG_SERVICE_COMPONENT_TYPE,
  RAG_SERVICE_DEFAULT_IMAGE,
  RAG_SERVICE_SUBTYPE,
} from '../../constants/ragIngestion';
import { buildRagEnvVars, buildRetrievePayload, splitRagEnvVars } from '../../utils/ragIngestion';
import { mainContainer } from '../../utils/devopsConfigs';
import { useOrgUuid } from '../../hooks/useOrgUuid';
import { ragIngestionImage } from '../../hooks/useRagIngestion';
import type { AutomationConfig, EmbeddingConfig, RagIngestionForm, RetrievalQuery, VectorStoreConfig } from '../../types/ragIngestion';
import type { PrebuiltComponentRef } from '../../types/prebuilt';

/** Whether the RAG Ingestion feature is available. */
export function isRagIngestionEnabled(): boolean {
  // Not served by the BFF yet; flip this when the feature is ported.
  return false;
}

// A freshly-created component's release is provisioned asynchronously; poll for it.
const MAX_RELEASE_POLLS = 20;
const RELEASE_POLL_INTERVAL_MS = 2000;

/**
 * Resolve the env release id from a component's `apiVersions[].appEnvVersions`.
 * The release (app-environment) is provisioned at component creation — reading
 * it here avoids the `componentDeployment` query, which 404s until first deploy.
 */
function resolveReleaseId(detail: PrebuiltComponentRef, versionId: string, environmentId: string): string | undefined {
  const versions = detail.apiVersions ?? [];
  const preferred = versions.find((v) => v.id === versionId) ?? versions.find((v) => v.latest) ?? versions[0];
  const fromPreferred = preferred?.appEnvVersions?.find((e) => e.environmentId === environmentId)?.releaseId;
  if (fromPreferred) return fromPreferred;
  // Fallback: any version that has a release for this environment.
  return versions.flatMap((v) => v.appEnvVersions ?? []).find((e) => e.environmentId === environmentId)?.releaseId;
}

async function waitForReleaseId(projectId: string, handle: string, versionId: string, environmentId: string): Promise<string> {
  for (let attempt = 0; attempt < MAX_RELEASE_POLLS; attempt++) {
    const detail = await fetchComponentDetail(projectId, handle);
    const releaseId = resolveReleaseId(detail, versionId, environmentId);
    if (releaseId) return releaseId;
    await new Promise((resolve) => setTimeout(resolve, RELEASE_POLL_INTERVAL_MS));
  }
  throw new Error('Timed out waiting for the new component to be provisioned.');
}

/**
 * Resolve a WSO2-managed vector store's connection params from the platform-services
 * API (host/port/user/db from the server, password from the admin-user endpoint).
 * Other providers are returned unchanged.
 */
async function resolveVectorStore(vectorStore: VectorStoreConfig | null): Promise<VectorStoreConfig | null> {
  if (vectorStore?.provider !== 'pgvector-devant') return vectorStore;
  const [server, admin] = await Promise.all([getServer(vectorStore.serverId), getServerAdminUser(vectorStore.serverId)]);
  const conn = server.connection_params;
  return { ...vectorStore, host: conn.host, port: conn.port, user: conn.user || admin.username, password: admin.password, dbName: conn.database };
}

interface ByoiComponentSpec {
  name: string;
  displayName: string;
  description: string;
  componentType: string;
  componentSubType: string;
  imageUrl: string;
}

/**
 * Create + deploy a BYOI component (registry → create → await release → deploy).
 * Rolls the component back if anything after creation fails, then rethrows.
 * Returns the created component handle.
 */
async function provisionByoiComponent(orgUuid: string, orgHandler: string, projectId: string, spec: ByoiComponentSpec): Promise<string> {
  let createdId: string | null = null;
  try {
    const registryId = await getSampleRegistryId(orgUuid);
    const created = await createByoiComponent({
      projectId,
      name: spec.name,
      displayName: spec.displayName,
      description: spec.description,
      componentType: spec.componentType,
      port: null,
      imageUrl: spec.imageUrl,
      registryId,
      componentSubType: spec.componentSubType,
    });
    createdId = created.id;
    const detail = await fetchComponentDetail(projectId, created.handle);
    const versionId = detail.deploymentTracks?.[0]?.id;
    if (!versionId) throw new Error('No deployment track found for the new component.');
    const environment = await fetchFirstEnvironment(orgUuid, projectId);
    const releaseId = await waitForReleaseId(projectId, created.handle, versionId, environment.id);
    await deployByoiImage(created.id, releaseId, spec.imageUrl);
    return created.handle;
  } catch (err) {
    if (createdId) {
      try {
        await deleteComponent({ orgHandler, componentId: createdId, projectId });
      } catch (rollbackErr) {
        console.error('Failed to roll back BYOI component', { createdId }, rollbackErr);
      }
    }
    throw err;
  }
}

/**
 * Ensure the project has a RAG Retrieval Service — the shared retrieval backend
 * every ingestion pipeline queries. Reused if one already exists; otherwise
 * created + deployed. One per project (mirrors Devant).
 */
async function ensureRetrievalService(orgUuid: string, orgHandler: string, projectId: string): Promise<void> {
  const components = await fetchComponents(orgHandler, projectId);
  if (components.some((c) => c.componentSubType === RAG_RETRIEVAL_SERVICE_SUBTYPE)) return;
  await provisionByoiComponent(orgUuid, orgHandler, projectId, {
    name: RAG_RETRIEVAL_SERVICE_NAME,
    displayName: RAG_RETRIEVAL_SERVICE_DISPLAY_NAME,
    description: 'Shared retrieval backend for RAG ingestion pipelines.',
    componentType: RAG_SERVICE_COMPONENT_TYPE,
    componentSubType: RAG_RETRIEVAL_SERVICE_SUBTYPE,
    imageUrl: RAG_RETRIEVAL_SERVICE_DEFAULT_IMAGE,
  });
}

export interface CreateRagIngestionInput {
  orgHandler: string;
  form: RagIngestionForm;
}

export interface CreateRagIngestionState {
  progress: number;
  stepLabel: string;
  error: string | null;
  isDeploying: boolean;
  isSuccess: boolean;
  /** Handle of the created component, for navigating to its overview. */
  componentHandler: string | null;
}

const IDLE: CreateRagIngestionState = { progress: 0, stepLabel: '', error: null, isDeploying: false, isSuccess: false, componentHandler: null };

/**
 * Create and deploy a RAG ingestion automation. Reuses the platform's BYOI
 * create → configure (env vars via secret + configmap mounts) → deploy machinery
 * (the same primitives behind the Tailscale proxy and prebuilt-integration flows).
 * On failure after the component was created, it is rolled back (deleted).
 */
export function useCreateRagIngestion() {
  const orgUuid = useOrgUuid();
  const qc = useQueryClient();
  const [state, setState] = useState<CreateRagIngestionState>(IDLE);

  const deploy = useCallback(
    async ({ orgHandler, form }: CreateRagIngestionInput) => {
      if (!orgUuid) {
        setState({ ...IDLE, error: 'Organization is not available.' });
        return;
      }
      const projectId = form.automation.projectId;
      const image = ragIngestionImage();
      let createdComponentId: string | null = null;
      // Track the env-scoped configs so rollback can delete them too — deleting
      // the component alone can leave these orphaned.
      let createdEnvironmentId: string | null = null;
      let createdSecretId: string | null = null;
      let createdConfigMapId: string | null = null;

      setState({ ...IDLE, isDeploying: true, progress: 5, stepLabel: 'Preparing retrieval service…' });
      try {
        // 0. Ensure the shared RAG Retrieval Service exists for this project.
        // Done first so a failure here leaves nothing to roll back; the service
        // is shared and reused across ingestions.
        await ensureRetrievalService(orgUuid, orgHandler, projectId);

        // 1. Resolve vector store connection params + serialize to env vars.
        setState((s) => ({ ...s, progress: 15, stepLabel: 'Resolving configuration…' }));
        const vectorStore = await resolveVectorStore(form.vectorStore);
        const { plain, secret } = splitRagEnvVars(buildRagEnvVars({ ...form, vectorStore }));

        // 2. Ensure a registry, then create the BYOI cronjob component.
        setState((s) => ({ ...s, progress: 30, stepLabel: 'Creating automation…' }));
        const registryId = await getSampleRegistryId(orgUuid);
        const created = await createByoiComponent({
          projectId,
          name: form.automation.name,
          displayName: form.automation.displayName,
          description: form.automation.description,
          componentType: RAG_INGESTION_COMPONENT_TYPE,
          port: null,
          imageUrl: image,
          registryId,
          componentSubType: RAG_INGESTION_SUBTYPE,
        });
        createdComponentId = created.id;

        // 3. Discover the deployment track, environment and (async) release.
        setState((s) => ({ ...s, progress: 45, stepLabel: 'Provisioning the automation…' }));
        const detail = await fetchComponentDetail(projectId, created.handle);
        const versionId = detail.deploymentTracks?.[0]?.id;
        if (!versionId) throw new Error('No deployment track found for the new component.');
        const environment = await fetchFirstEnvironment(orgUuid, projectId);
        createdEnvironmentId = environment.id;
        const releaseId = await waitForReleaseId(projectId, created.handle, versionId, environment.id);

        // 4. Locate the main container to mount configuration onto.
        setState((s) => ({ ...s, progress: 70, stepLabel: 'Applying configuration…' }));
        const release = await getReleaseById(orgUuid, projectId, created.id, environment.id, releaseId);
        const container = mainContainer(release.containers);
        if (!container) throw new Error('No container found on the component release.');

        // 5. Store secrets + plain config as env-var mounts on the container.
        const commonBase = { environment_id: environment.id, organization_id: orgUuid, project_id: projectId, app_environment_id: releaseId, isBase64: false, metadata: {} };
        if (Object.keys(secret).length > 0) {
          const createdSecret = await createSecret(orgUuid, projectId, { ...commonBase, name: `${created.handle}-rag-secrets`, save_type: 'Save', secret_type: 'Opaque', config_type: 'VariableList', data: secret });
          createdSecretId = createdSecret.ID;
          await mountConfig(orgUuid, projectId, created.id, { app_environment_id: releaseId, container_id: container.ID, secret_id: createdSecret.ID, configmap_id: null, mount_type: 'ENVFile', mount_permissions: '0000', mount_path: '', config_key: '' });
        }
        if (Object.keys(plain).length > 0) {
          const createdConfigMap = await createConfigMap(orgUuid, projectId, { ...commonBase, name: `${created.handle}-rag-config`, config_type: 'VariableList', data: plain });
          createdConfigMapId = createdConfigMap.ID;
          await mountConfig(orgUuid, projectId, created.id, { app_environment_id: releaseId, container_id: container.ID, configmap_id: createdConfigMap.ID, secret_id: null, mount_type: 'ENVFile', mount_permissions: '0000', mount_path: '', config_key: '' });
        }

        // 6. Deploy the ingestion image.
        setState((s) => ({ ...s, progress: 90, stepLabel: 'Deploying…' }));
        await deployByoiImage(created.id, releaseId, image);

        qc.invalidateQueries({ queryKey: ['components'] });
        qc.invalidateQueries({ queryKey: ['devopsConfigs'] });
        setState({ progress: 100, stepLabel: 'Deployed!', error: null, isDeploying: false, isSuccess: true, componentHandler: created.handle });
      } catch (err) {
        console.error('RAG ingestion create/deploy failed', { orgHandler, projectId, createdComponentId }, err);
        // Best-effort rollback: delete the env-scoped configs first (they don't
        // reliably cascade with the component), then the component itself.
        if (createdEnvironmentId && createdConfigMapId) {
          try {
            await deleteConfigMap(orgUuid, projectId, createdEnvironmentId, createdConfigMapId);
          } catch (rollbackErr) {
            console.error('Failed to roll back RAG ingestion config map', { createdConfigMapId }, rollbackErr);
          }
        }
        if (createdEnvironmentId && createdSecretId) {
          try {
            await deleteSecret(orgUuid, projectId, createdEnvironmentId, createdSecretId);
          } catch (rollbackErr) {
            console.error('Failed to roll back RAG ingestion secret', { createdSecretId }, rollbackErr);
          }
        }
        if (createdComponentId) {
          try {
            await deleteComponent({ orgHandler, componentId: createdComponentId, projectId });
          } catch (rollbackErr) {
            console.error('Failed to roll back RAG ingestion component', { createdComponentId }, rollbackErr);
          }
        }
        const detail = err instanceof Error ? err.message : 'Something went wrong.';
        setState({ ...IDLE, error: `Failed to set up RAG ingestion: ${detail}` });
      }
    },
    [orgUuid, qc],
  );

  const reset = useCallback(() => setState(IDLE), []);

  return { deploy, reset, ...state };
}

/** Query a configured vector store for the most relevant chunks (RAG Retrieval). */
export function useRetrieveChunks() {
  return useMutation({
    mutationFn: async (input: { vectorStore: VectorStoreConfig; embedding: EmbeddingConfig; query: RetrievalQuery }) => {
      const resolved = await resolveVectorStore(input.vectorStore);
      if (!resolved) throw new Error('Vector store is not configured.');
      return retrieveChunks(buildRetrievePayload(resolved, input.embedding, input.query));
    },
  });
}

export interface CreateRagServiceInput {
  orgHandler: string;
  automation: AutomationConfig;
}

/**
 * Create and deploy the shared RAG retrieval "Service" — a BYOI service component
 * running the `devant-rag-service` image. Same create → discover release → deploy
 * skeleton as ingestion, without the env-var configuration step. (Container-resource
 * tuning and the OpenAPI endpoint declaration Devant applies are not yet ported —
 * they need ICP API methods that don't exist yet.)
 */
export function useCreateRagService() {
  const orgUuid = useOrgUuid();
  const qc = useQueryClient();
  const [state, setState] = useState<CreateRagIngestionState>(IDLE);

  const deploy = useCallback(
    async ({ orgHandler, automation }: CreateRagServiceInput) => {
      if (!orgUuid) {
        setState({ ...IDLE, error: 'Organization is not available.' });
        return;
      }
      const projectId = automation.projectId;

      setState({ ...IDLE, isDeploying: true, progress: 20, stepLabel: 'Creating service…' });
      try {
        const handle = await provisionByoiComponent(orgUuid, orgHandler, projectId, {
          name: automation.name,
          displayName: automation.displayName,
          description: automation.description,
          componentType: RAG_SERVICE_COMPONENT_TYPE,
          componentSubType: RAG_SERVICE_SUBTYPE,
          imageUrl: RAG_SERVICE_DEFAULT_IMAGE,
        });
        qc.invalidateQueries({ queryKey: ['components'] });
        setState({ progress: 100, stepLabel: 'Deployed!', error: null, isDeploying: false, isSuccess: true, componentHandler: handle });
      } catch (err) {
        console.error('RAG service create/deploy failed', { orgHandler, projectId }, err);
        const detail = err instanceof Error ? err.message : 'Something went wrong.';
        setState({ ...IDLE, error: `Failed to create RAG service: ${detail}` });
      }
    },
    [orgUuid, qc],
  );

  const reset = useCallback(() => setState(IDLE), []);

  return { deploy, reset, ...state };
}
