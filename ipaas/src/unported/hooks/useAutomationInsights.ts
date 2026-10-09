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

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { fetchAutomationInsights } from '#api/insights';
import { useInsightsQueryUrl } from '../../hooks/useInsights';
import { executionOutcome, formatDuration } from '../utils/insightsFormat';
import type { AutomationInsightsData, AutomationInsightsRaw, AutomationTrendPoint, ExecutionScatterPoint, HeatmapData, InsightsEnvironment, InsightsRange } from '../../types/insights';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOUR_LABELS = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);

const EMPTY_RAW: AutomationInsightsRaw = { stats: null, durations: [], executions: [] };

function toAutomationInsightsData(raw: AutomationInsightsRaw, componentId: string, range: InsightsRange): AutomationInsightsData {
  const stats = raw.stats;
  const total = stats?.totalExecutions ?? raw.executions.length;
  const failed = stats ? stats.failedJobs + stats.timeoutJobs : raw.executions.filter((e) => executionOutcome(e.status) !== 'success').length;
  const errorRate = stats?.errorRatePercent ?? (total > 0 ? (failed / total) * 100 : 0);
  const duration = raw.durations.find((d) => d.componentId === componentId) ?? raw.durations[0];

  const kpis: AutomationInsightsData['kpis'] = [
    { key: 'total', label: 'Total Executions', value: `${total}`, sub: `last ${range}` },
    { key: 'failed', label: 'Failed', value: `${failed}`, sub: `${errorRate.toFixed(1)}% error rate` },
    { key: 'errorRate', label: 'Error Rate', value: `${errorRate.toFixed(1)}%`, sub: 'of executions' },
    { key: 'avgDuration', label: 'Avg Duration', value: duration ? duration.averageDurationFormatted || formatDuration(duration.averageDurationMs / 1000) : '—', sub: 'per run' },
    { key: 'p95Duration', label: 'P95 Duration', value: duration ? duration.p95DurationFormatted || formatDuration(duration.p95DurationMs / 1000) : '—', sub: 'per run' },
  ];

  // oldest → newest for the scatter's left-to-right time axis
  const chronological = [...raw.executions].sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime));
  const scatter: ExecutionScatterPoint[] = chronological
    .map((e) => {
      const ts = Date.parse(e.startTime);
      if (Number.isNaN(ts) || !(e.durationSeconds >= 0)) return null;
      const d = new Date(ts);
      return { id: e.jobId, label: `${d.getMonth() + 1}/${d.getDate()}`, durationSec: e.durationSeconds, outcome: executionOutcome(e.status) } satisfies ExecutionScatterPoint;
    })
    .filter((p): p is ExecutionScatterPoint => p !== null);

  // Failures by day-of-week × hour-of-day (viewer-local time, matching the axis labels)
  const cellCounts = new Map<string, number>();
  raw.executions.forEach((e) => {
    if (executionOutcome(e.status) === 'success') return;
    const ts = Date.parse(e.startTime);
    if (Number.isNaN(ts)) return;
    const d = new Date(ts);
    const key = `${d.getDay()}_${d.getHours()}`;
    cellCounts.set(key, (cellCounts.get(key) ?? 0) + 1);
  });
  const cells = [...cellCounts.entries()].map(([key, value]) => {
    const [row, col] = key.split('_').map(Number);
    return { row, col, value };
  });
  const heatmap: HeatmapData = { rows: DAY_LABELS, cols: HOUR_LABELS, cells, max: Math.max(1, ...cells.map((c) => c.value)) };

  // Daily trend, bucketed by calendar day (UTC) across the range
  const dayBuckets = new Map<string, { success: number; failure: number; timeout: number }>();
  raw.executions.forEach((e) => {
    const ts = Date.parse(e.startTime);
    if (Number.isNaN(ts)) return;
    const d = new Date(ts);
    // Zero-padded ISO key so localeCompare sorts chronologically ("2026-09-30" < "2026-10-02").
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    const b = dayBuckets.get(key) ?? { success: 0, failure: 0, timeout: 0 };
    b[executionOutcome(e.status)]++;
    dayBuckets.set(key, b);
  });
  const trend: AutomationTrendPoint[] = [...dayBuckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, v]) => {
      const [, m, dd] = key.split('-').map(Number);
      return { label: `${m}/${dd}`, ...v };
    });

  return { kpis, scatter, heatmap, trend };
}

/**
 * Integration-level automation insights, fetched from the insights backend the
 * same way devant does it (`GetIntegrationInsightsOverview`, scoped by
 * `AutomationFilter.componentIDs` — see devant-insights-02.har): execution
 * stats, per-component durations, and the finished-run list all come from the
 * analyticsqueryapi endpoint. KPIs/scatter/heatmap/trend are shaped client-side
 * from that one response. Replaces the earlier useTaskExecutions derivation,
 * which needed a releaseId resolved through the deployment API and rendered an
 * empty view whenever that lookup failed.
 */
export function useAutomationInsights(orgUuid: string, projectId: string, insightsEnv: InsightsEnvironment | null, componentId: string, range: InsightsRange) {
  const queryApiUrl = useInsightsQueryUrl(orgUuid);
  const enabled = !!orgUuid && !!projectId && !!insightsEnv && !!componentId && !!queryApiUrl;

  const query = useQuery({
    queryKey: ['automationInsights', orgUuid, projectId, componentId, insightsEnv?.id ?? null, range, queryApiUrl],
    queryFn: () => fetchAutomationInsights(orgUuid, projectId, insightsEnv!, componentId, range, queryApiUrl!),
    enabled,
    staleTime: 60_000,
  });

  const data = useMemo(() => toAutomationInsightsData(query.data ?? EMPTY_RAW, componentId, range), [query.data, componentId, range]);
  return { data, isLoading: query.isLoading, isError: query.isError, enabled };
}
