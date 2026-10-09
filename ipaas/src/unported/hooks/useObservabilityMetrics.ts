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
import { fetchComponentHttpMetrics, fetchComponentUsageMetrics, fetchProjectMetricsModel } from '#api/observability';
import { METRICS_RANGES, type ComponentHttpMetricsRows, type ComponentUsageMetricsRows, type MetricsDatum, type MetricsRange, type MetricsTimePoint, type ProjectMetricsModel } from '../../types/observability';

export function rangeToIso(range: MetricsRange): { from: string; to: string } {
  const minutes = METRICS_RANGES.find((r) => r.value === range)?.minutes ?? 1440;
  const to = new Date();
  const from = new Date(to.getTime() - minutes * 60000);
  return { from: from.toISOString(), to: to.toISOString() };
}

/** Short bucket label — time-of-day for intraday ranges, date + time for longer ones. */
export function metricTimeLabel(iso: string, range: MetricsRange): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (range === '7d' || range === '30d') return `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
  return hm;
}

const refetchMs = (seconds: number) => (seconds > 0 ? seconds * 1000 : (false as const));

/** Requests-per-bucket + latency-percentile rows for one release — Devant's
 * useComponentHTTPMetrics select-mapping ported. */
export function useComponentHttpMetrics(releaseId: string, range: MetricsRange, refreshSeconds: number, enabled = true) {
  const query = useQuery({
    queryKey: ['componentHttpMetrics', releaseId, range],
    refetchInterval: refetchMs(refreshSeconds),
    placeholderData: (prev) => prev,
    enabled: enabled && !!releaseId,
    staleTime: 30_000,
    queryFn: async (): Promise<ComponentHttpMetricsRows> => {
      const { from, to } = rangeToIso(range);
      const payload = (await fetchComponentHttpMetrics(releaseId, from, to))?.data;
      const requestRows: MetricsDatum[] = (payload?.successfulRequestCountHistogram ?? []).map((p, i) => ({
        label: metricTimeLabel(p.time, range),
        success: p.value,
        total: payload?.totalRequestCountHistogram?.[i]?.value ?? 0,
        failed: payload?.failedRequestCountHistogram?.[i]?.value ?? 0,
      }));
      const p99Index = payload?.latencyPercentiles?.indexOf('99') ?? -1;
      const p90Index = payload?.latencyPercentiles?.indexOf('90') ?? -1;
      const p50Index = payload?.latencyPercentiles?.indexOf('50') ?? -1;
      const latencyRows: MetricsDatum[] = (payload?.latencyPercentilesHistogram ?? []).map((p, i) => ({
        label: metricTimeLabel(p.time, range),
        mean: payload?.latencyMeanHistogram?.[i]?.value ?? 0,
        p99: p99Index >= 0 ? (p.values[p99Index] ?? 0) : 0,
        p90: p90Index >= 0 ? (p.values[p90Index] ?? 0) : 0,
        p50: p50Index >= 0 ? (p.values[p50Index] ?? 0) : 0,
      }));
      return { requestRows, latencyRows };
    },
  });
  return { data: query.data ?? null, isLoading: query.isLoading, isFetching: query.isFetching, isError: query.isError, refetch: query.refetch };
}

/** CPU / memory / network / disk rows for one release — Devant's
 * useComponentHTTPUsage select-mapping ported (CPU usage clamped to the limit). */
export function useComponentUsageMetrics(releaseId: string, range: MetricsRange, refreshSeconds: number, enabled = true) {
  const query = useQuery({
    queryKey: ['componentUsageMetrics', releaseId, range],
    refetchInterval: refetchMs(refreshSeconds),
    placeholderData: (prev) => prev,
    enabled: enabled && !!releaseId,
    staleTime: 30_000,
    queryFn: async (): Promise<ComponentUsageMetricsRows> => {
      const { from, to } = rangeToIso(range);
      const payload = await fetchComponentUsageMetrics(releaseId, from, to);
      const label = (p: MetricsTimePoint) => metricTimeLabel(p.time, range);
      const memoryRows: MetricsDatum[] = (payload?.memory ?? []).map((p, i) => ({
        label: label(p),
        usage: p.value,
        requests: payload?.memoryRequests?.[i]?.value ?? 0,
        limits: payload?.memoryLimits?.[i]?.value ?? 0,
      }));
      const cpuRows: MetricsDatum[] = (payload?.cpuUsage ?? []).map((p, i) => {
        const limit = payload?.cpuLimits?.[i]?.value;
        return {
          label: label(p),
          usage: limit != null && p.value > limit ? limit : p.value,
          requests: payload?.cpuRequests?.[i]?.value ?? 0,
          limits: limit ?? 0,
        };
      });
      const single = (points: MetricsTimePoint[] | undefined, key: string): MetricsDatum[] => (points ?? []).map((p) => ({ label: label(p), [key]: p.value }));
      return {
        memoryRows,
        cpuRows,
        receivedRows: single(payload?.bytesReceived, 'received'),
        sentRows: single(payload?.bytesSent, 'sent'),
        diskReadRows: single(payload?.diskIOReads, 'reads'),
        diskWriteRows: single(payload?.diskIOWrites, 'writes'),
      };
    },
  });
  return { data: query.data ?? null, isLoading: query.isLoading, isFetching: query.isFetching, isError: query.isError, refetch: query.refetch };
}

/** Project HTTP dependency graph (nodeList/linkList) for the diagram's
 * observability layer. null model = no traffic in range. */
export function useProjectMetricsModel(projectId: string, environmentId: string, range: MetricsRange, refreshSeconds: number) {
  const query = useQuery({
    queryKey: ['projectMetricsModel', projectId, environmentId, range],
    refetchInterval: refetchMs(refreshSeconds),
    placeholderData: (prev) => prev,
    enabled: !!projectId && !!environmentId,
    staleTime: 30_000,
    queryFn: async (): Promise<ProjectMetricsModel | null> => {
      const { from, to } = rangeToIso(range);
      return fetchProjectMetricsModel(projectId, environmentId, from, to);
    },
  });
  return { model: query.data ?? null, isLoading: query.isLoading, isFetching: query.isFetching, isError: query.isError, refetch: query.refetch };
}
