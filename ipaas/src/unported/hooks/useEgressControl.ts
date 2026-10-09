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
import { createEgressPolicy, deleteEgressPolicy, fetchEgressPolicy, updateEgressPolicy } from '#api/egressControl';
import type { EgressPolicy, EgressPolicyRequest } from '../../types/egressPolicy';
import { useOrgUuid } from '../../hooks/useOrgUuid';

const ROOT_KEY = 'egressControl';

export function useEgressPolicy(projectId?: string) {
  const orgUuid = useOrgUuid();
  return useQuery<EgressPolicy | null>({
    queryKey: [ROOT_KEY, orgUuid, projectId ?? null],
    queryFn: () => fetchEgressPolicy(orgUuid!, projectId),
    enabled: !!orgUuid,
  });
}

export function useCreateEgressPolicy(projectId?: string) {
  const orgUuid = useOrgUuid();
  const qc = useQueryClient();
  return useMutation<EgressPolicy, Error, EgressPolicyRequest>({
    mutationFn: (input) => {
      if (!orgUuid) throw new Error('Organization is not available.');
      return createEgressPolicy(orgUuid, input, projectId);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [ROOT_KEY] }),
  });
}

export function useUpdateEgressPolicy(projectId?: string) {
  const orgUuid = useOrgUuid();
  const qc = useQueryClient();
  return useMutation<EgressPolicy, Error, { policyId: string; input: EgressPolicyRequest }>({
    mutationFn: ({ policyId, input }) => {
      if (!orgUuid) throw new Error('Organization is not available.');
      return updateEgressPolicy(orgUuid, policyId, input, projectId);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [ROOT_KEY] }),
  });
}

export function useDeleteEgressPolicy(projectId?: string) {
  const orgUuid = useOrgUuid();
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (policyId) => {
      if (!orgUuid) throw new Error('Organization is not available.');
      return deleteEgressPolicy(orgUuid, policyId, projectId);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [ROOT_KEY] }),
  });
}
