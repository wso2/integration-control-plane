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

import type { ProxyReconciliationStatus } from '../types/deployment';

/** Why a promotion is still worth making when the target already runs the source's build. */
export type PendingApiChange = 'pending-promotion' | 'api-settings' | 'visibility';

/**
 * The API change a promotion would carry between two environments running the same build, or null
 * when there is none. API settings (security, CORS, rate limiting) live in an API Platform build of
 * their own, and visibility is a deployment parameter that a promotion copies from the source, so
 * neither shows in the container build the environments share. A field an older BFF doesn't report
 * is never read as a difference.
 */
export function pendingApiChange(source: ProxyReconciliationStatus | null | undefined, target: ProxyReconciliationStatus | null | undefined): PendingApiChange | null {
  if (target?.status === 'PENDING_PROMOTION') return 'pending-promotion';
  if (!source || !target) return null;
  const targetEndpoints = new Map(target.endpoints.map((endpoint) => [endpoint.endpoint, endpoint]));
  const differs = (field: 'buildId' | 'exposure') =>
    source.endpoints.some((endpoint) => {
      const other = targetEndpoints.get(endpoint.endpoint)?.[field];
      return !!endpoint[field] && !!other && other !== endpoint[field];
    });
  if (differs('buildId')) return 'api-settings';
  if (differs('exposure')) return 'visibility';
  return null;
}

export const PENDING_API_CHANGE_TOOLTIP: Record<PendingApiChange, string> = {
  'pending-promotion': 'A visibility change for the target applies with this promotion',
  'api-settings': 'API settings changed since the last promotion',
  visibility: 'Endpoint visibility changed since the last promotion',
};
