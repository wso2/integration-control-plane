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

import { describe, expect, it } from 'vitest';
import { isPaidPlan } from './billing';
import type { BillingOrg, BillingPlan } from '../types/billing';

const org = (status: string, planCode?: string): BillingOrg => ({
  id: 'org',
  name: 'Org',
  subscription: { id: 's', org_id: 'org', status, plan: planCode ? { code: planCode } : undefined },
});
const growth: BillingPlan = { code: 'integration-platform-growth', type: 'paid' };
const trialPlan: BillingPlan = { code: 'integration-platform-trial', type: 'free' };

describe('isPaidPlan', () => {
  it('is paid on a plan billing types as paid', () => {
    expect(isPaidPlan(org('active', growth.code), growth)).toBe(true);
  });

  it('stays paid through the payment grace period', () => {
    expect(isPaidPlan(org('past_due', growth.code), growth)).toBe(true);
  });

  it('is not paid on a free plan, including after a downgrade billing re-activated', () => {
    expect(isPaidPlan(org('active', trialPlan.code), trialPlan)).toBe(false);
    expect(isPaidPlan(org('trial', trialPlan.code), trialPlan)).toBe(false);
  });

  it('is not paid once the subscription is suspended, cancelled or inactive', () => {
    for (const status of ['suspended', 'cancelled', 'inactive']) {
      expect(isPaidPlan(org(status, growth.code), growth)).toBe(false);
    }
  });

  it('is not paid when the plan read is for another plan than the subscription is on', () => {
    expect(isPaidPlan(org('active', trialPlan.code), growth)).toBe(false);
  });

  it('is not paid when billing or the plan could not be read', () => {
    expect(isPaidPlan(null, growth)).toBe(false);
    expect(isPaidPlan(org('active', growth.code), null)).toBe(false);
    expect(isPaidPlan({ id: 'org', name: 'Org' }, growth)).toBe(false);
  });
});
