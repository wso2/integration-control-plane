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
import { createAuthzRole, deleteAuthzRole, fetchAuthzRoles, updateAuthzRole } from '#api/projectAuthz';
import type { AuthzRole, CreateAuthzRoleInput, UpdateAuthzRoleInput } from '../../types/projectAuthz';

const ROOT_KEY = 'projectAuthz';

export function useAuthzRoles(projectId?: string) {
  return useQuery<AuthzRole[]>({
    queryKey: [ROOT_KEY, 'roles', projectId],
    queryFn: () => fetchAuthzRoles(projectId!),
    enabled: !!projectId,
  });
}

export function useCreateAuthzRole(projectId?: string) {
  const qc = useQueryClient();
  return useMutation<AuthzRole, Error, CreateAuthzRoleInput>({
    mutationFn: (input) => {
      if (!projectId) throw new Error('Project is not available.');
      return createAuthzRole(projectId, input);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [ROOT_KEY, 'roles', projectId] }),
  });
}

export function useUpdateAuthzRole(projectId?: string) {
  const qc = useQueryClient();
  return useMutation<AuthzRole, Error, UpdateAuthzRoleInput>({
    mutationFn: (input) => {
      if (!projectId) throw new Error('Project is not available.');
      return updateAuthzRole(projectId, input);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [ROOT_KEY, 'roles', projectId] }),
  });
}

export function useDeleteAuthzRole(projectId?: string) {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (roleId) => deleteAuthzRole(roleId),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ROOT_KEY, 'roles', projectId] }),
  });
}
