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

import { describe, it, expect } from 'vitest';
import { executionOutcome, formatCount, formatDuration, formatLatencyMs, formatDeployTime } from './insightsFormat';

describe('formatCount', () => {
  it('rounds values below 1000', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(42.4)).toBe('42');
    expect(formatCount(999)).toBe('999');
  });

  it('formats thousands with a k suffix', () => {
    expect(formatCount(1000)).toBe('1.0k');
    expect(formatCount(1500)).toBe('1.5k');
    expect(formatCount(999_499)).toBe('999.5k');
  });

  it('formats millions with an M suffix', () => {
    expect(formatCount(1_000_000)).toBe('1.00M');
    expect(formatCount(2_500_000)).toBe('2.50M');
  });

  it('rolls counts that would round to 1000.0k over to the M form', () => {
    expect(formatCount(999_949)).toBe('999.9k');
    expect(formatCount(999_950)).toBe('1.00M');
    expect(formatCount(999_999)).toBe('1.00M');
  });
});

describe('formatDuration', () => {
  it('shows seconds below a minute', () => {
    expect(formatDuration(0)).toBe('0s');
    expect(formatDuration(45)).toBe('45s');
  });

  it('shows whole minutes without a seconds part', () => {
    expect(formatDuration(120)).toBe('2m');
  });

  it('shows minutes and seconds together', () => {
    expect(formatDuration(200)).toBe('3m 20s');
  });

  it('normalizes values that round up to a whole minute', () => {
    expect(formatDuration(59.6)).toBe('1m');
    expect(formatDuration(119.6)).toBe('2m');
  });
});

describe('executionOutcome', () => {
  it('maps completed/succeeded/success (any case) to success', () => {
    expect(executionOutcome('COMPLETED')).toBe('success');
    expect(executionOutcome('Succeeded')).toBe('success');
    expect(executionOutcome('success')).toBe('success');
  });

  it('maps timeout-like statuses to timeout', () => {
    expect(executionOutcome('TIMEOUT')).toBe('timeout');
    expect(executionOutcome('timed out')).toBe('timeout');
    expect(executionOutcome('deadline exceeded')).toBe('timeout');
  });

  it('treats anything else as failure', () => {
    expect(executionOutcome('failed')).toBe('failure');
    expect(executionOutcome('')).toBe('failure');
  });
});

describe('formatLatencyMs', () => {
  it('shows milliseconds below one second', () => {
    expect(formatLatencyMs(96)).toBe('96 ms');
    expect(formatLatencyMs(412.6)).toBe('413 ms');
  });

  it('shows seconds at or above one second', () => {
    expect(formatLatencyMs(1000)).toBe('1.0 s');
    expect(formatLatencyMs(1800)).toBe('1.8 s');
  });
});

describe('formatDeployTime', () => {
  it('returns an empty string for unparseable input', () => {
    expect(formatDeployTime('not-a-date')).toBe('');
  });

  it('formats a valid ISO timestamp to a non-empty label', () => {
    expect(formatDeployTime('2026-07-14T09:32:00Z')).not.toBe('');
  });
});
