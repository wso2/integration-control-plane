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

/**
 * Cloud (OpenChoreo) org / user API.
 *
 * Most org-related state is owned upstream by Thunder, which issues
 * org-scoped access tokens at sign-in. The functions here either read those
 * claims (fetchOrgs) or proxy through the BFF for namespace-scoped resources
 * (/orgs/*); registerUser / initOrg / validateOrgName are client-side no-ops
 * because the namespace is provisioned out-of-band.
 */

import type { OrgEntry, OrgComponentLimits, OrgSubscription, RegisterUserResponse } from '../../types/org';
import type { Project } from '../../types/project';
import { getAccessToken } from '#auth';
import { bff, items, seg, type ListResponse } from './_client';

// Read org claims from the access-token payload. Returns empty on any failure
// — callers treat that as "unscoped" rather than throwing.
async function readJwtOrgClaims(): Promise<{ handle?: string; uuid?: string }> {
  const token = await getAccessToken();
  if (!token) return {};
  try {
    // JWT payloads are base64url without padding; restore '+'/'/' and pad to a
    // multiple of 4 so atob doesn't reject otherwise-valid segments.
    const normalized = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    const payload = JSON.parse(atob(padded)) as Record<string, unknown>;
    const org = (payload.organization as Record<string, unknown> | undefined) ?? {};
    const handle = (org.handle as string | undefined) ?? (payload.ouHandle as string | undefined);
    const uuid = (org.uuid as string | undefined) ?? (payload.ouId as string | undefined);
    return { handle, uuid };
  } catch {
    return {};
  }
}

// Synthesize the caller's org as a 1-element list from the JWT — Thunder
// issues org-scoped tokens at sign-in so handle + uuid are always present.
// No BFF round-trip: the org switcher is disabled in cloud, and AppLayout
// only needs an entry where handle === scope.org for the header to render.
export const fetchOrgs = async (): Promise<OrgEntry[]> => {
  const { handle, uuid } = await readJwtOrgClaims();
  if (!handle && !uuid) return [];
  return [{ handle: handle ?? '', numericId: 0, ...(uuid ? { uuid } : {}) }];
};

// Alias kept for contract parity with the devant variant.
export const fetchOrgList = fetchOrgs;

// Org creation is owned by Thunder; nothing to validate here.
export const validateOrgName = (_orgName: string): Promise<boolean> => Promise.resolve(true);

// User identity + namespace provisioning are handled upstream by Thunder, so
// registerUser becomes a client-side no-op that synthesises the response from
// JWT claims (falling back to the supplied orgName) so the post-registration
// navigation in RegisterOrganization.tsx still works.
export const registerUser = async (orgName: string, _termsAccepted: boolean, _serviceName: string): Promise<RegisterUserResponse> => {
  const { handle, uuid } = await readJwtOrgClaims();
  const resolvedHandle = handle || orgName;
  return {
    organizations: [
      {
        handle: resolvedHandle,
        orgHandle: resolvedHandle,
        name: orgName,
        ...(uuid ? { id: 0 } : {}),
      },
    ],
  };
};

// Same reason as registerUser: namespace + default project + environment are
// already provisioned upstream by the time the user reaches OrgHome.
export const initOrg = async (_orgUuid: string, _region: string): Promise<void> => {};

export const fetchProjectsByOrgId = (orgNumericId: number): Promise<Project[]> => bff.get<ListResponse<Project>>(`/orgs/${seg(String(orgNumericId))}/projects`).then(items);

export const createDefaultProject = (orgNumericId: number, orgHandler: string, projectHandler?: string): Promise<{ id: string; handler: string }> =>
  bff.post<{ id: string; handler: string }>(`/orgs/${seg(String(orgNumericId))}/projects/default`, { orgHandler, projectHandler });

export const fetchOrgComponentLimits = (orgUuid: string): Promise<OrgComponentLimits> => bff.get<OrgComponentLimits>(`/orgs/${seg(orgUuid)}/component-limits`);

export const fetchOrgSubscriptions = (orgUuid: string): Promise<OrgSubscription[]> => bff.get<ListResponse<OrgSubscription>>(`/orgs/${seg(orgUuid)}/subscriptions`).then(items);
