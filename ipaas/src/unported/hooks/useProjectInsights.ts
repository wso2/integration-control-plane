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
import { fetchProjectInsights, fetchProjectLatencyTrend } from '#api/insights';
import { useInsightsQueryUrl } from '../../hooks/useInsights';
import { emptyProjectInsightsRaw, toProjectInsightsData } from '../utils/projectInsights';
import type { InsightsApiRef, InsightsAutomationRef, InsightsEnvironment, InsightsRange, ProjectInsightsRaw } from '../../types/insights';

export function useProjectInsights(orgUuid: string, projectId: string, insightsEnv: InsightsEnvironment | null, apis: InsightsApiRef[], automations: InsightsAutomationRef[], eventApis: InsightsApiRef[], range: InsightsRange) {
  const apiKey = apis.map((a) => a.apiId).join(',');
  const autoKey = automations.map((a) => a.id).join(',');
  const eventKey = eventApis.map((a) => a.id).join(',');
  const hasIntegrations = apis.length > 0 || automations.length > 0 || eventApis.length > 0;
  const queryApiUrl = useInsightsQueryUrl(orgUuid);
  const enabled = !!orgUuid && !!insightsEnv && hasIntegrations && !!queryApiUrl;

  const query = useQuery({
    queryKey: ['projectInsights', orgUuid, projectId, insightsEnv?.id ?? null, range, apiKey, autoKey, eventKey, queryApiUrl],
    queryFn: () => fetchProjectInsights(orgUuid, projectId, insightsEnv!, apis, automations, eventApis, range, queryApiUrl!),
    enabled,
    staleTime: 60_000,
  });

  // Until the live query resolves (or when it is disabled/errored), surface every
  // known integration as a zeroed placeholder row so the table isn't empty; the
  // query's real per-component stats override these by id once it resolves.
  const raw = useMemo<ProjectInsightsRaw>(() => query.data ?? emptyProjectInsightsRaw(apis, automations, eventApis), [query.data, apis, automations, eventApis]);

  const data = useMemo(() => toProjectInsightsData(raw), [raw]);
  return { data, isLoading: query.isLoading, isError: query.isError, enabled, hasIntegrations };
}

// Latency trend for the project trend card's "Latency" mode — only fetched while
// that mode is selected.
export function useProjectLatencyTrend(orgUuid: string, projectId: string | null, insightsEnv: InsightsEnvironment | null, range: InsightsRange, active: boolean) {
  const queryApiUrl = useInsightsQueryUrl(orgUuid);
  const enabled = active && !!orgUuid && !!insightsEnv && !!queryApiUrl;
  const query = useQuery({
    queryKey: ['projectLatencyTrend', orgUuid, projectId, insightsEnv?.id ?? null, range, queryApiUrl],
    queryFn: () => fetchProjectLatencyTrend(orgUuid, projectId, insightsEnv!, range, queryApiUrl!),
    enabled,
    staleTime: 60_000,
  });
  return { data: query.data ?? [], isLoading: enabled && query.isLoading };
}
