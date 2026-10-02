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
import { choreoClient, withScopeRetry } from './httpClients';
import type { Cluster, PdpManagerPdp } from '../../types/dataPlanes';

// Data planes live on the choreo gateway devops service; the org UUID goes in the
// path / `organization_id` query param (same convention as appSecurity/cloudEditor).
const BASE = '/devops/1.0.0/api/v1';
const orgParam = () => encodeURIComponent(getOrgUuidFromToken() ?? '');

/** All data planes for the org (Cloud + Private). */
export function listDataPlanes(): Promise<Cluster[]> {
  return withScopeRetry(() => choreoClient.get<Cluster[]>(`${BASE}/organizations/${orgParam()}/dataplanes?includeEligibleCDPs=false`));
}

/** Private Data Planes as tracked by the PDP manager (includes ones still provisioning). */
export function listPdps(): Promise<PdpManagerPdp[]> {
  return withScopeRetry(() => choreoClient.get<PdpManagerPdp[]>(`${BASE}/pdps?organization_id=${orgParam()}`));
}
