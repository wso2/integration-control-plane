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
import { createExternalCiToken, getExternalCiTokens, revokeExternalCiToken } from '#api/externalCi';
import { IS_WIP } from '../../features';
import type { ExternalCiToken } from '../../types/externalCi';
import { useOrgUuid } from '../../hooks/useOrgUuid';

const ROOT = 'externalCi';

/** External CI is a WIP-only devops surface (cloud/icp API stubs throw). */
export function isExternalCiEnabled(): boolean {
  return IS_WIP;
}

export function useExternalCiTokens(projectId: string, componentId: string | undefined) {
  const orgUuid = useOrgUuid();
  return useQuery<ExternalCiToken[]>({
    queryKey: [ROOT, 'tokens', orgUuid, projectId, componentId],
    queryFn: () => getExternalCiTokens(orgUuid!, projectId, componentId!),
    enabled: isExternalCiEnabled() && !!orgUuid && !!projectId && !!componentId,
    retry: false,
  });
}

/** Create a token; the mutation result is the raw token string (shown once). */
export function useCreateExternalCiToken(projectId: string, componentId: string) {
  const orgUuid = useOrgUuid();
  const qc = useQueryClient();
  return useMutation<string, Error, string>({
    mutationFn: (tokenName) => {
      if (!orgUuid) throw new Error('Organization is not available.');
      return createExternalCiToken(orgUuid, projectId, componentId, tokenName);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [ROOT, 'tokens'] }),
  });
}

export function useRevokeExternalCiToken(projectId: string, componentId: string) {
  const orgUuid = useOrgUuid();
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (tokenId) => {
      if (!orgUuid) throw new Error('Organization is not available.');
      return revokeExternalCiToken(orgUuid, projectId, componentId, tokenId);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: [ROOT, 'tokens'] }),
  });
}
