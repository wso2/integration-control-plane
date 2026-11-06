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
import { fetchComponentInsights, fetchInsightsEnvironments, fetchTopSlowestApisNamed } from '../api/insights';
import { useCloudDataPlanes } from './useEnvironments';
import { choreoInsightsQueryApiUrl } from '../config/runtimeConfig';
import type { InsightsEnvironment, InsightsRange, SlowestApiRow } from '../types/insights';

export function useInsightsEnvironments(orgUuid: string, projectId: string) {
  return useQuery({
    queryKey: ['insightsEnvironments', orgUuid, projectId],
    queryFn: () => fetchInsightsEnvironments(orgUuid, projectId),
    enabled: !!orgUuid && !!projectId,
    staleTime: 5 * 60_000,
  });
}

// The insights analytics query-api is served by the org's systemapis gateway
// (same host alerting/logging already resolve via useCloudDataPlanes), not a
// static configured URL — see devant-insights-01.har. Any cloud data plane's
// gateway works: environment scoping happens via DataFilter.environmentIds in
// the query body, not the URL, matching devant's own `useGetInsightsUrl`
// (which also just takes the project's first gateway URL).
export function useInsightsQueryUrl(orgUuid: string): string | undefined {
  const { data: cdps } = useCloudDataPlanes(orgUuid);
  const host = cdps?.[0]?.external_gateway_virtual_host;
  return host ? choreoInsightsQueryApiUrl(host) : undefined;
}

export function useComponentInsights(orgUuid: string, insightsEnv: InsightsEnvironment | null, apiId: string) {
  const queryApiUrl = useInsightsQueryUrl(orgUuid);
  return useQuery({
    queryKey: ['componentInsights', orgUuid, insightsEnv?.id ?? null, apiId, queryApiUrl],
    queryFn: () => fetchComponentInsights(orgUuid, insightsEnv!, apiId, queryApiUrl!),
    enabled: !!orgUuid && !!insightsEnv && !!apiId && !!queryApiUrl,
    refetchInterval: 10_000,
  });
}

// Org-scope env list — same insightsEnvironments query with projectId omitted.
export function useOrgInsightsEnvironments(orgUuid: string) {
  return useQuery({
    queryKey: ['insightsEnvironments', orgUuid, null],
    queryFn: () => fetchInsightsEnvironments(orgUuid),
    enabled: !!orgUuid,
    staleTime: 5 * 60_000,
  });
}

// Top-10 slowest APIs, org-wide (projectId null) or project-scoped — shared by the org and project Usage Insights pages.
export function useTopSlowestApis(orgUuid: string, projectId: string | null, insightsEnv: InsightsEnvironment | null, range: InsightsRange): { data: SlowestApiRow[]; isLoading: boolean } {
  const queryApiUrl = useInsightsQueryUrl(orgUuid);
  const enabled = !!orgUuid && !!insightsEnv && !!queryApiUrl;
  const query = useQuery({
    queryKey: ['topSlowestApis', orgUuid, projectId, insightsEnv?.id ?? null, range, queryApiUrl],
    queryFn: () => fetchTopSlowestApisNamed(orgUuid, projectId, insightsEnv!, range, queryApiUrl!),
    enabled,
    staleTime: 60_000,
  });
  return { data: query.data ?? [], isLoading: enabled && query.isLoading };
}
