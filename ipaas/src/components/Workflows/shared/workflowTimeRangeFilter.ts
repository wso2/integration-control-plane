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

import { METRICS_RANGES } from '../../../types/observability';

/**
 * The relative time windows of the Workflows list: a plain window select rather than a date-range picker.
 * The list filters on when a run started, or, from a figure that counts closed runs, when it
 * closed. The short codes are what links carry.
 */
export type WorkflowTimeRange = '' | '1h' | '24h' | '7d' | '30d';

const WINDOWS: Exclude<WorkflowTimeRange, ''>[] = ['1h', '24h', '7d', '30d'];

/** The metrics pages' windows ("Past 1 hour", ...), so both read the same. */
const RANGES = METRICS_RANGES.filter((range) => (WINDOWS as string[]).includes(range.value));

/** The windows as the select names them, in the order it lists them. */
export const WORKFLOW_TIME_RANGE_OPTIONS: { value: WorkflowTimeRange; label: string }[] = [{ value: '', label: 'Any time' }, ...RANGES.map((range) => ({ value: range.value as WorkflowTimeRange, label: range.label }))];

/**
 * The window's start, as the ISO-8601 bound the management API takes (`startTimeFrom`,
 * `closeTimeFrom`). Computed when called, so a poll's window moves with the clock.
 */
export function workflowTimeRangeFrom(range: WorkflowTimeRange, now: number = Date.now()): string | undefined {
  const window = range ? RANGES.find((r) => r.value === range) : undefined;
  return window ? new Date(now - window.minutes * 60_000).toISOString() : undefined;
}
