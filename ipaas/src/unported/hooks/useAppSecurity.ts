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
import { createIdentityProvider, deleteIdentityProvider, fetchDataplanes, fetchIdentityProvider, fetchIdentityProviders, fetchRoleGroupMappings, updateIdentityProvider, updateRoleGroupMapping } from '#api/appSecurity';
import type { Dataplane, IdentityProvider, IdentityProviderRequest, RoleGroupMappingResponse } from '../../types/appSecurity';

const ROOT_KEY = 'appSecurity';

export function useIdentityProviders() {
  return useQuery<IdentityProvider[]>({
    queryKey: [ROOT_KEY, 'idps'],
    queryFn: fetchIdentityProviders,
  });
}

export function useIdentityProvider(id: string | null) {
  return useQuery<IdentityProvider>({
    queryKey: [ROOT_KEY, 'idp', id],
    queryFn: () => fetchIdentityProvider(id!),
    enabled: !!id,
  });
}

export function useCreateIdentityProvider() {
  const qc = useQueryClient();
  return useMutation<IdentityProvider, Error, IdentityProviderRequest>({
    mutationFn: (input) => createIdentityProvider(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ROOT_KEY, 'idps'] }),
  });
}

export function useUpdateIdentityProvider() {
  const qc = useQueryClient();
  return useMutation<IdentityProvider, Error, { id: string; input: IdentityProviderRequest }>({
    mutationFn: ({ id, input }) => updateIdentityProvider(id, input),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: [ROOT_KEY, 'idps'] });
      qc.invalidateQueries({ queryKey: [ROOT_KEY, 'idp', id] });
    },
  });
}

export function useDeleteIdentityProvider() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => deleteIdentityProvider(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: [ROOT_KEY, 'idps'] });
      qc.removeQueries({ queryKey: [ROOT_KEY, 'idp', id] });
    },
  });
}

/** Enable/disable an IdP: the API needs the full object, so we fetch it then PUT with `enabled` flipped. */
export function useToggleIdentityProvider() {
  const qc = useQueryClient();
  return useMutation<IdentityProvider, Error, { id: string; enabled: boolean }>({
    mutationFn: async ({ id, enabled }) => {
      const detail = await fetchIdentityProvider(id);
      const { id: _id, ...rest } = detail;
      return updateIdentityProvider(id, { ...rest, enabled });
    },
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: [ROOT_KEY, 'idps'] });
      qc.invalidateQueries({ queryKey: [ROOT_KEY, 'idp', id] });
    },
  });
}

export function useRoleGroupMappings() {
  return useQuery<RoleGroupMappingResponse>({
    queryKey: [ROOT_KEY, 'roleGroupMappings'],
    queryFn: fetchRoleGroupMappings,
  });
}

export function useUpdateRoleGroupMapping() {
  const qc = useQueryClient();
  return useMutation<void, Error, { roleId: string; groups: string[] }>({
    mutationFn: ({ roleId, groups }) => updateRoleGroupMapping(roleId, groups),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ROOT_KEY, 'roleGroupMappings'] }),
  });
}

export function useDataplanes() {
  return useQuery<Dataplane[]>({
    queryKey: [ROOT_KEY, 'dataplanes'],
    queryFn: fetchDataplanes,
  });
}
