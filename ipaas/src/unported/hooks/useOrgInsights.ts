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
import { fetchOrgInsights } from '#api/insights';
import { useInsightsQueryUrl } from '../../hooks/useInsights';
import { formatCount as fmt } from '../utils/insightsFormat';
import type { InsightsEnvironment, InsightsRange, OrgInsightsRaw } from '../../types/insights';

const EMPTY_RAW: OrgInsightsRaw = { totalTraffic: 0, totalErrors: 0, avgLatency: 0, trend: [] };

/** Org-level Usage Insights — Devant's org overview KPIs (Total Traffic / Total Errors / Overall Latency) plus the API requests-vs-errors trend, org-wide. */
export function useOrgInsights(orgUuid: string, insightsEnv: InsightsEnvironment | null, range: InsightsRange) {
  const queryApiUrl = useInsightsQueryUrl(orgUuid);
  const enabled = !!orgUuid && !!insightsEnv && !!queryApiUrl;
  const query = useQuery({
    queryKey: ['orgInsights', orgUuid, insightsEnv?.id ?? null, range, queryApiUrl],
    queryFn: () => fetchOrgInsights(orgUuid, insightsEnv!, range, queryApiUrl!),
    enabled,
    staleTime: 60_000,
  });
  const raw = query.data ?? EMPTY_RAW;
  const kpis = useMemo(
    () => [
      { key: 'traffic', label: 'Total Traffic', value: fmt(raw.totalTraffic) },
      { key: 'errorRequests', label: 'Total Errors', value: fmt(raw.totalErrors) },
      { key: 'latency', label: 'Overall Latency', value: `${Math.round(raw.avgLatency)} ms` },
    ],
    [raw],
  );
  return { kpis, trend: raw.trend, isLoading: enabled && query.isLoading, enabled };
}
