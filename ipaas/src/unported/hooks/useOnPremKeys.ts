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
import { fetchOnPremKeySubscription, fetchOnPremKeys, generateOnPremKey, regenerateOnPremKey, renameOnPremKey, revokeOnPremKey } from '#api/onPremKeys';
import type { OnPremKey, OnPremKeySubscription } from '../../types/onPremKey';

const ROOT_KEY = 'onPremKeys';

export function useOnPremKeys(orgHandle: string) {
  return useQuery<OnPremKey[]>({
    queryKey: [ROOT_KEY, 'list', orgHandle],
    queryFn: () => fetchOnPremKeys(orgHandle),
    enabled: !!orgHandle,
  });
}

export function useOnPremKeySubscription(orgHandle: string) {
  return useQuery<OnPremKeySubscription>({
    queryKey: [ROOT_KEY, 'subscription', orgHandle],
    queryFn: () => fetchOnPremKeySubscription(orgHandle),
    enabled: !!orgHandle,
  });
}

export function useGenerateOnPremKey(orgHandle: string) {
  const qc = useQueryClient();
  return useMutation<OnPremKey, Error, string>({
    mutationFn: (displayName) => generateOnPremKey(orgHandle, displayName),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ROOT_KEY] }),
  });
}

export function useRegenerateOnPremKey(orgHandle: string) {
  const qc = useQueryClient();
  return useMutation<OnPremKey, Error, string>({
    mutationFn: (handle) => regenerateOnPremKey(orgHandle, handle),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ROOT_KEY] }),
  });
}

export function useRenameOnPremKey(orgHandle: string) {
  const qc = useQueryClient();
  return useMutation<OnPremKey, Error, { handle: string; displayName: string }>({
    mutationFn: ({ handle, displayName }) => renameOnPremKey(orgHandle, handle, displayName),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ROOT_KEY] }),
  });
}

export function useRevokeOnPremKey(orgHandle: string) {
  const qc = useQueryClient();
  return useMutation<OnPremKey, Error, string>({
    mutationFn: (handle) => revokeOnPremKey(orgHandle, handle),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ROOT_KEY] }),
  });
}
