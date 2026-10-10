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

const org = (subscription: BillingOrg['subscription']): BillingOrg => ({ id: 'org', name: 'Org', subscription });

describe('isPaidPlan', () => {
  it('is paid once billing has attached a billing account', () => {
    expect(isPaidPlan(org({ id: 's', org_id: 'org', status: 'active', billing_account_id: 'acct-1' }))).toBe(true);
  });

  it('is not paid on an active free plan, which has no billing account', () => {
    expect(isPaidPlan(org({ id: 's', org_id: 'org', status: 'active' }))).toBe(false);
    expect(isPaidPlan(org({ id: 's', org_id: 'org', status: 'active', billing_account_id: null }))).toBe(false);
  });

  it('is not paid during a trial', () => {
    expect(isPaidPlan(org({ id: 's', org_id: 'org', status: 'trial', trial: { days_remaining: 10, trial_end: '2026-11-01' } }))).toBe(false);
  });

  it('is not paid when billing could not be read or has no subscription', () => {
    expect(isPaidPlan(null)).toBe(false);
    expect(isPaidPlan(org(undefined))).toBe(false);
  });
});
