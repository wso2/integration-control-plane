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

export const Permissions = {
  // Integration Management
  INTEGRATION_VIEW: 'integration_mgt:view',
  INTEGRATION_EDIT: 'integration_mgt:edit',
  INTEGRATION_MANAGE: 'integration_mgt:manage',

  // Environment Management
  ENVIRONMENT_MANAGE: 'environment_mgt:manage',
  ENVIRONMENT_MANAGE_NONPROD: 'environment_mgt:manage_nonprod',

  // Project Management
  PROJECT_VIEW: 'project_mgt:view',
  PROJECT_EDIT: 'project_mgt:edit',
  PROJECT_MANAGE: 'project_mgt:manage',

  // Observability
  OBSERVABILITY_VIEW_LOGS: 'observability_mgt:view_logs',
  OBSERVABILITY_VIEW_INSIGHTS: 'observability_mgt:view_insights',

  // User Management
  USER_MANAGE_USERS: 'user_mgt:manage_users',
  USER_UPDATE_USERS: 'user_mgt:update_users',
  USER_MANAGE_GROUPS: 'user_mgt:manage_groups',
  USER_MANAGE_ROLES: 'user_mgt:manage_roles',
  USER_UPDATE_GROUP_ROLES: 'user_mgt:update_group_roles',
  USER_VIEW: 'user_mgt:view',
} as const;

export const PROJECT_EDIT_PERMISSIONS = [Permissions.PROJECT_MANAGE, Permissions.PROJECT_EDIT];
export const ALL_ROLE_MODIFY_PERMISSIONS = [Permissions.USER_MANAGE_USERS, Permissions.USER_MANAGE_GROUPS, Permissions.USER_MANAGE_ROLES, Permissions.USER_UPDATE_GROUP_ROLES] as const;
export const ALL_USER_MGT_PERMISSIONS = [Permissions.USER_MANAGE_USERS, Permissions.USER_UPDATE_USERS, Permissions.USER_MANAGE_GROUPS, Permissions.USER_MANAGE_ROLES, Permissions.USER_UPDATE_GROUP_ROLES, Permissions.USER_VIEW] as const;

/**
 * Scopes of `urn:wso2:cloud` that ipaas-service checks on the actions the console gates. Keep in step
 * with ipaas-service's `middleware/authz`.
 */
export const Scopes = {
  PROJECT_CREATE: 'cloud:project:create',
  PROJECT_UPDATE: 'cloud:project:update',
  PROJECT_DELETE: 'cloud:project:delete',
  INTEGRATION_READ: 'ipaas:integration:read',
  INTEGRATION_CREATE: 'ipaas:integration:create',
  INTEGRATION_UPDATE: 'ipaas:integration:update',
  INTEGRATION_DELETE: 'ipaas:integration:delete',
  INTEGRATION_BUILD: 'ipaas:integration:build',
  INTEGRATION_DEPLOY: 'ipaas:integration:deploy',
  INTEGRATION_EXECUTE: 'ipaas:integration:execute',
  PACKAGE_REGISTRY_READ: 'ipaas:package-registry:read',
  PACKAGE_REGISTRY_MANAGE: 'ipaas:package-registry:manage',
  LOG_READ: 'ipaas:observability:log-read',
  CONFIG_MANAGE: 'cloud:resource-type:manage',
  ENVIRONMENT_MANAGE: 'cloud:environment:manage',
  ENVIRONMENT_READ: 'ipaas:environment:read',
  DEPLOYMENT_PIPELINE_MANAGE: 'cloud:deployment-pipeline:manage',
  ENDPOINT_UPDATE: 'ipaas:endpoint:update',
  ENDPOINT_TEST: 'ipaas:endpoint:test',
  REPOSITORY_CONNECT: 'ipaas:repository:connect',
  ENDPOINT_EXPOSE: 'ipaas:endpoint:expose',
  ENDPOINT_API_KEY_MANAGE: 'ipaas:endpoint:api-key-manage',
  APPLICATION_MANAGE: 'ipaas:application:manage',
  EDITOR_USE: 'ipaas:editor:use',
  /** ipaas-service hands these AI-agent writes to agent-manager with the user's token, and agent-manager checks them. */
  AGENT_CREATE: 'amp:agent:create',
  AGENT_UPDATE: 'amp:agent:update',
  AGENT_DELETE: 'amp:agent:delete',
  AGENT_API_KEY_MANAGE: 'amp:agent:api-key-manage',
} as const;
