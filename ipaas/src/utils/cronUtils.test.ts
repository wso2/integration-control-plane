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

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { intervalToCron, cronToInterval, parseCronParts, buildCronFromParts, formatTimeUntil, describeCron, nextCronRunMs } from './cronUtils';

describe('intervalToCron', () => {
  it('Minute', () => {
    expect(intervalToCron(5, 'Minute')).toBe('*/5 * * * *');
    expect(intervalToCron(1, 'Minute')).toBe('*/1 * * * *');
  });

  it('Hour', () => {
    expect(intervalToCron(2, 'Hour')).toBe('0 */2 * * *');
  });

  it('Day', () => {
    expect(intervalToCron(3, 'Day')).toBe('0 0 */3 * *');
  });

  it('Week encodes as 7-day multiple', () => {
    expect(intervalToCron(1, 'Week')).toBe('0 0 */7 * *');
    expect(intervalToCron(2, 'Week')).toBe('0 0 */14 * *');
  });

  it('Month', () => {
    expect(intervalToCron(1, 'Month')).toBe('0 0 1 */1 *');
    expect(intervalToCron(3, 'Month')).toBe('0 0 1 */3 *');
  });

  it('clamps count to minimum of 1', () => {
    expect(intervalToCron(0, 'Minute')).toBe('*/1 * * * *');
    expect(intervalToCron(-5, 'Hour')).toBe('0 */1 * * *');
  });
});

describe('cronToInterval', () => {
  it('recognises minute intervals', () => {
    expect(cronToInterval('*/5 * * * *')).toEqual({ count: 5, unit: 'Minute' });
    expect(cronToInterval('*/1 * * * *')).toEqual({ count: 1, unit: 'Minute' });
  });

  it('recognises hour intervals', () => {
    expect(cronToInterval('0 */2 * * *')).toEqual({ count: 2, unit: 'Hour' });
  });

  it('recognises day intervals', () => {
    expect(cronToInterval('0 0 */3 * *')).toEqual({ count: 3, unit: 'Day' });
  });

  it('recognises week intervals (multiples of 7)', () => {
    expect(cronToInterval('0 0 */7 * *')).toEqual({ count: 1, unit: 'Week' });
    expect(cronToInterval('0 0 */14 * *')).toEqual({ count: 2, unit: 'Week' });
  });

  it('recognises month intervals', () => {
    expect(cronToInterval('0 0 1 */1 *')).toEqual({ count: 1, unit: 'Month' });
  });

  it('returns null for non-interval cron expressions', () => {
    expect(cronToInterval('0 9 * * 1')).toBeNull();
    expect(cronToInterval('0 0 15 * *')).toBeNull();
  });

  it('returns null for malformed input', () => {
    expect(cronToInterval('* *')).toBeNull();
    expect(cronToInterval('')).toBeNull();
  });
});

describe('parseCronParts / buildCronFromParts', () => {
  it('round-trips a cron expression', () => {
    const cron = '*/5 0 1-15 6,12 1';
    const parts = parseCronParts(cron);
    expect(parts).toEqual({ minute: '*/5', hour: '0', dom: '1-15', month: '6,12', dow: '1' });
    expect(buildCronFromParts(parts)).toBe(cron);
  });

  it('fills missing fields with *', () => {
    const parts = parseCronParts('5');
    expect(parts.hour).toBe('*');
    expect(parts.dom).toBe('*');
    expect(parts.month).toBe('*');
    expect(parts.dow).toBe('*');
  });
});

describe('formatTimeUntil', () => {
  const NOW = new Date('2026-06-22T12:00:00Z').getTime();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows seconds when under a minute', () => {
    expect(formatTimeUntil(NOW + 30_000)).toBe('30s');
  });

  it('shows 0s for past timestamps', () => {
    expect(formatTimeUntil(NOW - 5_000)).toBe('0s');
  });

  it('shows minutes and seconds', () => {
    expect(formatTimeUntil(NOW + 90_000)).toBe('1m 30s');
    expect(formatTimeUntil(NOW + 120_000)).toBe('2m');
  });

  it('shows hours and minutes', () => {
    expect(formatTimeUntil(NOW + 3_900_000)).toBe('1h 5m');
    expect(formatTimeUntil(NOW + 3_600_000)).toBe('1h');
  });
});

describe('describeCron', () => {
  it('describes interval-style expressions via cronToInterval', () => {
    expect(describeCron('*/5 * * * *')).toBe('Executes every 5 minutes');
    expect(describeCron('*/1 * * * *')).toBe('Executes every minute');
    expect(describeCron('0 */1 * * *')).toBe('Executes every hour');
    expect(describeCron('0 0 */1 * *')).toBe('Executes every day');
  });

  it('describes midnight', () => {
    expect(describeCron('0 0 * * *')).toBe('Executes at midnight');
  });

  it('describes a specific time', () => {
    expect(describeCron('30 9 * * *')).toBe('Executes at 9:30 AM');
    expect(describeCron('0 14 * * *')).toBe('Executes at 2:00 PM');
  });

  it('describes day of week', () => {
    expect(describeCron('0 9 * * 1')).toContain('Monday');
  });

  it('describes month', () => {
    expect(describeCron('0 0 1 6 *')).toContain('June');
  });

  it('returns raw cron for unrecognised expressions', () => {
    const raw = 'bad expression';
    expect(describeCron(raw)).toBe(raw);
  });
});

describe('nextCronRunMs', () => {
  const wallClockIn = (ms: number, timeZone: string): string => new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }).format(ms);

  it('resolves the due time against the configured zone, whatever the browser zone is', () => {
    const ms = nextCronRunMs('0 3 * * *', 'Asia/Tokyo');
    expect(ms).not.toBeNull();
    expect(wallClockIn(ms!, 'Asia/Tokyo')).toBe('03:00');
  });

  it('lands on a different instant for the same expression in a different zone', () => {
    const tokyo = nextCronRunMs('30 4 * * *', 'Asia/Tokyo');
    const utc = nextCronRunMs('30 4 * * *', 'UTC');
    expect(tokyo).not.toBeNull();
    expect(utc).not.toBeNull();
    expect(tokyo).not.toBe(utc);
    expect(wallClockIn(tokyo!, 'Asia/Tokyo')).toBe('04:30');
    expect(wallClockIn(utc!, 'UTC')).toBe('04:30');
  });

  it('reads a zone whose offset is not a whole hour', () => {
    const ms = nextCronRunMs('15 9 * * *', 'Asia/Kolkata');
    expect(wallClockIn(ms!, 'Asia/Kolkata')).toBe('09:15');
  });

  it('falls back to browser-local time for an unusable zone', () => {
    const ms = nextCronRunMs('0 3 * * *', 'Not/AZone');
    expect(ms).not.toBeNull();
    expect(new Date(ms!).getHours()).toBe(3);
    expect(new Date(ms!).getMinutes()).toBe(0);
  });

  it('stays on browser-local time when no zone is given', () => {
    const ms = nextCronRunMs('45 7 * * *');
    expect(new Date(ms!).getHours()).toBe(7);
    expect(new Date(ms!).getMinutes()).toBe(45);
  });

  it('returns a future instant', () => {
    const ms = nextCronRunMs('* * * * *', 'UTC');
    expect(ms).toBeGreaterThan(Date.now());
  });

  it('returns null for a malformed expression', () => {
    expect(nextCronRunMs('0 3 * *', 'UTC')).toBeNull();
  });

  describe('day of month and day of week', () => {
    // Wednesday 18 November 2026, 12:00 UTC.
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(Date.UTC(2026, 10, 18, 12, 0));
    });
    afterEach(() => vi.useRealTimers());

    it('fires on either when both are restricted', () => {
      expect(nextCronRunMs('0 9 1 * 1', 'UTC')).toBe(Date.UTC(2026, 10, 23, 9, 0)); // Monday, before the 1st
      expect(nextCronRunMs('0 9 20 * 1', 'UTC')).toBe(Date.UTC(2026, 10, 20, 9, 0)); // the 20th, a Friday
    });

    it('follows the restricted one when the other is unrestricted', () => {
      expect(nextCronRunMs('0 9 1 * *', 'UTC')).toBe(Date.UTC(2026, 11, 1, 9, 0));
      expect(nextCronRunMs('0 9 * * 1', 'UTC')).toBe(Date.UTC(2026, 10, 23, 9, 0));
      expect(nextCronRunMs('0 9 */1 * 1', 'UTC')).toBe(Date.UTC(2026, 10, 23, 9, 0));
    });

    it('reads a field as unrestricted when any of its alternatives is a wildcard', () => {
      expect(nextCronRunMs('0 9 1,* * 1', 'UTC')).toBe(Date.UTC(2026, 10, 23, 9, 0)); // every Monday
      expect(nextCronRunMs('0 9 *,1 * 1', 'UTC')).toBe(Date.UTC(2026, 10, 23, 9, 0));
    });

    it('reads a stepped wildcard as restricted, as the cluster does', () => {
      expect(nextCronRunMs('0 9 */2 * 1', 'UTC')).toBe(Date.UTC(2026, 10, 19, 9, 0)); // the 19th, an odd day, before Monday
    });

    it('still requires the month', () => {
      expect(nextCronRunMs('0 9 1 1 1', 'UTC')).toBe(Date.UTC(2027, 0, 1, 9, 0));
    });
  });
});
