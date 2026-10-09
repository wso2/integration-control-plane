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

/** Pure helpers for the Audit Logs page — time-range resolution, formatting, outcome colour. */

import type { AuditLogEntry, AuditLogOutcome } from '../../types/auditLogs';

/** ISO start/end for a look-back window ending "now" — `nowMs` is injected so this stays pure. */
export function rangeFromPreset(presetMs: number, nowMs: number): { startTime: string; endTime: string } {
  return { startTime: new Date(nowMs - presetMs).toISOString(), endTime: new Date(nowMs).toISOString() };
}

/** Format an audit entry's epoch-ms timestamp for display; falls back to the ISO logged-time. */
export function formatAuditTimestamp(entry: Pick<AuditLogEntry, 'timestamp' | 'eventLoggedTime'>): string {
  const ms = typeof entry.timestamp === 'string' ? Number(entry.timestamp) : entry.timestamp;
  if (Number.isFinite(ms) && ms > 0) return new Date(ms).toLocaleString();
  if (entry.eventLoggedTime) return new Date(entry.eventLoggedTime).toLocaleString();
  return '—';
}

/** oxygen-ui Chip colour for an outcome. */
export function outcomeColor(outcome?: AuditLogOutcome): 'success' | 'error' | 'default' {
  if (outcome === 'succeeded') return 'success';
  if (outcome === 'failed') return 'error';
  return 'default';
}

/** Download the given audit entries as a JSON file (used by the toolbar download action). */
export function downloadAuditLogs(entries: AuditLogEntry[]): void {
  const blob = new Blob([JSON.stringify(entries, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
