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
import {
  addConnectionConfig,
  createGenaiService,
  deleteGenaiService,
  getConnectionConfig,
  getGenaiService,
  getGenaiServiceIdl,
  getProviderTemplate,
  listGenaiServices,
  listProviderTemplates,
  setGenaiServiceStatus,
  updateConnectionConfig,
  updateGenaiService,
  updateGenaiServiceIdl,
} from '#api/genaiServices';
import { buildConnectionConfigPayload, buildCreateServiceRequest, buildUpdateServiceRequest } from '../utils/genaiServices';
import { useOrgUuid } from '../../hooks/useOrgUuid';
import type { ConnectionConfigRequest, CreateGenAiServiceArgs, GenAiService, GenAiServiceEdit, GenAiServiceStatus } from '../../types/genaiServices';

const ROOT_KEY = 'genaiServices';

export function useGenaiServices(params: { query: string; offset: number; limit: number; projectId?: string }, enabled = true) {
  return useQuery({
    queryKey: [ROOT_KEY, 'list', params],
    queryFn: () => listGenaiServices(params),
    enabled,
    retry: false,
  });
}

export function useProviderTemplates() {
  return useQuery({
    queryKey: [ROOT_KEY, 'templates'],
    queryFn: () => listProviderTemplates(),
    retry: false,
  });
}

export function useProviderTemplate(templateId: string) {
  return useQuery({
    queryKey: [ROOT_KEY, 'template', templateId],
    queryFn: () => getProviderTemplate(templateId),
    enabled: !!templateId,
    retry: false,
  });
}

/**
 * Register a service end to end: create → read its connection-schema id → save the
 * per-environment connection values → set status to CREATED (registered, not published).
 * Resolves with the new service id.
 */
export function useCreateGenaiService(projectId?: string) {
  const qc = useQueryClient();
  const orgUuid = useOrgUuid();
  return useMutation<string, Error, CreateGenAiServiceArgs>({
    mutationFn: async ({ draft, endpoints }) => {
      if (!orgUuid) throw new Error('Organization is not available.');
      const created = await createGenaiService(buildCreateServiceRequest(orgUuid, draft, projectId));
      try {
        const service = await getGenaiService(created.id);
        const schemaId = service.connectionSchemas?.[0]?.id;
        if (schemaId) {
          await addConnectionConfig(created.id, schemaId, buildConnectionConfigPayload(endpoints));
        }
        await setGenaiServiceStatus(created.id, 'CREATED');
        return created.id;
      } catch (err) {
        // A step after creation failed — roll back the partial service so it isn't left orphaned.
        await deleteGenaiService(created.id).catch(() => undefined);
        throw err;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [ROOT_KEY, 'list'] }),
  });
}

export function useDeleteGenaiService() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (serviceId) => deleteGenaiService(serviceId),
    onSettled: () => qc.invalidateQueries({ queryKey: [ROOT_KEY, 'list'] }),
  });
}

// --- detail view ---

export function useGenaiService(serviceId: string) {
  return useQuery({
    queryKey: [ROOT_KEY, 'detail', serviceId],
    queryFn: () => getGenaiService(serviceId),
    enabled: !!serviceId,
    retry: false,
  });
}

export function useGenaiServiceIdl(serviceId: string) {
  return useQuery({
    queryKey: [ROOT_KEY, 'idl', serviceId],
    queryFn: () => getGenaiServiceIdl(serviceId),
    enabled: !!serviceId,
    retry: false,
  });
}

export function useConnectionConfig(serviceId: string, schemaId: string | undefined) {
  return useQuery({
    queryKey: [ROOT_KEY, 'config', serviceId, schemaId],
    queryFn: () => getConnectionConfig(serviceId, schemaId!),
    enabled: !!serviceId && !!schemaId,
    retry: false,
  });
}

function useInvalidateService(serviceId: string) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: [ROOT_KEY, 'detail', serviceId] });
    qc.invalidateQueries({ queryKey: [ROOT_KEY, 'list'] });
  };
}

export function useUpdateGenaiService(service: GenAiService) {
  const orgUuid = useOrgUuid();
  const invalidate = useInvalidateService(service.serviceId);
  return useMutation<GenAiService, Error, GenAiServiceEdit>({
    mutationFn: (edit) => {
      if (!orgUuid) throw new Error('Organization is not available.');
      return updateGenaiService(service.serviceId, buildUpdateServiceRequest(orgUuid, service, edit));
    },
    onSuccess: invalidate,
  });
}

export function useUpdateGenaiServiceIdl(serviceId: string) {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (content) => updateGenaiServiceIdl(serviceId, content),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ROOT_KEY, 'idl', serviceId] }),
  });
}

function useInvalidateConfig(serviceId: string) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: [ROOT_KEY, 'config', serviceId] });
}

export function useUpdateConnectionConfig(serviceId: string, schemaId: string) {
  const invalidate = useInvalidateConfig(serviceId);
  return useMutation<void, Error, ConnectionConfigRequest>({
    mutationFn: (request) => updateConnectionConfig(serviceId, schemaId, request),
    onSuccess: invalidate,
  });
}

export function useSetMarketplaceStatus(serviceId: string) {
  const invalidate = useInvalidateService(serviceId);
  return useMutation<void, Error, GenAiServiceStatus>({
    mutationFn: (status) => setGenaiServiceStatus(serviceId, status),
    onSuccess: invalidate,
  });
}
