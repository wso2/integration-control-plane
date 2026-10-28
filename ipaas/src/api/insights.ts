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

import type { InsightsEnvironment, ComponentInsights, ProjectInsightsRaw, InsightsApiRef, InsightsAutomationRef, InsightsRange, OrgInsightsRaw, SlowestApiRow, ApiInsightsRaw, AutomationInsightsRaw } from '../types/insights';

// TODO: implement using cloud APIs
const ni = (name: string): Promise<never> => Promise.reject(new Error(`[cloud] insights.${name}: not implemented`));
// Synchronous stubs can't reject, so they throw.
const niSync = (name: string): never => {
  throw new Error(`[cloud] insights.${name}: not implemented`);
};

interface TimeSeriesPoint {
  timeSpan: string;
  count: number;
}

export const fetchInsightsEnvironments = (_orgUuid: string, _projectId?: string): Promise<InsightsEnvironment[]> => ni('fetchInsightsEnvironments');
export const fetchComponentInsights = (_orgUuid: string, _insightsEnv: InsightsEnvironment, _apiId: string, _queryApiUrl: string, _time?: { from: string; to: string }): Promise<ComponentInsights | null> => ni('fetchComponentInsights');
export const fetchProjectInsights = (
  _orgUuid: string,
  _projectId: string,
  _insightsEnv: InsightsEnvironment,
  _apis: InsightsApiRef[],
  _automations: InsightsAutomationRef[],
  _eventApis: InsightsApiRef[],
  _range: InsightsRange,
  _queryApiUrl: string,
): Promise<ProjectInsightsRaw> => ni('fetchProjectInsights');
export const fetchProjectLatencyTrend = (_orgUuid: string, _projectId: string | null, _insightsEnv: InsightsEnvironment, _range: InsightsRange, _queryApiUrl: string): Promise<{ label: string; latency: number }[]> => ni('fetchProjectLatencyTrend');
export const fetchOrgInsights = (_orgUuid: string, _insightsEnv: InsightsEnvironment, _range: InsightsRange, _queryApiUrl: string): Promise<OrgInsightsRaw> => ni('fetchOrgInsights');
export const fetchTopSlowestApisNamed = (_orgUuid: string, _projectId: string | null, _insightsEnv: InsightsEnvironment, _range: InsightsRange, _queryApiUrl: string): Promise<SlowestApiRow[]> => ni('fetchTopSlowestApisNamed');
export const fetchApiUsageOverTime = (_queryApiUrl: string, _dataFilter: Record<string, unknown>, _apiId: string, _apiVersion: string, _apiAliases: string[], _time: { from: string; to: string; queryGranularity: string }): Promise<TimeSeriesPoint[]> =>
  ni('fetchApiUsageOverTime');
export const fetchApiUsageByApp = (
  _queryApiUrl: string,
  _dataFilter: Record<string, unknown>,
  _apiId: string,
  _apiVersion: string,
  _apiAliases: string[],
  _time: { from: string; to: string; queryGranularity: string },
): Promise<{ applicationName: string; usage: TimeSeriesPoint[] }[]> => ni('fetchApiUsageByApp');
export const fetchUsageByBackend = (_queryApiUrl: string, _dataFilter: Record<string, unknown>, _apiId: string, _apiAliases: string[], _time: { from: string; to: string; queryGranularity: string }): Promise<{ backend: string; usage: TimeSeriesPoint[] }[]> =>
  ni('fetchUsageByBackend');
export const fetchResourceUsage = (_queryApiUrl: string, _dataFilter: Record<string, unknown>, _apiId: string, _apiAliases: string[], _time: { from: string; to: string }): Promise<{ apiResourceTemplate: string; apiMethod: string; count: number }[]> =>
  ni('fetchResourceUsage');
export const fetchLatencyByCategory = (
  _queryApiUrl: string,
  _dataFilter: Record<string, unknown>,
  _apiId: string,
  _time: { from: string; to: string; queryGranularity: string },
): Promise<{ timeSpan: string; response: number; backend: number; requestMediation: number; responseMediation: number; responseMedian: number; backendMedian: number; requestMediationMedian: number; responseMediationMedian: number }[]> =>
  ni('fetchLatencyByCategory');
export const fetchTopSlowestApis = (_queryApiUrl: string, _dataFilter: Record<string, unknown>, _time: { from: string; to: string }): Promise<{ apiId: string; latency: number }[]> => ni('fetchTopSlowestApis');
export const fetchErrorsByCategory = (
  _queryApiUrl: string,
  _dataFilter: Record<string, unknown>,
  _apiId: string,
  _time: { from: string; to: string; queryGranularity: string },
): Promise<{ timeSpan: string; auth: number; targetConnectivity: number; throttled: number; other: number }[]> => ni('fetchErrorsByCategory');
export const fetchErrorsByStatusCode = (
  _queryApiUrl: string,
  _dataFilter: Record<string, unknown>,
  _apiId: string,
  _apiAliases: string[],
  _time: { from: string; to: string },
): Promise<{ proxy: { statusCode: string; count: number }[]; target: { statusCode: string; count: number }[] }> => ni('fetchErrorsByStatusCode');
export const fetchErrorsDetails = (_queryApiUrl: string, _dataFilter: Record<string, unknown>, _apiId: string, _apiAliases: string[], _time: { from: string; to: string }): Promise<{ applicationName: string; reason: string; count: number }[]> =>
  ni('fetchErrorsDetails');
export const apiRangeToTimeFilter = (_range: InsightsRange): { from: string; to: string; labelGranularity: 'hour' | 'day' | 'week'; queryGranularity: string } => niSync('apiRangeToTimeFilter');
export const fetchApiInsights = (_orgUuid: string, _projectId: string, _insightsEnv: InsightsEnvironment, _apiRef: InsightsApiRef, _range: InsightsRange, _tab: 'overview' | 'traffic' | 'latency' | 'errors', _queryApiUrl: string): Promise<ApiInsightsRaw> =>
  ni('fetchApiInsights');
export const fetchAutomationInsights = (_orgUuid: string, _projectId: string, _insightsEnv: InsightsEnvironment, _componentId: string, _range: InsightsRange, _queryApiUrl: string): Promise<AutomationInsightsRaw> => ni('fetchAutomationInsights');
