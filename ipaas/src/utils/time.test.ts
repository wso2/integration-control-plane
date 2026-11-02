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
import { getAge, formatDate, formatDistanceToNow, formatElapsed } from './time';

describe('getAge', () => {
  it('returns empty string when to is before from', () => {
    expect(getAge(1000, 500)).toBe('');
  });

  it('returns "just now" for sub-minute diff', () => {
    expect(getAge(0, 30_000)).toBe('just now');
  });

  it('returns minutes', () => {
    expect(getAge(0, 5 * 60_000)).toBe('5 minutes');
    expect(getAge(0, 60_000)).toBe('1 minute');
  });

  it('returns hours', () => {
    expect(getAge(0, 3 * 3_600_000)).toBe('3 hours');
    expect(getAge(0, 3_600_000)).toBe('1 hour');
  });

  it('returns days', () => {
    expect(getAge(0, 3 * 86_400_000)).toBe('3 days');
    expect(getAge(0, 86_400_000)).toBe('1 day');
  });

  it('returns singular month', () => {
    // 60 days / 30.44 = 1.97 → 1 month
    expect(getAge(0, 60 * 86_400_000)).toBe('1 month');
  });

  it('returns plural months', () => {
    // 61 days / 30.44 = 2.003 → 2 months
    expect(getAge(0, 61 * 86_400_000)).toBe('2 months');
  });

  it('returns years', () => {
    expect(getAge(0, 400 * 86_400_000)).toBe('1 year');
    expect(getAge(0, 800 * 86_400_000)).toBe('2 years');
  });
});

describe('formatDate', () => {
  it('formats a valid ISO date', () => {
    expect(formatDate('2026-07-30T10:00:00Z')).toBe(new Date('2026-07-30T10:00:00Z').toLocaleDateString());
  });

  it('returns an empty string for missing or invalid input', () => {
    expect(formatDate(undefined)).toBe('');
    expect(formatDate(null)).toBe('');
    expect(formatDate('')).toBe('');
    expect(formatDate('not-a-date')).toBe('');
  });
});

describe('formatDistanceToNow', () => {
  const NOW = new Date('2026-06-22T12:00:00Z').getTime();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "Just now" for less than a minute ago', () => {
    const date = new Date(NOW - 30_000).toISOString();
    expect(formatDistanceToNow(date)).toBe('Just now');
  });

  it('returns minutes ago', () => {
    const date = new Date(NOW - 45 * 60_000).toISOString();
    expect(formatDistanceToNow(date)).toBe('45 min ago');
  });

  it('returns singular hour ago', () => {
    const date = new Date(NOW - 3_600_000).toISOString();
    expect(formatDistanceToNow(date)).toBe('1 hour ago');
  });

  it('returns plural hours ago', () => {
    const date = new Date(NOW - 5 * 3_600_000).toISOString();
    expect(formatDistanceToNow(date)).toBe('5 hours ago');
  });

  it('returns singular day ago', () => {
    const date = new Date(NOW - 86_400_000).toISOString();
    expect(formatDistanceToNow(date)).toBe('1 day ago');
  });

  it('returns plural days ago', () => {
    const date = new Date(NOW - 3 * 86_400_000).toISOString();
    expect(formatDistanceToNow(date)).toBe('3 days ago');
  });

  it('returns an empty string for an invalid timestamp', () => {
    expect(formatDistanceToNow('not-a-date')).toBe('');
  });
});

describe('formatElapsed', () => {
  const start = '2026-10-30T09:50:00.000Z';
  const at = (seconds: number) => Date.parse(start) + seconds * 1000;

  it('says under a minute before the first minute is over', () => {
    expect(formatElapsed(start, at(0))).toBe('under a minute');
    expect(formatElapsed(start, at(59))).toBe('under a minute');
  });

  it('counts minutes, then hours and minutes', () => {
    expect(formatElapsed(start, at(60))).toBe('1 min');
    expect(formatElapsed(start, at(14 * 60 + 30))).toBe('14 min');
    expect(formatElapsed(start, at(60 * 60))).toBe('1 h');
    expect(formatElapsed(start, at(62 * 60))).toBe('1 h 2 min');
  });

  it('returns empty for an invalid or future start', () => {
    expect(formatElapsed('not a date', at(0))).toBe('');
    expect(formatElapsed(start, at(-5))).toBe('');
  });
});
