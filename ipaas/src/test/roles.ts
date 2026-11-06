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

// The roles' grants that reach the console's token: their ipaas:* and cloud:* permissions on
// urn:wso2:cloud and their amp:agent:* permissions on Agent Manager, as wso2cloud-deployment#5563
// grants them (thunder-idp.yaml, org-role-developer / -platform-engineer / -viewer).

export const DEVELOPER = (
  'cloud:organization:view cloud:project:read cloud:project:create cloud:project:update ipaas:environment:read ipaas:data-plane:read ipaas:deployment-pipeline:read ' +
  'ipaas:repository:read ipaas:integration:read ipaas:integration:create ipaas:integration:update ipaas:integration:build ipaas:integration:deploy ' +
  'ipaas:integration:execute ipaas:editor:use ipaas:config:read ipaas:endpoint:read ipaas:endpoint:update ipaas:endpoint:expose ipaas:endpoint:test ' +
  'ipaas:application:read ipaas:alert-rule:read ipaas:observability:log-read ipaas:observability:metric-read ' +
  'amp:agent:create amp:agent:read amp:agent:update amp:agent:delete amp:agent:build amp:agent:env-non-production amp:agent:suspend amp:agent:token-manage amp:agent:api-key-manage'
).split(' ');

export const PLATFORM_ENGINEER = (
  'cloud:organization:view cloud:environment:manage cloud:deployment-pipeline:manage cloud:alert:manage cloud:resource-type:manage cloud:project:read cloud:project:create ' +
  'cloud:project:update cloud:project:delete ipaas:environment:read ipaas:data-plane:read ipaas:deployment-pipeline:read ipaas:repository:read ' +
  'ipaas:repository:connect ipaas:integration:read ipaas:integration:create ipaas:integration:update ipaas:integration:delete ipaas:integration:build ipaas:integration:deploy ' +
  'ipaas:integration:execute ipaas:editor:use ipaas:config:read ipaas:package-registry:read ipaas:package-registry:manage ipaas:endpoint:read ' +
  'ipaas:endpoint:update ipaas:endpoint:expose ipaas:endpoint:test ipaas:endpoint:api-key-manage ipaas:application:read ipaas:application:manage ipaas:alert-rule:read ' +
  'ipaas:observability:log-read ipaas:observability:metric-read ' +
  'amp:agent:read amp:agent:build amp:agent:env-non-production amp:agent:env-production amp:agent:rollback amp:agent:suspend amp:agent:api-key-manage'
).split(' ');

export const VIEWER = (
  'cloud:organization:view cloud:project:read ipaas:environment:read ipaas:data-plane:read ipaas:deployment-pipeline:read ipaas:repository:read ipaas:integration:read ' +
  'ipaas:endpoint:read ipaas:application:read ipaas:alert-rule:read ipaas:observability:log-read ipaas:observability:metric-read ' +
  'amp:agent:read'
).split(' ');
