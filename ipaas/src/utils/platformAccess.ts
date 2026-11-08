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

import type { BillingCatalogPlan, BillingSubscription } from '../types/billing';

/** What the org holds of a platform. 'unknown' means billing is off or failed, so the platform opens directly. */
export type PlatformAccess = 'entitled' | 'grace' | 'trial-ended' | 'suspended' | 'cancelled' | 'none' | 'unknown';

/** The dialog a card opens instead of the platform. */
export type PlatformPromptKind = 'start-trial' | 'trial-ended' | 'unsubscribed' | 'suspended';

// 'unknown' has none, so a billing outage can't lock anyone out of a console they pay for.
export const PROMPT_FOR: Partial<Record<PlatformAccess, PlatformPromptKind>> = {
  // The first console login starts the trial.
  none: 'start-trial',
  'trial-ended': 'trial-ended',
  cancelled: 'unsubscribed',
  suspended: 'suspended',
};

// An org can hold several rows for one product; the best one counts.
const RANK: Record<PlatformAccess, number> = { entitled: 6, grace: 5, 'trial-ended': 4, suspended: 3, cancelled: 2, none: 1, unknown: 0 };

// A trial that ran out keeps its trial plan but moves to suspended; the code check covers catalogs that omit type.
const isTrialPlan = (plan: BillingCatalogPlan | undefined): boolean => !!plan && ((plan.type === 'free' && !plan.free_forever) || (!plan.type && plan.code.includes('trial')));

function accessOf(sub: BillingSubscription, plan: BillingCatalogPlan | undefined): PlatformAccess {
  switch (sub.status) {
    case 'active':
    case 'trial':
      return 'entitled';
    // Payment is retried while the console still works.
    case 'past_due':
      return 'grace';
    case 'suspended':
      return sub.trial?.trial_end || isTrialPlan(plan) || sub.plan.code.includes('trial') ? 'trial-ended' : 'suspended';
    case 'cancelled':
      return 'cancelled';
    // First login activates it, as for an org with no row at all.
    case 'inactive':
      return 'none';
    default:
      return 'unknown';
  }
}

/** The org's access to one billed product, read as WSO2 Cloud's platform switcher reads it. */
export function platformAccess(code: string, subscriptions: BillingSubscription[], plans: BillingCatalogPlan[]): PlatformAccess {
  let best: PlatformAccess | undefined;
  for (const sub of subscriptions) {
    if (sub.product?.code !== code) continue;
    const access = accessOf(
      sub,
      plans.find((p) => p.code === sub.plan.code),
    );
    if (!best || RANK[access] > RANK[best]) best = access;
  }
  // With no row, a trial needs a plan to start on; without one there is nothing to offer.
  return best ?? (plans.some((p) => p.product === code) ? 'none' : 'unknown');
}
