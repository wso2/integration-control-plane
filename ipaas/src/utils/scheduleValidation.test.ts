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
import { validateTimeout, validateIntervalCount, validateCronField, validateCronFields, TIMEOUT_LIMITS, shortestRunGapMinutes, validateFreePlanSchedule } from './scheduleValidation';

describe('validateTimeout', () => {
  it('accepts an empty value as "no timeout"', () => {
    expect(validateTimeout('')).toBeUndefined();
    expect(validateTimeout('  ')).toBeUndefined();
  });

  it('rejects the negative value Kubernetes refuses at apply time', () => {
    expect(validateTimeout('-1')).toBeDefined();
  });

  it('rejects zero, which would time the job out immediately', () => {
    expect(validateTimeout('0')).toBeDefined();
  });

  it('rejects non-numeric and fractional input', () => {
    expect(validateTimeout('abc')).toBeDefined();
    expect(validateTimeout('1.5')).toBeDefined();
  });

  it('accepts the minimum, and any longer timeout, which only a free plan limits', () => {
    expect(validateTimeout(String(TIMEOUT_LIMITS.min))).toBeUndefined();
    expect(validateTimeout('86401')).toBeUndefined();
    expect(validateTimeout('604800')).toBeUndefined();
  });
});

describe('validateIntervalCount', () => {
  it('requires a whole number of at least 1', () => {
    expect(validateIntervalCount(1)).toBeUndefined();
    expect(validateIntervalCount(90)).toBeUndefined();
    expect(validateIntervalCount(0)).toBeDefined();
    expect(validateIntervalCount(-2)).toBeDefined();
    expect(validateIntervalCount('')).toBeDefined();
  });
});

describe('validateCronField', () => {
  it('accepts wildcards, values, ranges, lists and steps', () => {
    expect(validateCronField('minute', '*')).toBeUndefined();
    expect(validateCronField('minute', '0')).toBeUndefined();
    expect(validateCronField('minute', '0-59')).toBeUndefined();
    expect(validateCronField('minute', '0,15,30')).toBeUndefined();
    expect(validateCronField('minute', '*/5')).toBeUndefined();
    expect(validateCronField('minute', '0-30/5')).toBeUndefined();
  });

  it('enforces each field its own range', () => {
    expect(validateCronField('minute', '59')).toBeUndefined();
    expect(validateCronField('minute', '60')).toBeDefined();
    expect(validateCronField('hour', '23')).toBeUndefined();
    expect(validateCronField('hour', '24')).toBeDefined();
    expect(validateCronField('dom', '0')).toBeDefined();
    expect(validateCronField('dom', '31')).toBeUndefined();
    expect(validateCronField('month', '12')).toBeUndefined();
    expect(validateCronField('month', '13')).toBeDefined();
    // 7 is Sunday, same as 0.
    expect(validateCronField('dow', '7')).toBeUndefined();
    expect(validateCronField('dow', '8')).toBeDefined();
  });

  it('rejects a zero step, which renders as */0', () => {
    expect(validateCronField('minute', '*/0')).toBeDefined();
  });

  it('rejects an inverted range', () => {
    expect(validateCronField('hour', '5-1')).toBeDefined();
  });

  it('rejects free text and empty fields', () => {
    expect(validateCronField('minute', 'not-a-cron')).toBeDefined();
    expect(validateCronField('minute', '')).toBeDefined();
  });
});

describe('validateCronFields', () => {
  it('returns no errors for the default every-minute schedule', () => {
    expect(validateCronFields({ minute: '*/1', hour: '*', dom: '*', month: '*', dow: '*' })).toEqual({});
  });

  it('reports only the offending fields', () => {
    const errors = validateCronFields({ minute: '60', hour: '*', dom: '*', month: '99', dow: '*' });
    expect(Object.keys(errors).sort()).toEqual(['minute', 'month']);
  });
});

describe("'?' wildcard", () => {
  it('accepts ? wherever * is accepted', () => {
    // Quartz-style schedules such as `0 0 ? * *` are pasted in and do run.
    expect(validateCronField('dom', '?')).toBeUndefined();
    expect(validateCronField('dow', '?')).toBeUndefined();
    expect(validateCronField('minute', '?')).toBeUndefined();
    expect(validateCronField('hour', '?/2')).toBeUndefined();
  });

  it('still rejects a zero step on ?', () => {
    expect(validateCronField('minute', '?/0')).toBeDefined();
  });
});

// The same cases as ipaas-service's TestRunsMoreOftenThanFiveMinutes, so both read a cron alike.
describe('shortestRunGapMinutes', () => {
  it.each([
    ['* * * * *', 1],
    ['*/1 * * * *', 1],
    ['*/4 * * * *', 4],
    ['0-4 * * * *', 1],
    ['0,3 * * * *', 3],
    ['1,59 * * * *', 2], // 59 to 1 of the next hour
    ['0,58 0,23 * * *', 2], // 23:58 to 00:00
    ['*/5 * * * *', 5],
    ['0,5,10 * * * *', 5],
    ['*/5 9-17 * * 1-5', 5],
    ['5/20 * * * *', 20], // 5, 25, 45, and 45 to 5 of the next hour
    ['0 * * * *', 60],
    ['0 0 * * *', 1440],
    ['0 0 31 2 *', 1440],
  ])('%s starts runs at least %i minutes apart', (cron, gap) => {
    expect(shortestRunGapMinutes(cron)).toBe(gap);
  });

  it('gives null for a cron it cannot read', () => {
    expect(shortestRunGapMinutes('not a cron')).toBeNull();
    expect(shortestRunGapMinutes('61 * * * *')).toBeNull();
  });
});

describe('validateFreePlanSchedule', () => {
  const none = { cron: '', timeoutSeconds: null };

  it('allows a schedule within the free limits', () => {
    expect(validateFreePlanSchedule('*/5 * * * *', '300', none)).toEqual({});
    expect(validateFreePlanSchedule('0 * * * *', '', none)).toEqual({});
  });

  it('refuses runs closer than 5 minutes and a timeout over 300 seconds', () => {
    const errors = validateFreePlanSchedule('*/1 * * * *', '301', none);
    expect(errors.frequency).toMatch(/more often than every 5 minutes needs a paid plan/);
    expect(errors.timeout).toMatch(/over 300 seconds needs a paid plan/);
  });

  it('keeps the values the environment already runs with', () => {
    expect(validateFreePlanSchedule('*/2 * * * *', '3600', { cron: '*/2 * * * *', timeoutSeconds: 3600 })).toEqual({});
  });

  it('checks a value that changes, even from one already over the limit', () => {
    const errors = validateFreePlanSchedule('*/1 * * * *', '900', { cron: '*/2 * * * *', timeoutSeconds: 3600 });
    expect(errors.frequency).toBeDefined();
    expect(errors.timeout).toBeDefined();
  });
});
