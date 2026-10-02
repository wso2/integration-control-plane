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
 * Billing surface.
 *
 * billingApiBaseUrl is the versioned root of the billing user API (…/api/v1),
 * matching BILLING_SERVICE_URL — callers append only the
 * resource path. It is empty when the deployment has not wired the billing
 * endpoint — fetchBillingOrg then throws a clear error so callers can treat
 * billing as disabled rather than hitting a malformed URL.
 */

import { authenticatedFetch } from '#auth';
import { q } from './_client';
import type { BillingOrg } from '../../types/billing';

const billingBaseUrl = (): string => window.API_CONFIG?.billingApiBaseUrl ?? '';

/**
 * Fetch the billing org record for the given product. The call also triggers
 * org/subscription provisioning server-side on first login.
 */
export async function fetchBillingOrg(product: string): Promise<BillingOrg> {
  const base = billingBaseUrl();
  if (!base) throw new Error('billingApiBaseUrl is not configured');

  const res = await authenticatedFetch(`${base}/organization${q({ product })}`, {
    headers: { Accept: 'application/json' },
  });
  const text = await res.text().catch(() => '');
  if (!res.ok) throw new Error(`Billing API error ${res.status}: ${text || res.statusText}`);
  try {
    return JSON.parse(text) as BillingOrg;
  } catch {
    throw new Error(`Billing API returned invalid JSON (HTTP ${res.status})`);
  }
}
