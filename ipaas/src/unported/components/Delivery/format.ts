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

// Duration/label helpers for Delivery insights — ports of Devant's
// cioDashboard utils (customFormatDuration/getConversionTimeUnits/convertDuration)
// without the date-fns dependency.

const MIN_PER_HOUR = 60;
const MIN_PER_DAY = 1440;
const MIN_PER_MONTH = 43800;

const unitWord = (n: number, unit: string) => (n === 1 ? unit : `${unit}s`);

/** minutes → alternating value/unit tokens, e.g. ['6', 'days', '2', 'hours']. */
export function durationTokens(minutes: number): string[] {
  if (!minutes || minutes <= 0) return ['0'];
  if (minutes >= MIN_PER_MONTH) {
    const months = Math.floor(minutes / MIN_PER_MONTH);
    const days = Math.floor((minutes % MIN_PER_MONTH) / MIN_PER_DAY);
    return [String(months), unitWord(months, 'month'), ...(days > 0 ? [String(days), unitWord(days, 'day')] : [])];
  }
  if (minutes >= MIN_PER_DAY) {
    const days = Math.floor(minutes / MIN_PER_DAY);
    const hours = Math.floor((minutes % MIN_PER_DAY) / MIN_PER_HOUR);
    return [String(days), unitWord(days, 'day'), ...(hours > 0 ? [String(hours), unitWord(hours, 'hour')] : [])];
  }
  if (minutes >= MIN_PER_HOUR) {
    const hours = Math.floor(minutes / MIN_PER_HOUR);
    const mins = Math.floor(minutes % MIN_PER_HOUR);
    return [String(hours), unitWord(hours, 'hour'), ...(mins > 0 ? [String(mins), unitWord(mins, 'minute')] : [])];
  }
  const mins = Math.max(1, Math.round(minutes));
  return [String(mins), unitWord(mins, 'minute')];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** ISO timestamp → 'd MMM, yy' (the x-axis label format Devant uses). */
export function chartDateLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${String(d.getFullYear()).slice(-2)}`;
}

export type TimeUnit = 'minutes' | 'hours' | 'days' | 'months';

/** Pick a display unit for a series whose max value is `maxMinutes` (Devant thresholds). */
export function autoTimeUnit(maxMinutes: number): TimeUnit {
  if (maxMinutes > 131400) return 'months';
  if (maxMinutes > 4320) return 'days';
  if (maxMinutes > 240) return 'hours';
  return 'minutes';
}

export function convertMinutes(minutes: number, unit: TimeUnit): number {
  if (unit === 'hours') return Math.round((minutes / MIN_PER_HOUR) * 10) / 10;
  if (unit === 'days') return Math.round((minutes / MIN_PER_DAY) * 10) / 10;
  if (unit === 'months') return Math.round((minutes / MIN_PER_MONTH) * 10) / 10;
  return Math.round(minutes * 10) / 10;
}
