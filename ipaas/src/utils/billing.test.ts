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
import type { BillingOrg } from '../types/billing';

const org = (status: string, plan?: { code: string; type?: string }): BillingOrg => ({
  id: 'org',
  name: 'Org',
  subscription: { id: 's', org_id: 'org', status, plan },
});
const growth = { code: 'integration-platform-growth', type: 'paid' };
const trialPlan = { code: 'integration-platform-trial', type: 'free' };

describe('isPaidPlan', () => {
  it('is paid on a plan billing types as paid', () => {
    expect(isPaidPlan(org('active', growth))).toBe(true);
  });

  it('stays paid through the payment grace period', () => {
    expect(isPaidPlan(org('past_due', growth))).toBe(true);
  });

  it('is not paid on a free plan, including after a downgrade billing re-activated', () => {
    expect(isPaidPlan(org('active', trialPlan))).toBe(false);
    expect(isPaidPlan(org('trial', trialPlan))).toBe(false);
  });

  it('is not paid once the subscription is suspended, cancelled or inactive', () => {
    for (const status of ['suspended', 'cancelled', 'inactive']) {
      expect(isPaidPlan(org(status, growth))).toBe(false);
    }
  });

  it('is not paid when billing reports the plan without a type', () => {
    expect(isPaidPlan(org('active', { code: growth.code }))).toBe(false);
  });

  it('is not paid when billing could not be read or there is no plan', () => {
    expect(isPaidPlan(null)).toBe(false);
    expect(isPaidPlan(org('active'))).toBe(false);
    expect(isPaidPlan({ id: 'org', name: 'Org' })).toBe(false);
  });
});
