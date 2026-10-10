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

import type { BillingOrg } from '../types/billing';

/**
 * Whether the org is on a paid plan. Billing attaches a billing account when an org upgrades, while
 * its status reads "active" for free and paid plans alike. An org billing could not be read for
 * (`null`) counts as not paid, matching the BFF, which refuses paid features it cannot verify.
 */
export function isPaidPlan(org: BillingOrg | null): boolean {
  return !!org?.subscription?.billing_account_id;
}
