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

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchCurrentUser,
  fetchUsers,
  changePassword,
  resetPassword,
  revokeUserTokens,
  unlockAccount,
  createUser,
  updateUser,
  updateUserGroups,
  deleteUser,
  fetchPendingInvitations,
  inviteUsers,
  deleteInvitation,
  fetchRoles,
  fetchRoleDetail,
  fetchAllPermissions,
  createRole,
  updateRole,
  deleteRole,
  fetchRoleGroups,
  fetchGroups,
  createGroup,
  updateGroup,
  deleteGroup,
  fetchGroupRoles,
  fetchGroupUsers,
  addRolesToGroup,
  removeRoleFromGroup,
  addUsersToGroup,
  removeUserFromGroup,
} from '../api/auth';

// ── Users ──

export function useCurrentUser(orgHandler: string, userId: string) {
  return useQuery({
    queryKey: ['currentUser', orgHandler, userId],
    queryFn: () => fetchCurrentUser(orgHandler, userId),
    enabled: !!userId,
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: changePassword,
  });
}

export function useResetPassword(orgHandler: string) {
  return useMutation({
    mutationFn: (userId: string) => resetPassword(orgHandler, userId),
  });
}

export function useRevokeUserTokens(orgHandler: string) {
  return useMutation({
    mutationFn: (userId: string) => revokeUserTokens(orgHandler, userId),
  });
}

export function useUnlockAccount(orgHandler: string) {
  return useMutation({
    mutationFn: (userId: string) => unlockAccount(orgHandler, userId),
  });
}

export function useUsers(orgHandler: string) {
  return useQuery({
    queryKey: ['users', orgHandler],
    queryFn: () => fetchUsers(orgHandler),
  });
}

export function useCreateUser(orgHandler: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { username: string; displayName: string; password: string }) => createUser(orgHandler, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users', orgHandler] }),
  });
}

export function useUpdateUser(orgHandler: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { userId: string; displayName: string; groupIds: string[] }) => updateUser(orgHandler, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users', orgHandler] });
      qc.invalidateQueries({ queryKey: ['groupUsers'] });
    },
  });
}

export function useUpdateUserGroups(orgHandler: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { userId: string; groupIds: string[] }) => updateUserGroups(orgHandler, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users', orgHandler] });
      qc.invalidateQueries({ queryKey: ['groupUsers'] });
    },
  });
}

export function useDeleteUser(orgHandler: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => deleteUser(orgHandler, userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users', orgHandler] }),
  });
}

export function usePendingInvitations(orgHandler: string) {
  return useQuery({
    queryKey: ['invitations', orgHandler],
    queryFn: () => fetchPendingInvitations(orgHandler),
    enabled: !!orgHandler,
  });
}

export function useInviteUsers(orgHandler: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { emails: string[]; groups: string[] }) => inviteUsers(orgHandler, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invitations', orgHandler] }),
  });
}

export function useDeleteInvitation(orgHandler: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (invitationId: string) => deleteInvitation(orgHandler, invitationId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invitations', orgHandler] }),
  });
}

// ── Roles ──

export function useRoles(orgHandler: string, projectId?: string, integrationId?: string) {
  return useQuery({
    queryKey: ['roles', orgHandler, projectId, integrationId],
    queryFn: () => fetchRoles(orgHandler, projectId, integrationId),
  });
}

export function useRoleDetail(orgHandler: string, roleId: string, projectId?: string, integrationId?: string) {
  return useQuery({
    queryKey: ['roleDetail', orgHandler, roleId, projectId, integrationId],
    queryFn: () => fetchRoleDetail(orgHandler, roleId, projectId, integrationId),
    enabled: !!roleId,
  });
}

export function useAllPermissions() {
  return useQuery({
    queryKey: ['permissions'],
    queryFn: fetchAllPermissions,
  });
}

export function useCreateRole(orgHandler: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { roleName: string; description: string; permissionIds: string[] }) => createRole(orgHandler, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['roles', orgHandler] }),
  });
}

export function useUpdateRole(orgHandler: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { roleId: string; roleName: string; description: string; permissionIds: string[] }) => updateRole(orgHandler, input),
    onSuccess: (_, input) => {
      qc.invalidateQueries({ queryKey: ['roles', orgHandler] });
      qc.invalidateQueries({ queryKey: ['roleDetail', orgHandler, input.roleId] });
    },
  });
}

export function useDeleteRole(orgHandler: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (roleId: string) => deleteRole(orgHandler, roleId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['roles', orgHandler] }),
  });
}

export function useRoleGroups(orgHandler: string, roleId: string, projectId?: string, integrationId?: string) {
  return useQuery({
    queryKey: ['roleGroups', orgHandler, roleId, projectId, integrationId],
    queryFn: () => fetchRoleGroups(orgHandler, roleId, projectId, integrationId),
    enabled: !!roleId,
  });
}

// ── Groups ──

export function useGroups(orgHandler: string, projectId?: string, integrationId?: string) {
  return useQuery({
    queryKey: ['groups', orgHandler, projectId, integrationId],
    queryFn: () => fetchGroups(orgHandler, projectId, integrationId),
  });
}

export function useCreateGroup(orgHandler: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { groupName: string; description: string }) => createGroup(orgHandler, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['groups', orgHandler] }),
  });
}

export function useUpdateGroup(orgHandler: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { groupId: string; groupName: string; description: string }) => updateGroup(orgHandler, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['groups', orgHandler] }),
  });
}

export function useDeleteGroup(orgHandler: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (groupId: string) => deleteGroup(orgHandler, groupId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['groups', orgHandler] }),
  });
}

export function useGroupRoles(orgHandler: string, groupId: string, projectId?: string, integrationId?: string) {
  return useQuery({
    queryKey: ['groupRoles', orgHandler, groupId, projectId, integrationId],
    queryFn: () => fetchGroupRoles(orgHandler, groupId, projectId, integrationId),
    enabled: !!groupId,
  });
}

export function useGroupUsers(orgHandler: string, groupId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['groupUsers', orgHandler, groupId],
    queryFn: () => fetchGroupUsers(orgHandler, groupId),
    enabled: !!groupId && (options?.enabled ?? true),
  });
}

export function useAddRolesToGroup(orgHandler: string, projectId?: string, componentId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { groupId: string; roleIds: string[]; envUuid?: string }) => addRolesToGroup(orgHandler, input, projectId, componentId),
    onSuccess: (_, input) => {
      qc.invalidateQueries({ queryKey: ['groupRoles', orgHandler, input.groupId] });
      qc.invalidateQueries({ queryKey: ['roleGroups'] });
    },
  });
}

export function useRemoveRoleFromGroup(orgHandler: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { groupId: string; mappingId: number }) => removeRoleFromGroup(orgHandler, input),
    onSuccess: (_, input) => {
      qc.invalidateQueries({ queryKey: ['groupRoles', orgHandler, input.groupId] });
      qc.invalidateQueries({ queryKey: ['roleGroups'] });
    },
  });
}

export function useAddUsersToGroup(orgHandler: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { groupId: string; userIds: string[] }) => addUsersToGroup(orgHandler, input),
    onSuccess: (_, input) => {
      qc.invalidateQueries({ queryKey: ['groupUsers', orgHandler, input.groupId] });
      qc.invalidateQueries({ queryKey: ['users', orgHandler] });
    },
  });
}

export function useRemoveUserFromGroup(orgHandler: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { groupId: string; userId: string }) => removeUserFromGroup(orgHandler, input),
    onSuccess: (_, input) => {
      qc.invalidateQueries({ queryKey: ['groupUsers', orgHandler, input.groupId] });
      qc.invalidateQueries({ queryKey: ['users', orgHandler] });
    },
  });
}
