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

import { authenticatedFetch } from '../auth';
import { analyticsViewerTokenUrl } from '../paths';

export async function fetchMoesifViewerToken(base: string, signal: AbortSignal): Promise<string> {
  const response = await authenticatedFetch(analyticsViewerTokenUrl(base), {
    signal,
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) throw new Error('You do not have permission to view API Insights for this organization.');
    if (response.status === 404) throw new Error('API Insights is not available for this organization yet.');
    // ipaas-service answers 503 "API Insights not configured" when it has no upstream; other 503s are transient.
    if (response.status === 503 && (await response.text().catch(() => '')).includes('not configured')) throw new Error('API Insights is not configured for this deployment. Contact your administrator to enable it.');
    throw new Error('API Insights is temporarily unavailable. Please try again.');
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!payload || typeof payload !== 'object' || !('token' in payload) || typeof payload.token !== 'string' || !payload.token.trim()) {
    throw new Error('Unable to load API Insights. The server returned an invalid viewer token.');
  }
  return payload.token;
}
