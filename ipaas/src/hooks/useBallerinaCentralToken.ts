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

import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { fetchBallerinaCentralToken, removeBallerinaCentralToken, saveBallerinaCentralToken } from '../api/packageRegistries';
import type { BallerinaCentralTokenStatus } from '../types/packageRegistries';
import { Scopes } from '../constants/permissions';
import { useCan } from './useCan';

const ROOT_KEY = 'ballerinaCentralToken';

/** Ballerina Central access token status for the org. */
/** Fetched only for roles that may read it: for others, ipaas-service would refuse. */
export function useBallerinaCentralToken(): UseQueryResult<BallerinaCentralTokenStatus> {
  const canRead = useCan()(Scopes.PACKAGE_REGISTRY_READ);
  return useQuery<BallerinaCentralTokenStatus>({
    queryKey: [ROOT_KEY],
    queryFn: fetchBallerinaCentralToken,
    enabled: canRead,
  });
}

export function useSaveBallerinaCentralToken() {
  const qc = useQueryClient();
  return useMutation<BallerinaCentralTokenStatus, Error, string>({
    mutationFn: saveBallerinaCentralToken,
    onSuccess: () => qc.invalidateQueries({ queryKey: [ROOT_KEY] }),
  });
}

export function useRemoveBallerinaCentralToken() {
  const qc = useQueryClient();
  return useMutation<void, Error, void>({
    mutationFn: () => removeBallerinaCentralToken(),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ROOT_KEY] }),
  });
}
