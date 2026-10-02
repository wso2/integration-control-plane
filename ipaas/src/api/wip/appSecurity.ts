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

import { getOrgUuidFromToken } from '#auth';
import { apimClient, choreoClient } from './httpClients';
import type { Dataplane, IdentityProvider, IdentityProviderListResponse, IdentityProviderRequest, RoleGroupMappingResponse } from '../../types/appSecurity';

// Identity providers (key managers) live on the APIM admin API (apimClient), keyed
// by org UUID. Role-group mappings + data planes live on the choreo gateway; the
// authz-mgt service takes the org from the token.
const KM = '/api/am/admin/v2/key-managers';
const AUTHZ = '/authz-mgt/v1.0';
const orgParam = () => encodeURIComponent(getOrgUuidFromToken() ?? '');

export async function fetchIdentityProviders(): Promise<IdentityProvider[]> {
  const res = await apimClient.get<IdentityProviderListResponse>(`${KM}?organizationId=${orgParam()}`);
  return res.list;
}

export async function fetchIdentityProvider(id: string): Promise<IdentityProvider> {
  return apimClient.get<IdentityProvider>(`${KM}/${encodeURIComponent(id)}?organizationId=${orgParam()}`);
}

export async function createIdentityProvider(input: IdentityProviderRequest): Promise<IdentityProvider> {
  return apimClient.post<IdentityProvider>(`${KM}?organizationId=${orgParam()}`, input);
}

export async function updateIdentityProvider(id: string, input: IdentityProviderRequest): Promise<IdentityProvider> {
  return apimClient.put<IdentityProvider>(`${KM}/${encodeURIComponent(id)}?organizationId=${orgParam()}`, input);
}

export async function deleteIdentityProvider(id: string): Promise<void> {
  await apimClient.delete<void>(`${KM}/${encodeURIComponent(id)}?organizationId=${orgParam()}`);
}

export async function fetchRoleGroupMappings(): Promise<RoleGroupMappingResponse> {
  return choreoClient.post<RoleGroupMappingResponse>(`${AUTHZ}/get-role-group-mappings`, { startIndex: 0, count: 50 });
}

export async function updateRoleGroupMapping(roleId: string, groups: string[]): Promise<void> {
  await choreoClient.post<void>(`${AUTHZ}/update-role-group-mappings`, { roleId, groups });
}

export async function fetchDataplanes(): Promise<Dataplane[]> {
  // The dataplanes endpoint returns a bare array (no `{ data }` envelope).
  return choreoClient.get<Dataplane[]>(`/devops/1.0.0/api/v1/organizations/${orgParam()}/dataplanes`);
}
