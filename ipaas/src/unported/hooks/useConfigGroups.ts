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
import { checkConfigGroupName, createConfigGroup, deleteConfigGroup, getConfigGroup, getConfigGroupUsage, listConfigGroups, updateConfigGroup } from '#api/configGroups';
import { useOrgUuid } from '../../hooks/useOrgUuid';
import type { CreateConfigGroupRequest, EditConfigGroupRequest } from '../../types/configGroups';

const ROOT_KEY = 'configGroups';

export function useConfigGroups() {
  const orgUuid = useOrgUuid();
  return useQuery({
    queryKey: [ROOT_KEY, 'list', orgUuid],
    queryFn: () => listConfigGroups(),
    enabled: !!orgUuid,
    retry: false,
  });
}

/**
 * Live name-availability check. `enabled` should be driven by a debounced, non-empty
 * candidate so we don't fire on every keystroke.
 */
export function useConfigGroupNameAvailability(candidate: string, enabled: boolean) {
  return useQuery({
    queryKey: [ROOT_KEY, 'name-check', candidate],
    queryFn: () => checkConfigGroupName(candidate),
    enabled: enabled && candidate.length > 0,
    retry: false,
    staleTime: 30 * 1000,
  });
}

export function useConfigGroup(groupUuid: string) {
  return useQuery({
    queryKey: [ROOT_KEY, 'detail', groupUuid],
    queryFn: () => getConfigGroup(groupUuid),
    enabled: !!groupUuid,
    retry: false,
  });
}

export function useConfigGroupUsage(configGroupId: string, enabled = true) {
  return useQuery({
    queryKey: [ROOT_KEY, 'usage', configGroupId],
    queryFn: () => getConfigGroupUsage(configGroupId),
    enabled: enabled && !!configGroupId,
    retry: false,
  });
}

export function useCreateConfigGroup() {
  const qc = useQueryClient();
  const orgUuid = useOrgUuid();
  return useMutation({
    mutationFn: (request: CreateConfigGroupRequest) => createConfigGroup(request),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ROOT_KEY, 'list', orgUuid] }),
  });
}

export function useUpdateConfigGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (request: EditConfigGroupRequest) => updateConfigGroup(request),
    onSuccess: (_data, request) => {
      qc.invalidateQueries({ queryKey: [ROOT_KEY, 'list'] });
      qc.invalidateQueries({ queryKey: [ROOT_KEY, 'detail', request.groupUuid] });
    },
  });
}

export function useDeleteConfigGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (groupUuid: string) => deleteConfigGroup(groupUuid),
    onSettled: () => qc.invalidateQueries({ queryKey: [ROOT_KEY, 'list'] }),
  });
}
