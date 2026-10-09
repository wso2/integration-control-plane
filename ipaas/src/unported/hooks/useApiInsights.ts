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
import { fetchApiInsights } from '#api/insights';
import { useInsightsQueryUrl } from '../../hooks/useInsights';
import type { ApiInsightsData, ApiInsightsRaw, ApiInsightsTab, InsightsApiRef, InsightsEnvironment, InsightsRange } from '../../types/insights';

const fmt = (n: number): string => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${Math.round(n)}`);

const EMPTY_RAW: ApiInsightsRaw = {
  totalRequests: 0,
  totalErrors: 0,
  latencyP95: 0,
  latencyMedian: 0,
  overviewTrend: [],
  availability: [],
  byApplication: [],
  byBackend: [],
  resources: [],
  latencyTrend: [],
  errorsTrend: [],
  statusCodeHeatmap: { rows: [], cols: [], cells: [], max: 1 },
  errorsByCategory: [],
};

function toApiInsightsData(raw: ApiInsightsRaw): ApiInsightsData {
  const errorRate = raw.totalRequests > 0 ? (raw.totalErrors / raw.totalRequests) * 100 : 0;
  return {
    kpis: [
      { key: 'traffic', label: 'Total Traffic', value: fmt(raw.totalRequests), sub: 'requests' },
      { key: 'latency', label: 'Overall Latency', value: `${raw.latencyP95} ms`, sub: `median ${raw.latencyMedian} ms` },
      { key: 'errorRate', label: 'Error Rate', value: `${errorRate.toFixed(1)}%`, sub: 'of total traffic', danger: errorRate > 2 },
      { key: 'errorCount', label: 'Error Count', value: fmt(raw.totalErrors), sub: '4xx + 5xx' },
    ],
    overview: { trend: raw.overviewTrend, availability: raw.availability },
    traffic: { trend: raw.overviewTrend, byApplication: raw.byApplication, byBackend: raw.byBackend, resources: raw.resources },
    latency: { trend: raw.latencyTrend },
    errors: { trend: raw.errorsTrend, statusCodeHeatmap: raw.statusCodeHeatmap, byCategory: raw.errorsByCategory },
  };
}

/**
 * Integration-level API insights — apiId-scoped queries (see `fetchApiInsights`
 * in `api/wip/insights.ts`) against the same analyticsqueryapi endpoint as the
 * project view. Fetches lazily per active tab: the base bundle (KPIs +
 * Overview/Traffic trend + Availability + the Latency/Errors trends) is always
 * included, and each tab's extra breakdown (by-app/by-backend/resources for
 * Traffic, top-slowest for Latency, per-application detail for Errors) is only
 * fetched once that tab is active.
 */
export function useApiInsights(orgUuid: string, projectId: string, insightsEnv: InsightsEnvironment | null, apiRef: InsightsApiRef | null, range: InsightsRange, tab: ApiInsightsTab) {
  const queryApiUrl = useInsightsQueryUrl(orgUuid);
  const enabled = !!orgUuid && !!insightsEnv && !!apiRef && !!queryApiUrl;

  const query = useQuery({
    queryKey: ['apiInsights', orgUuid, projectId, apiRef?.id ?? null, insightsEnv?.id ?? null, range, tab, queryApiUrl],
    queryFn: () => fetchApiInsights(orgUuid, projectId, insightsEnv!, apiRef!, range, tab, queryApiUrl!),
    enabled,
    staleTime: 60_000,
  });

  const data = useMemo(() => toApiInsightsData(query.data ?? EMPTY_RAW), [query.data]);
  return { data, isLoading: query.isLoading, isError: query.isError, enabled };
}
