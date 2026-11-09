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
import type { ScheduleLimits } from '../types/schedule';

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

/** A number of minutes in whole days, hours or minutes, e.g. "1 day", "2 hours" or "5 minutes". */
export function describeMinutes(minutes: number): string {
  const [n, unit] = minutes % 1440 === 0 ? [minutes / 1440, 'day'] : minutes % 60 === 0 ? [minutes / 60, 'hour'] : [minutes, 'minute'];
  return `${n} ${unit}${n === 1 ? '' : 's'}`;
}

/** A limit in seconds as the timeout field takes it, with its whole minutes or hours, e.g. "300 seconds (5 minutes)". */
export function describeSeconds(seconds: number): string {
  return seconds % 60 === 0 ? `${seconds} seconds (${describeMinutes(seconds / 60)})` : `${seconds} seconds`;
}

/** The schedule an environment already runs with; a free plan may keep it unchanged. */
export interface SavedSchedule {
  /** Empty when the environment has no schedule. */
  cron: string;
  timeoutSeconds: number | null;
  allowConcurrency: boolean | null;
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

/** Runs start at least this far apart on every plan: a CronJob starts at most one Job a minute. */
const MIN_RUN_INTERVAL_MINUTES = 1;

export interface PlanScheduleErrors {
  frequency?: string;
  timeout?: string;
  overlap?: string;
}

/**
 * Errors for a schedule the plan's limits do not allow. `free` says whether a paid plan would allow it, which
 * is what the message tells the user. A value equal to the saved one is not checked.
 */
export function validatePlanSchedule(cron: string, timeoutRaw: string, allowConcurrency: boolean, saved: SavedSchedule, limits: ScheduleLimits, free: boolean): PlanScheduleErrors {
  const errors: PlanScheduleErrors = {};
  const minInterval = Math.max(limits.minRunIntervalMinutes, MIN_RUN_INTERVAL_MINUTES);
  const gap = shortestRunGapMinutes(cron);
  if (gap !== null && gap < minInterval && cron.trim() !== saved.cron.trim()) {
    errors.frequency = free ? `The free plan supports intervals of ${describeMinutes(minInterval)} or longer. Upgrade to save this schedule.` : `Running more often than every ${describeMinutes(minInterval)} is not allowed.`;
  }
  const timeout = timeoutRaw.trim() === '' ? NaN : Number(timeoutRaw);
  if (limits.maxTimeoutSeconds > 0 && timeout > limits.maxTimeoutSeconds && timeout !== saved.timeoutSeconds) {
    errors.timeout = free ? `The free plan allows a timeout of up to ${describeSeconds(limits.maxTimeoutSeconds)}. Upgrade to save this schedule.` : `A timeout over ${describeSeconds(limits.maxTimeoutSeconds)} is not allowed.`;
  }
  if (allowConcurrency && !limits.allowOverlap && saved.allowConcurrency !== true) {
    errors.overlap = free ? 'Overlapping executions are available on paid plans. Upgrade to save this schedule.' : 'Overlapping executions are not allowed.';
  }
  return errors;
}
