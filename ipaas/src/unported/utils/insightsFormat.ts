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

import type { ExecutionOutcome } from '../../types/insights';

/** Compact count: 1_500_000 → '1.50M', 1500 → '1.5k', else rounded integer.
 * Values that would round to '1000.0k' roll over to the M form instead. */
export function formatCount(n: number): string {
  if (n >= 999_950) return `${(n / 1_000_000).toFixed(2)}M`;
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${Math.round(n)}`;
}

/** Human duration from seconds: '45s', '3m', '3m 20s'. Rounds to whole seconds
 * first so values like 59.6 or 119.6 normalize to '1m' / '2m', never '1m 60s'. */
export function formatDuration(sec: number): string {
  const total = Math.round(sec);
  if (total < 60) return `${total}s`;
  const m = Math.floor(total / 60);
  const s = total % 60;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

/** Latency in milliseconds: '96 ms' under a second, '1.8 s' at or above. */
export function formatLatencyMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`;
}

/** Deploy timestamp for the feed: 'Jul 14, 09:32'. Empty string for unparseable input. */
export function formatDeployTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Classify a task-execution status string into a success/failure/timeout outcome. */
export function executionOutcome(status: string): ExecutionOutcome {
  const v = status?.toLowerCase() ?? '';
  if (v === 'completed' || v === 'succeeded' || v === 'success') return 'success';
  if (/timeout|timed.?out|deadline/.test(v)) return 'timeout';
  return 'failure';
}
