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

import type { CronField } from './cronUtils';

// Kubernetes rejects a bad timeout or cron only when the CronJob is applied, long after the save returns 200.

/** Only a free plan has a ceiling (SCHEDULE_LIMITS). */
export const TIMEOUT_LIMITS = { min: 1 } as const;

export const CRON_FIELD_RANGES: Record<CronField, { min: number; max: number }> = {
  minute: { min: 0, max: 59 },
  hour: { min: 0, max: 23 },
  dom: { min: 1, max: 31 },
  month: { min: 1, max: 12 },
  dow: { min: 0, max: 7 },
};

const CRON_FIELD_NAMES: Record<CronField, string> = {
  minute: 'Minute',
  hour: 'Hour',
  dom: 'Day of month',
  month: 'Month',
  dow: 'Day of week',
};

/** Empty means "no timeout", which the platform accepts. */
export function validateTimeout(raw: string): string | undefined {
  const value = raw.trim();
  if (value === '') return undefined;
  if (!/^-?\d+$/.test(value)) return 'Enter a whole number of seconds';
  const n = Number(value);
  if (n < TIMEOUT_LIMITS.min) return `Must be at least ${TIMEOUT_LIMITS.min} second`;
  return undefined;
}

export function validateIntervalCount(count: number | ''): string | undefined {
  if (count === '') return 'Enter a number';
  if (!Number.isInteger(count) || count < 1) return 'Must be 1 or more';
  return undefined;
}

// A step of 0 parses as a number but yields `*/0`, which Kubernetes rejects.
function validateStep(step: string): boolean {
  return /^\d+$/.test(step) && Number(step) > 0;
}

function validateTerm(term: string, range: { min: number; max: number }): boolean {
  const [body, step, ...rest] = term.split('/');
  if (rest.length > 0) return false;
  if (step !== undefined && !validateStep(step)) return false;

  // Kubernetes validates with robfig/cron, which reads '?' as '*' in every field.
  if (body === '*' || body === '?') return true;

  const bounds = body.split('-');
  if (bounds.length > 2) return false;
  if (!bounds.every((b) => /^\d+$/.test(b))) return false;

  const numbers = bounds.map(Number);
  if (numbers.some((n) => n < range.min || n > range.max)) return false;
  // An inverted range (5-1) never matches, so Kubernetes treats it as invalid.
  if (numbers.length === 2 && numbers[0] > numbers[1]) return false;
  return true;
}

export function validateCronField(field: CronField, value: string): string | undefined {
  const raw = value.trim();
  const range = CRON_FIELD_RANGES[field];
  if (raw === '') return `${CRON_FIELD_NAMES[field]} is required`;
  const terms = raw.split(',');
  if (terms.some((t) => !validateTerm(t.trim(), range))) return `${CRON_FIELD_NAMES[field]} must be ${range.min}-${range.max}, or * / ranges / steps`;
  return undefined;
}

export function validateCronFields(fields: Record<CronField, string>): Partial<Record<CronField, string>> {
  const errors: Partial<Record<CronField, string>> = {};
  (Object.keys(fields) as CronField[]).forEach((field) => {
    const error = validateCronField(field, fields[field]);
    if (error) errors[field] = error;
  });
  return errors;
}

/** What a scheduled component runs. A knowledge base ingestion has its own free plan timeout. */
export type ScheduleKind = 'automation' | 'ingestion';

/** What each plan allows a scheduled task; null is no limit. ipaas-service enforces the same. */
export const SCHEDULE_LIMITS = {
  free: { minIntervalMinutes: 5, maxTimeoutSeconds: { automation: 300, ingestion: 7200 } },
  paid: { minIntervalMinutes: 1, maxTimeoutSeconds: { automation: null, ingestion: null } },
} as const;

/**
 * What a new schedule starts with on every plan: an automation every 5 minutes, an ingestion daily at
 * 00:00 UTC. An ingestion's timeout is set by ipaas-service.
 */
export const SCHEDULE_DEFAULTS = { cron: { automation: '*/5 * * * *', ingestion: '0 0 */1 * *' }, timeoutSeconds: { automation: 300, ingestion: 3600 } } as const;

/** A limit in seconds as the timeout field takes it, with its whole minutes or hours, e.g. "300 seconds (5 minutes)". */
export function describeSeconds(seconds: number): string {
  const [n, unit] = seconds % 3600 === 0 ? [seconds / 3600, 'hour'] : [seconds / 60, 'minute'];
  return `${seconds} seconds (${n} ${unit}${n === 1 ? '' : 's'})`;
}

/** The schedule an environment already runs with; a free plan may keep it unchanged. */
export interface SavedSchedule {
  /** Empty when the environment has no schedule. */
  cron: string;
  timeoutSeconds: number | null;
}

/** The values a cron field matches, ascending, or null when the field doesn't parse. */
function expandCronField(value: string, range: { min: number; max: number }): number[] | null {
  const matched = new Set<number>();
  for (const term of value.trim().split(',')) {
    if (!validateTerm(term.trim(), range)) return null;
    const [body, stepRaw] = term.trim().split('/');
    const step = stepRaw === undefined ? 1 : Number(stepRaw);
    let [start, end] = [range.min, range.max];
    if (body !== '*' && body !== '?') {
      const bounds = body.split('-').map(Number);
      start = bounds[0];
      // As robfig/cron reads it: "5/10" runs from 5 to the end of the range.
      end = bounds.length === 2 ? bounds[1] : stepRaw === undefined ? bounds[0] : range.max;
    }
    for (let n = start; n <= end; n += step) matched.add(n);
  }
  return [...matched].sort((a, b) => a - b);
}

/**
 * Shortest time, in minutes, between the starts of two runs of a 5-field cron, or null when it
 * doesn't parse. The last run of a day and the first of the next count as adjacent, as ipaas-service
 * counts them.
 */
export function shortestRunGapMinutes(cron: string): number | null {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const minutes = expandCronField(parts[0], CRON_FIELD_RANGES.minute);
  const hours = expandCronField(parts[1], CRON_FIELD_RANGES.hour);
  if (!minutes?.length || !hours?.length) return null;
  const times = hours.flatMap((h) => minutes.map((m) => h * 60 + m));
  let gap = 24 * 60 - times[times.length - 1] + times[0];
  for (let i = 1; i < times.length; i++) gap = Math.min(gap, times[i] - times[i - 1]);
  return gap;
}

/** Errors for a schedule the plan does not allow. A value equal to the saved one is not checked. */
export function validatePlanSchedule(cron: string, timeoutRaw: string, saved: SavedSchedule, plan: 'free' | 'paid', kind: ScheduleKind): { frequency?: string; timeout?: string } {
  const errors: { frequency?: string; timeout?: string } = {};
  const limits = SCHEDULE_LIMITS[plan];
  const gap = shortestRunGapMinutes(cron);
  if (gap !== null && gap < limits.minIntervalMinutes && cron.trim() !== saved.cron.trim()) {
    errors.frequency = plan === 'free' ? `Running more often than every ${limits.minIntervalMinutes} minutes needs a paid plan` : `Runs must start at least ${limits.minIntervalMinutes} minute apart`;
  }
  const maxTimeout = limits.maxTimeoutSeconds[kind];
  const timeout = timeoutRaw.trim() === '' ? NaN : Number(timeoutRaw);
  if (maxTimeout !== null && timeout > maxTimeout && timeout !== saved.timeoutSeconds) {
    errors.timeout = `A timeout over ${describeSeconds(maxTimeout)} needs a paid plan`;
  }
  return errors;
}
