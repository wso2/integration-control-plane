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

import type {
  User,
  MessageResult,
  ChangePasswordInput,
  ResetPasswordResult,
  CreateUserInput,
  UpdateUserInput,
  UpdateUserGroupsInput,
  PendingInvitation,
  InviteUsersInput,
  Role,
  RoleDetail,
  PermissionsResponse,
  CreateRoleInput,
  UpdateRoleInput,
  RoleGroupMapping,
  Group,
  CreateGroupInput,
  UpdateGroupInput,
  GroupRoleMapping,
  GroupUser,
  AddRolesToGroupInput,
  RemoveRoleFromGroupInput,
  AddUsersToGroupInput,
  RemoveUserFromGroupInput,
} from '../types/auth';

// TODO: implement using cloud APIs
const ni = (name: string): Promise<never> => Promise.reject(new Error(`[cloud] auth.${name}: not implemented`));

export const fetchCurrentUser = (_orgHandler: string, _userId: string): Promise<User> => ni('fetchCurrentUser');
export const fetchUsers = (_orgHandler: string): Promise<User[]> => ni('fetchUsers');
export const changePassword = (_input: ChangePasswordInput): Promise<MessageResult> => ni('changePassword');
export const resetPassword = (_orgHandler: string, _userId: string): Promise<ResetPasswordResult> => ni('resetPassword');
export const revokeUserTokens = (_orgHandler: string, _userId: string): Promise<MessageResult> => ni('revokeUserTokens');
export const unlockAccount = (_orgHandler: string, _userId: string): Promise<MessageResult> => ni('unlockAccount');
export const createUser = (_orgHandler: string, _input: CreateUserInput): Promise<unknown> => ni('createUser');
export const updateUser = (_orgHandler: string, _input: UpdateUserInput): Promise<unknown> => ni('updateUser');
export const updateUserGroups = (_orgHandler: string, _input: UpdateUserGroupsInput): Promise<unknown> => ni('updateUserGroups');
export const deleteUser = (_orgHandler: string, _userId: string): Promise<unknown> => ni('deleteUser');
export const fetchPendingInvitations = (_orgHandler: string): Promise<PendingInvitation[]> => ni('fetchPendingInvitations');
export const inviteUsers = (_orgHandler: string, _input: InviteUsersInput): Promise<unknown> => ni('inviteUsers');
export const deleteInvitation = (_orgHandler: string, _invitationId: string): Promise<unknown> => ni('deleteInvitation');
export const fetchRoles = (_orgHandler: string, _projectId?: string, _integrationId?: string): Promise<Role[]> => ni('fetchRoles');
export const fetchRoleDetail = (_orgHandler: string, _roleId: string, _projectId?: string, _integrationId?: string): Promise<RoleDetail> => ni('fetchRoleDetail');
export const fetchAllPermissions = (): Promise<PermissionsResponse> => ni('fetchAllPermissions');
export const createRole = (_orgHandler: string, _input: CreateRoleInput): Promise<unknown> => ni('createRole');
export const updateRole = (_orgHandler: string, _input: UpdateRoleInput): Promise<unknown> => ni('updateRole');
export const deleteRole = (_orgHandler: string, _roleId: string): Promise<unknown> => ni('deleteRole');
export const fetchRoleGroups = (_orgHandler: string, _roleId: string, _projectId?: string, _integrationId?: string): Promise<RoleGroupMapping[]> => ni('fetchRoleGroups');
export const fetchGroups = (_orgHandler: string, _projectId?: string, _integrationId?: string): Promise<Group[]> => ni('fetchGroups');
export const createGroup = (_orgHandler: string, _input: CreateGroupInput): Promise<unknown> => ni('createGroup');
export const updateGroup = (_orgHandler: string, _input: UpdateGroupInput): Promise<unknown> => ni('updateGroup');
export const deleteGroup = (_orgHandler: string, _groupId: string): Promise<unknown> => ni('deleteGroup');
export const fetchGroupRoles = (_orgHandler: string, _groupId: string, _projectId?: string, _integrationId?: string): Promise<GroupRoleMapping[]> => ni('fetchGroupRoles');
export const fetchGroupUsers = (_orgHandler: string, _groupId: string): Promise<GroupUser[]> => ni('fetchGroupUsers');
export const addRolesToGroup = (_orgHandler: string, _input: AddRolesToGroupInput, _projectId?: string, _componentId?: string): Promise<unknown> => ni('addRolesToGroup');
export const removeRoleFromGroup = (_orgHandler: string, _input: RemoveRoleFromGroupInput): Promise<unknown> => ni('removeRoleFromGroup');
export const addUsersToGroup = (_orgHandler: string, _input: AddUsersToGroupInput): Promise<unknown> => ni('addUsersToGroup');
export const removeUserFromGroup = (_orgHandler: string, _input: RemoveUserFromGroupInput): Promise<unknown> => ni('removeUserFromGroup');
