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
 * (/orgs/*). Thunder provisions the org at sign-up, so the console never creates one.
 */

import type { OrgEntry, OrgComponentLimits, OrgSubscription } from '../types/org';
import { getAccessToken } from '../auth';
import { bff, items, seg, type ListResponse } from './_client';

// Read org claims from the access-token payload. Returns empty on any failure
// — callers treat that as "unscoped" rather than throwing.
async function readJwtOrgClaims(): Promise<{ handle?: string; uuid?: string; name?: string }> {
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
    const name = (org.name as string | undefined) ?? (payload.ouName as string | undefined);
    return { handle, uuid, name };
  } catch {
    return {};
  }
}

// Synthesize the caller's org as a 1-element list from the JWT — Thunder
// issues org-scoped tokens at sign-in so handle + uuid are always present.
// No BFF round-trip: the org switcher is disabled in cloud, and AppLayout
// only needs an entry where handle === scope.org for the header to render.
export const fetchOrgs = async (): Promise<OrgEntry[]> => {
  const { handle, uuid, name } = await readJwtOrgClaims();
  if (!handle && !uuid) return [];
  return [{ handle: handle ?? '', numericId: 0, ...(uuid ? { uuid } : {}), ...(name ? { name } : {}) }];
};

export const fetchOrgComponentLimits = (orgUuid: string): Promise<OrgComponentLimits> => bff.get<OrgComponentLimits>(`/orgs/${seg(orgUuid)}/component-limits`);

export const fetchOrgSubscriptions = (orgUuid: string): Promise<OrgSubscription[]> => bff.get<ListResponse<OrgSubscription>>(`/orgs/${seg(orgUuid)}/subscriptions`).then(items);
