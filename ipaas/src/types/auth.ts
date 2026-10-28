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

export interface User {
  userId: string;
  username: string;
  displayName: string;
  isSuperAdmin: boolean;
  pictureUrl?: string;
  groups: { groupId: string; uuid?: string; groupName: string; groupDescription: string }[];
  groupCount: number;
}

export interface Role {
  roleId: string;
  roleName: string;
  description: string;
  orgId: number;
  /** Tag handles attached to the role (e.g. `admin`). */
  tags?: string[];
}

export interface Permission {
  permissionId: string;
  permissionName: string;
  permissionDomain: string;
  resourceType: string;
  action: string;
  description: string;
}

export interface PermissionsResponse {
  permissions: Permission[];
  groupedByDomain: Record<string, Permission[]>;
}

export interface RoleDetail extends Role {
  permissions: Permission[];
}

export interface Group {
  /** The group handle — used to address the group in `/groups/v2/{handle}` paths. */
  groupId: string;
  /** The group UUID — used in user-side bodies (`groupUUIDs`). */
  uuid?: string;
  groupName: string;
  description: string;
  /** Number of roles assigned to this group (the "Assigned to" count). */
  roleCount?: number;
}

export interface GroupRoleMapping {
  id: number;
  groupId: string;
  roleId: string;
  roleName: string;
  roleDescription: string;
  orgUuid: string;
  projectUuid: string | null;
  envUuid: string | null;
  integrationUuid: string | null;
}

export interface GroupUser {
  userId: string;
  username: string;
  displayName: string;
}

export interface RoleGroupMapping {
  id: number;
  groupId: string;
  groupName?: string;
  groupDescription?: string;
  roleId: string;
  orgUuid: string;
  projectUuid: string | null;
  envUuid: string | null;
  integrationUuid: string | null;
}

/** A pending org invitation. */
export interface PendingInvitation {
  id: string;
  email: string;
  groups: string[];
}

export interface InviteUsersInput {
  emails: string[];
  /** Group handles to add the invitees to. */
  groups: string[];
}

// ── Auth mutation input types ──

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export interface CreateUserInput {
  username: string;
  displayName: string;
  password: string;
}

export interface UpdateUserInput {
  userId: string;
  displayName: string;
  groupIds: string[];
}

export interface UpdateUserGroupsInput {
  userId: string;
  groupIds: string[];
}

export interface CreateRoleInput {
  roleName: string;
  description: string;
  permissionIds: string[];
}

export interface UpdateRoleInput {
  roleId: string;
  roleName: string;
  description: string;
  permissionIds: string[];
}

export interface CreateGroupInput {
  groupName: string;
  description: string;
}

export interface UpdateGroupInput {
  groupId: string;
  groupName: string;
  description: string;
}

export interface AddRolesToGroupInput {
  groupId: string;
  roleIds: string[];
  envUuid?: string;
}

export interface RemoveRoleFromGroupInput {
  groupId: string;
  mappingId: number;
}

export interface AddUsersToGroupInput {
  groupId: string;
  userIds: string[];
}

export interface RemoveUserFromGroupInput {
  groupId: string;
  userId: string;
}

// ── Auth mutation result types ──

export interface MessageResult {
  message: string;
}

export interface ResetPasswordResult {
  password: string;
  message: string;
}
