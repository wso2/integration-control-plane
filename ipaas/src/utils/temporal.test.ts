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

import { BffError } from '../api/_client';
import { temporalNameError, temporalPlanSpecLine, toCreateTemporalError } from './temporal';

describe('temporalNameError', () => {
  it.each([
    ['payments', ''],
    ['payments-wf-2', ''],
    ['', ''],
    ['wf', ''],
    ['a', ''],
    ['1payments', 'starting with a letter'],
    ['Payments', 'starting with a letter'],
    ['payments-', 'starting with a letter'],
    ['pay_ments', 'starting with a letter'],
  ])('%s', (name, expected) => {
    const error = temporalNameError(name, []);
    if (expected) expect(error).toContain(expected);
    else expect(error).toBe('');
  });

  it('enforces the provider limit when one is published', () => {
    expect(temporalNameError('a'.repeat(30), [], 29)).toBe('Use at most 29 characters.');
  });

  // Databases and Temporal servers share the organization's names.
  it('rejects a name any service already uses', () => {
    expect(temporalNameError('orders', ['orders'])).toContain('already exists');
  });
});

describe('temporalPlanSpecLine', () => {
  it('sums up a plan', () => {
    expect(temporalPlanSpecLine({ replicas: 2, cpu: '2.2', memory: '4.5Gi', historyShards: 16 })).toBe('2 replicas · 2.2 vCPU · 4.5 GB RAM · 16 history shards');
    expect(temporalPlanSpecLine({ replicas: 1, historyShards: 1 })).toBe('1 replica · 1 history shard');
  });
});

describe('toCreateTemporalError', () => {
  it('shows a provider refusal as written', () => {
    const error = toCreateTemporalError(new BffError(409, JSON.stringify({ error: 'Conflict', message: 'an instance named "payments" already exists' })));
    expect(error).toEqual({ title: 'The Temporal server could not be created', message: 'an instance named "payments" already exists' });
  });

  it('explains a suspended subscription', () => {
    expect(toCreateTemporalError(new BffError(403, '{}')).title).toBe('Your subscription is suspended');
  });
});
