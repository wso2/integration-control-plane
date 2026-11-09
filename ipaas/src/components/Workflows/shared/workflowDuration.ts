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

/**
 * The one duration formatter for the workflow views: the run header, the timeline's span labels
 * and the node-detail overlay all render elapsed time, and three separate helpers with three
 * different roundings meant the same span read differently depending on where you looked.
 *
 * `utils/time.ts` covers absolute timestamps and coarse ages ("3 hours") but has no elapsed-time
 * formatter at this precision, so this stays local rather than duplicating something shared.
 */
export function formatDurationMs(ms: number): string {
  const safeMs = Number.isFinite(ms) ? Math.max(0, ms) : 0;
  if (Math.round(safeMs) < 1000) {
    return `${Math.round(safeMs)}ms`;
  }
  // Rounded once, to the precision shown, before splitting into units: rounding each unit on its
  // own reads 59.6s as `60s` and 119.6s as `1m 60s`.
  const tenths = Math.round(safeMs / 100);
  if (tenths < 100) {
    return `${(tenths / 10).toFixed(1)}s`;
  }
  const seconds = Math.round(safeMs / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ${seconds % 60}s`;
  }
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

/** Elapsed time between two ISO timestamps; an absent `endTime` means "still running", so now. */
export function formatDurationBetween(startTime: string, endTime?: string | null): string {
  const start = new Date(startTime).getTime();
  const end = endTime ? new Date(endTime).getTime() : Date.now();
  return formatDurationMs(end - start);
}

/**
 * A stopwatch that always shows seconds (`0:04`, `1:08`, `1:05:08`) for durations still running,
 * where a compact `1m 8s` would jump between units as it ticks.
 */
export function formatStopwatch(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) {
    return '0:00';
  }
  const totalSec = Math.floor(ms / 1000);
  const seconds = totalSec % 60;
  const minutes = Math.floor(totalSec / 60) % 60;
  const hours = Math.floor(totalSec / 3600);
  const pad = (n: number) => String(n).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}
