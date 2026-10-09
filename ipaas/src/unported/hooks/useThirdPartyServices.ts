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
import { addConnectionConfig, createGenaiService, deleteGenaiService, getGenaiService, listThirdPartyServices, setGenaiServiceStatus } from '#api/genaiServices';
import { buildCreateThirdPartyRequest } from '../utils/thirdPartyServices';
import { endpointsToConfigRequest } from '../utils/genaiServices';
import { useOrgUuid } from '../../hooks/useOrgUuid';
import type { CreateThirdPartyServiceArgs } from '../../types/thirdPartyServices';

const ROOT_KEY = 'thirdPartyServices';

export function useThirdPartyServices(params: { query: string; offset: number; limit: number; projectId?: string }, enabled = true) {
  return useQuery({
    queryKey: [ROOT_KEY, 'list', params],
    queryFn: () => listThirdPartyServices(params),
    enabled,
    retry: false,
  });
}

/** Register a third-party service: create → save connection config → mark CREATED. Rolls back a partial create. */
export function useCreateThirdPartyService(projectId?: string) {
  const qc = useQueryClient();
  const orgUuid = useOrgUuid();
  return useMutation<string, Error, CreateThirdPartyServiceArgs>({
    mutationFn: async ({ draft }) => {
      if (!orgUuid) throw new Error('Organization is not available.');
      const created = await createGenaiService(buildCreateThirdPartyRequest(orgUuid, draft, projectId));
      try {
        const service = await getGenaiService(created.id);
        const schemaId = service.connectionSchemas?.[0]?.id;
        if (schemaId) {
          await addConnectionConfig(created.id, schemaId, endpointsToConfigRequest(draft.endpoints));
        }
        await setGenaiServiceStatus(created.id, 'CREATED');
        return created.id;
      } catch (err) {
        await deleteGenaiService(created.id).catch(() => undefined);
        throw err;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [ROOT_KEY, 'list'] }),
  });
}

export function useDeleteThirdPartyService() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (serviceId) => deleteGenaiService(serviceId),
    onSettled: () => qc.invalidateQueries({ queryKey: [ROOT_KEY, 'list'] }),
  });
}
