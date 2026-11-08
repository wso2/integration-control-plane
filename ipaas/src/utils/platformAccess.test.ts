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
import type { BillingCatalogPlan, BillingSubscription } from '../types/billing';
import { platformAccess } from './platformAccess';

const plans: BillingCatalogPlan[] = [
  { code: 'agent-trial', product: 'agent', type: 'free' },
  { code: 'agent-pro', product: 'agent', type: 'paid' },
];
const sub = (status: BillingSubscription['status'], plan = 'agent-pro', extra: Partial<BillingSubscription> = {}): BillingSubscription => ({
  status,
  plan: { code: plan },
  product: { code: 'agent' },
  ...extra,
});

describe('platformAccess', () => {
  it('offers a trial when the org has no subscription but billing sells the product', () => {
    expect(platformAccess('agent', [], plans)).toBe('none');
  });

  it('makes no claim about a product billing does not sell', () => {
    expect(platformAccess('bijira', [], plans)).toBe('unknown');
  });

  it('reads active, trial and past due subscriptions as usable', () => {
    expect(platformAccess('agent', [sub('active')], plans)).toBe('entitled');
    expect(platformAccess('agent', [sub('trial', 'agent-trial')], plans)).toBe('entitled');
    expect(platformAccess('agent', [sub('past_due')], plans)).toBe('grace');
  });

  it('tells an ended trial apart from a suspended subscription', () => {
    expect(platformAccess('agent', [sub('suspended', 'agent-trial')], plans)).toBe('trial-ended');
    expect(platformAccess('agent', [sub('suspended', 'agent-pro', { trial: { trial_end: '2026-01-01' } })], plans)).toBe('trial-ended');
    expect(platformAccess('agent', [sub('suspended')], plans)).toBe('suspended');
  });

  it('reads cancelled and inactive subscriptions', () => {
    expect(platformAccess('agent', [sub('cancelled')], plans)).toBe('cancelled');
    expect(platformAccess('agent', [sub('inactive')], plans)).toBe('none');
  });

  it('takes the best of several subscriptions to one product', () => {
    expect(platformAccess('agent', [sub('cancelled'), sub('active')], plans)).toBe('entitled');
  });
});
