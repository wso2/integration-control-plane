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

export interface BillingOrg {
  id: string;
  name: string;
  owner_email?: string;
  subscription?: {
    id: string;
    org_id: string;
    status: 'trial' | 'active' | 'past_due' | 'cancelled' | string;
    /** Set once the org upgrades to a paid plan, absent on free plans; `status` reads "active" for both. */
    billing_account_id?: string | null;
    billing_period?: string;
    current_period_start?: string;
    current_period_end?: string;
    trial?: {
      days_remaining: number;
      trial_end: string;
    };
    product?: { id: string; name: string; code: string };
  };
}
