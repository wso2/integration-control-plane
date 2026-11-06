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

import type { BillingOrg, BillingPlan } from '../types/billing';

/** Subscription statuses billing counts as entitled; past_due is the payment grace period. */
const ENTITLED_STATUSES = new Set(['active', 'trial', 'past_due']);

/**
 * Whether the org is on a paid plan: billing types the subscription's plan as paid, and its status is
 * entitled. The plan's own type decides, not a billing account, which billing keeps after a downgrade
 * to a free plan. An org or plan billing could not be read for (`null`) counts as not paid, matching
 * the BFF, which refuses paid features it cannot verify.
 */
export function isPaidPlan(org: BillingOrg | null, plan: BillingPlan | null): boolean {
  const sub = org?.subscription;
  return !!sub && ENTITLED_STATUSES.has(sub.status) && !!plan && plan.code === sub.plan?.code && plan.type === 'paid';
}

/** Whether the org's plan unlocks a paid feature, or the plan could not be read and the read can be retried. */
export type PlanAccess = { state: 'paid' } | { state: 'free' } | { state: 'unavailable'; retry: () => void };

const DAY_MS = 24 * 60 * 60 * 1000;

/** Length of the trial in days, from the period start to the trial end; undefined when billing does not give both. */
export function trialLengthDays(org: BillingOrg | null): number | undefined {
  const sub = org?.subscription;
  const start = Date.parse(sub?.current_period_start ?? '');
  const end = Date.parse(sub?.trial?.trial_end ?? '');
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return undefined;
  return Math.round((end - start) / DAY_MS);
}
