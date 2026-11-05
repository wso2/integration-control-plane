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

import i18n, { currentLanguage } from '../i18n';

const dateTimeFormats = new Map<string, Intl.DateTimeFormat>();
const relativeFormats = new Map<string, Intl.RelativeTimeFormat>();

function dateTime(): Intl.DateTimeFormat {
  const language = currentLanguage();
  let format = dateTimeFormats.get(language);
  if (!format) dateTimeFormats.set(language, (format = new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' })));
  return format;
}

function relative(): Intl.RelativeTimeFormat {
  const language = currentLanguage();
  let format = relativeFormats.get(language);
  if (!format) relativeFormats.set(language, (format = new Intl.RelativeTimeFormat(language, { numeric: 'auto' })));
  return format;
}

const STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
  ['second', 1],
];

function parse(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

export function formatDateTime(iso: string | null | undefined): string {
  const ms = parse(iso);
  return ms === null ? i18n.t('common.noValue') : dateTime().format(ms);
}

/** "3 minutes ago", "in 2 hours". */
export function formatRelative(iso: string | null | undefined, now = Date.now()): string {
  const ms = parse(iso);
  if (ms === null) return i18n.t('common.noValue');
  const seconds = Math.round((ms - now) / 1000);
  if (Math.abs(seconds) < 45) return seconds >= 0 ? i18n.t('format.inAFewSeconds') : i18n.t('format.justNow');
  const [unit, size] = STEPS.find(([, s]) => Math.abs(seconds) >= s) ?? STEPS[STEPS.length - 1];
  return relative().format(Math.round(seconds / size), unit);
}

/** "1h 4m", "12s"; to now when the end is not there yet. */
export function formatDuration(startIso: string | null | undefined, endIso?: string | null, now = Date.now()): string {
  const start = parse(startIso);
  if (start === null) return i18n.t('common.noValue');
  const total = Math.max(0, Math.round(((parse(endIso) ?? now) - start) / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (d) return i18n.t('format.duration.days', { d, h });
  if (h) return i18n.t('format.duration.hours', { h, m });
  if (m) return i18n.t('format.duration.minutes', { m, s });
  return i18n.t('format.duration.seconds', { s });
}

/** The workflow engine qualifies task names as `<workflowType>.<name>`; this is the `<name>`. */
export function plainName(name: string): string {
  return name.slice(name.lastIndexOf('.') + 1);
}

/** "approvePurchase" → "Approve purchase", "purchase_approval" → "Purchase approval". */
export function humanize(name: string): string {
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
