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
 * org-scoped access tokens at sign-in. The functions here either read the
 * session's org (fetchOrgs) or proxy through the BFF for namespace-scoped resources
 * (/orgs/*). Thunder provisions the org at sign-up, so the console never creates one.
 */

import type { OrgEntry, OrgComponentLimits, OrgSubscription } from '../types/org';
import { getSession } from '../auth';
import { bff, items, seg, type ListResponse } from './_client';

// Synthesize the caller's org as a 1-element list from the session — Thunder
// issues org-scoped tokens at sign-in so handle + uuid are always present.
// No BFF round-trip: the org switcher is disabled in cloud, and AppLayout
// only needs an entry where handle === scope.org for the header to render.
export const fetchOrgs = async (): Promise<OrgEntry[]> => {
  const session = getSession();
  if (!session) return [];
  const { orgHandle, orgUuid, orgName } = session;
  return [{ handle: orgHandle, numericId: 0, uuid: orgUuid, ...(orgName ? { name: orgName } : {}) }];
};

export const fetchOrgComponentLimits = (orgUuid: string): Promise<OrgComponentLimits> => bff.get<OrgComponentLimits>(`/orgs/${seg(orgUuid)}/component-limits`);

export const fetchOrgSubscriptions = (orgUuid: string): Promise<OrgSubscription[]> => bff.get<ListResponse<OrgSubscription>>(`/orgs/${seg(orgUuid)}/subscriptions`).then(items);
