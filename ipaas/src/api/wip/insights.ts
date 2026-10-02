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

import { authenticatedFetch } from '#auth';
import { gql } from './graphql';
import type {
  InsightsEnvironment,
  ComponentInsights,
  InsightsApiRef,
  InsightsAutomationRef,
  InsightsRange,
  ProjectComponentStat,
  ProjectInsightsRaw,
  ProjectTaskStats,
  ApiInsightsRaw,
  AutomationInsightsRaw,
  AutomationDurationStat,
  TaskExecutionDetail,
  OrgInsightsRaw,
  SlowestApiRow,
} from '../../types/insights';

// The insights query endpoint lives on the org's own systemapis gateway
// (resolved per-call from a CloudDataPlane host — see useInsightsQueryUrl in
// hooks/useInsights.ts), not a static configured host, so this takes the
// resolved URL directly rather than going through the httpClients registry.
async function postInsightsQuery<T>(queryApiUrl: string, query: string, variables: Record<string, unknown>): Promise<T | null> {
  try {
    const res = await authenticatedFetch(queryApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// Environment metadata (externalEnvId/internalEnvId/sandboxEnvId — needed to
// build a query's `environmentIds`) comes from the main project GraphQL API's
// `insightsEnvironments` query, confirmed against devant-insights-01.har —
// not the analytics query-api itself.
export async function fetchInsightsEnvironments(orgUuid: string, projectId?: string): Promise<InsightsEnvironment[]> {
  try {
    const data = await gql<{ insightsEnvironments: InsightsEnvironment[] }>(
      `query insightsEnvironments($orgId: String!, $projectId: String) {
        insightsEnvironments(orgUuid: $orgId, projectId: $projectId) {
          id externalEnvId internalEnvId sandboxEnvId choreoEnvId name type region
        }
      }`,
      { orgId: orgUuid, projectId: projectId ?? null },
    );
    return data.insightsEnvironments ?? [];
  } catch {
    return [];
  }
}

// `choreoEnvId` matters: deployed devant sends it in every insights call
// (devant-insights-02.har) and automation execution stats return zeros
// without it — the repo copy of devant is older and lacks it.
function getEnvironmentIds(env: InsightsEnvironment): string[] {
  const { id, externalEnvId, sandboxEnvId, internalEnvId, choreoEnvId, type, name, region } = env;
  const ids = [id, externalEnvId, sandboxEnvId, internalEnvId, choreoEnvId].filter(Boolean) as string[];
  if (type === 'CHOREO') {
    if (name === 'Development' && region === 'US') ids.push('dev-us-east-azure', 'Dev-Internal', 'sandbox-dev');
    else if (name === 'Development' && region === 'EU') ids.push('dev-eu-north-azure', 'Dev-Internal-EU-North', 'sandbox-dev-eu-north');
    else if (name === 'Production' && region === 'US') ids.push('Production and Sandbox', 'Prod-Internal', 'sandbox-prod');
    else if (name === 'Production' && region === 'EU') ids.push('prod-eu-north-azure', 'Prod-Internal-EU-North', 'sandbox-prod-eu-north');
  }
  return [...new Set(ids)];
}

// devant's own insights calls (captured via HAR) send `TimeFilter.from/to` as
// full ISO-8601 with an offset, e.g. "2026-07-12T23:32:27.000+05:30" — not the
// space-separated "YYYY-MM-DD HH:mm:ss" this used to emit. `toISOString()`
// represents the identical instant (UTC, 'Z' suffix), which is the same
// standard format, just a different — and confirmed-working — offset.
function formatForInsights(date: Date): string {
  return date.toISOString();
}

// `time` scopes the query to a chosen duration window; when omitted it falls
// back to a rolling 6-month window (component overview KPI usage). The project
// insights table passes the selected range so its rows track the duration
// toggle rather than always showing 6-month totals.
export async function fetchComponentInsights(orgUuid: string, insightsEnv: InsightsEnvironment, apiId: string, queryApiUrl: string, time?: { from: string; to: string }): Promise<ComponentInsights | null> {
  const now = new Date();
  const from = new Date(now);
  from.setUTCMonth(now.getUTCMonth() - 6);

  const result = await postInsightsQuery<{
    data?: {
      getTotalTrafficByAPI: number;
      getOverallLatencyByAPI?: { response: number };
      getTotalErrorsByAPI?: { proxy: number };
    };
  }>(
    queryApiUrl,
    `query componentInsights($dataFilter: DataFilter!, $filter: TimeFilter!, $apiId: ID!) {
      getTotalTrafficByAPI(filter: $filter, dataFilter: $dataFilter, apiId: $apiId)
      getOverallLatencyByAPI(filter: $filter, dataFilter: $dataFilter, apiId: $apiId) { response }
      getTotalErrorsByAPI(filter: $filter, dataFilter: $dataFilter, apiId: $apiId) { proxy }
    }`,
    {
      filter: time ?? { from: formatForInsights(from), to: formatForInsights(now) },
      dataFilter: { orgId: orgUuid, environmentIds: getEnvironmentIds(insightsEnv), tenant: 'carbon.super' },
      apiId,
    },
  );

  const data = result?.data;
  if (!data) return null;

  const total = data.getTotalTrafficByAPI || 0;
  const errors = data.getTotalErrorsByAPI?.proxy || 0;
  const latency = data.getOverallLatencyByAPI?.response || 0;

  return {
    requestCount: total,
    errorCount: errors,
    errorRate: total > 0 ? Math.round((errors / total) * 100) : 0,
    latency,
  };
}

// ---------- Project-level insights ----------
// KPI cards use the project-level getTotalTraffic/getTotalErrors totals (same
// single query deployed devant issues for its overview cards), which count ALL
// gateway traffic for the project across the given environments. The per-
// integration table beneath is derived from per-component apiId-scoped queries,
// so those rows (traffic, errors, latency) may not sum to the headline KPIs.

const RANGE_TO_TIME: Record<InsightsRange, { ms: number; labelGranularity: 'hour' | 'day' | 'week'; queryGranularity: string }> = {
  '24h': { ms: 24 * 3_600_000, labelGranularity: 'hour', queryGranularity: '1h' },
  '7d': { ms: 7 * 86_400_000, labelGranularity: 'day', queryGranularity: '1d' },
  '30d': { ms: 30 * 86_400_000, labelGranularity: 'day', queryGranularity: '1d' },
  '3mo': { ms: 90 * 86_400_000, labelGranularity: 'week', queryGranularity: '1d' },
};

function rangeToTimeFilter(range: InsightsRange) {
  const conf = RANGE_TO_TIME[range];
  const to = new Date();
  const from = new Date(to.getTime() - conf.ms);
  return { from: formatForInsights(from), to: formatForInsights(to), labelGranularity: conf.labelGranularity, queryGranularity: conf.queryGranularity };
}

function bucketLabel(ts: number, labelGranularity: 'hour' | 'day' | 'week'): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  if (labelGranularity === 'hour') return `${String(d.getUTCHours()).padStart(2, '0')}:00`;
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

// The API summaries and the automation execution trend are bucketed
// independently by the backend (e.g. 1d API buckets vs 12h automation buckets
// over a 7d window — see devant-insights-02.har), so raw timestamps rarely
// align. Truncating every timestamp to the label granularity before merging
// puts both series into the same buckets.
function truncateTs(ts: number, labelGranularity: 'hour' | 'day' | 'week'): number {
  const d = new Date(ts);
  d.setUTCMinutes(0, 0, 0);
  if (labelGranularity !== 'hour') d.setUTCHours(0);
  if (labelGranularity === 'week') d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.getTime();
}

function buildTrend(
  successSummary: { timeSpan: string; requestCount: number }[],
  errorSummary: { timeSpan: string; errorCount: number }[],
  automationTrend: { timestamp: string; totalCount: number; failureCount: number }[],
  labelGranularity: 'hour' | 'day' | 'week',
): ProjectInsightsRaw['trend'] {
  const buckets = new Map<number, { apiRequests: number; automationRuns: number; automationErrors: number; errors: number }>();
  const add = (timeSpan: string, patch: Partial<{ apiRequests: number; automationRuns: number; automationErrors: number; errors: number }>) => {
    const ts = new Date(timeSpan).getTime();
    if (Number.isNaN(ts)) return;
    const key = truncateTs(ts, labelGranularity);
    const b = buckets.get(key) ?? { apiRequests: 0, automationRuns: 0, automationErrors: 0, errors: 0 };
    b.apiRequests += patch.apiRequests ?? 0;
    b.automationRuns += patch.automationRuns ?? 0;
    b.automationErrors += patch.automationErrors ?? 0;
    b.errors += patch.errors ?? 0;
    buckets.set(key, b);
  };
  successSummary.forEach((p) => add(p.timeSpan, { apiRequests: p.requestCount || 0 }));
  errorSummary.forEach((p) => add(p.timeSpan, { errors: p.errorCount || 0 }));
  automationTrend.forEach((p) => add(p.timestamp, { automationRuns: p.totalCount || 0, automationErrors: p.failureCount || 0 }));

  // getSuccessSummary is success-only, so total apiRequests = success + errors.
  return [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([ts, v]) => ({ label: bucketLabel(ts, labelGranularity), apiRequests: v.apiRequests + v.errors, automationRuns: v.automationRuns, automationErrors: v.automationErrors, errors: v.errors }));
}

// Project-level KPI totals AND trend summaries — the same single query deployed
// devant issues for its overview cards and graphs (devant-insights-03.har):
// getTotalTraffic/getTotalErrors count ALL gateway traffic for the project
// across the given environments, and getSuccessSummary/getErrorSummary carry
// the requests/errors trend series over the same scope.
async function fetchProjectOverview(
  queryApiUrl: string,
  dataFilter: Record<string, unknown>,
  time: { from: string; to: string; queryGranularity: string },
): Promise<{
  totalTraffic: number;
  totalErrors: number;
  successSummary: { timeSpan: string; requestCount: number }[];
  errorSummary: { timeSpan: string; errorCount: number }[];
}> {
  const result = await postInsightsQuery<{
    data?: {
      getTotalTraffic?: number;
      getTotalErrors?: number;
      getSuccessSummary?: { summary?: { timeSpan: string; requestCount: number }[] };
      getErrorSummary?: { summary?: { timeSpan: string; errorCount: number }[] };
    };
  }>(
    queryApiUrl,
    `query ($dataFilter: DataFilter!, $filter: TimeFilter!, $granularity: String!) {
      getTotalTraffic(filter: $filter, dataFilter: $dataFilter)
      getTotalErrors(filter: $filter, dataFilter: $dataFilter)
      getSuccessSummary(filter: $filter, dataFilter: $dataFilter, granularity: $granularity) {
        summary { timeSpan requestCount }
        granularity
      }
      getErrorSummary(filter: $filter, dataFilter: $dataFilter, granularity: $granularity) {
        summary { timeSpan errorCount }
        granularity
      }
    }`,
    { filter: { from: time.from, to: time.to }, dataFilter, granularity: time.queryGranularity },
  );
  return {
    totalTraffic: result?.data?.getTotalTraffic ?? 0,
    totalErrors: result?.data?.getTotalErrors ?? 0,
    successSummary: result?.data?.getSuccessSummary?.summary ?? [],
    errorSummary: result?.data?.getErrorSummary?.summary ?? [],
  };
}

// The project's real API ids/names as the insights backend itself sees them
// (`listAllAPI`, project-scoped). A component's own `apiId` field is
// frequently stale or unset (e.g. never (re)published), so this is the
// authoritative source used to resolve which apiId to query per component —
// matched by handler (devant's `name` here is the component slug, not the
// display name) or by the component's own apiId when that happens to match.
async function fetchAllProjectApis(queryApiUrl: string, dataFilter: Record<string, unknown>): Promise<{ id: string; name: string; displayName: string; version?: string }[]> {
  const result = await postInsightsQuery<{ data?: { listAllAPI?: { id: string; name: string; displayName: string; version?: string }[] } }>(
    queryApiUrl,
    `query ($dataFilter: DataFilter!) {
      listAllAPI(dataFilter: $dataFilter) { id name displayName version provider }
    }`,
    { dataFilter },
  );
  return result?.data?.listAllAPI ?? [];
}

// Resolves the analytics API record (id + version) for a component. Version
// matters: deployed devant scopes getAPIUsageOverTime/ByApp with
// `apiIdVersionPairs: [{ id, version }]` (devant-insights-02.har), not apiIds
// alone, so the version must travel with the id.
function resolveApi(ref: InsightsApiRef, projectApis: { id: string; name: string; displayName: string; version?: string }[]): { id: string; version: string } {
  const byId = ref.apiId ? projectApis.find((a) => a.id === ref.apiId) : undefined;
  if (byId) return { id: byId.id, version: byId.version ?? '' };
  const match = projectApis.find((a) => a.name === ref.handler || a.name === ref.name || a.displayName === ref.name || a.displayName === ref.handler);
  if (match) return { id: match.id, version: match.version ?? '' };
  return { id: ref.apiId ?? '', version: '' };
}

// Automations have no APIM traffic — devant's own insights backend exposes
// dedicated, project-scoped automation queries instead of anything client-side
// needing to chase a component's deployment/release to find its executions.
// Mirrors devant's `GetProjectInsightsOverview` (devant-insights-02.har):
// stats KPIs, the execution trend (the automation curve in the traffic chart),
// per-component durations, and the per-automation summary table — one call.
// `interval: null` matches the captured request; the backend picks the bucket
// size itself (e.g. 12h buckets over a 7d window), and `buildTrend` re-buckets
// to the display granularity anyway.
async function fetchProjectAutomationOverview(
  queryApiUrl: string,
  dataFilter: Record<string, unknown>,
  time: { from: string; to: string },
): Promise<{
  stats: ProjectTaskStats | null;
  trend: { timestamp: string; totalCount: number; successCount: number; failureCount: number }[];
  summary: { automationName: string; totalExecutions: number; failureCount: number; errorRate: number; lastRunRelative?: string; lastExecutionStatus?: string }[];
  duration: { componentId: string; componentName?: string; averageDurationMs: number; p95DurationMs: number }[];
}> {
  const result = await postInsightsQuery<{
    data?: {
      getTaskExecutionStats?: ProjectTaskStats;
      getAutomationExecutionTrend?: { timestamp: string; totalCount: number; successCount: number; failureCount: number }[];
      getAutomationSummaryTable?: { automationName: string; totalExecutions: number; failureCount: number; errorRate: number; lastRunRelative?: string; lastExecutionStatus?: string }[];
      getAutomationExecutionDuration?: { componentId: string; componentName?: string; averageDurationMs: number; p95DurationMs: number }[];
    };
  }>(
    queryApiUrl,
    `query GetProjectInsightsOverview($dataFilter: DataFilter!, $timeFilter: TimeFilter!, $automationFilter: AutomationFilter, $interval: String) {
      getTaskExecutionStats(dataFilter: $dataFilter, timeFilter: $timeFilter, automationFilter: $automationFilter) {
        totalExecutions successfulJobs failedJobs timeoutJobs errorCount errorRatePercent successRatePercent
      }
      getAutomationExecutionTrend(dataFilter: $dataFilter, timeFilter: $timeFilter, automationFilter: $automationFilter, interval: $interval) {
        timestamp totalCount successCount failureCount
      }
      getAutomationSummaryTable(dataFilter: $dataFilter, timeFilter: $timeFilter, automationFilter: $automationFilter) {
        automationName totalExecutions failureCount errorRate executionFrequency lastRun lastRunRelative lastExecutionStatus
      }
      getAutomationExecutionDuration(dataFilter: $dataFilter, timeFilter: $timeFilter, automationFilter: $automationFilter) {
        componentId componentName averageDurationMs p95DurationMs
      }
    }`,
    { dataFilter, timeFilter: { from: time.from, to: time.to }, automationFilter: null, interval: null },
  );

  return {
    stats: result?.data?.getTaskExecutionStats ?? null,
    trend: result?.data?.getAutomationExecutionTrend ?? [],
    summary: result?.data?.getAutomationSummaryTable ?? [],
    duration: result?.data?.getAutomationExecutionDuration ?? [],
  };
}

function toComponentStat(ref: InsightsApiRef, ins: ComponentInsights | null): ProjectComponentStat {
  return { id: ref.id, name: ref.name, handler: ref.handler, type: ref.kind, requestCount: ins?.requestCount ?? 0, errorCount: ins?.errorCount ?? 0, errorRate: ins?.errorRate ?? 0, latency: ins?.latency ?? 0 };
}

// Kinds we fetch per-API latency for — request/response services plus AI Agents;
// the Latency & duration filter surfaces each on its own.
const LATENCY_FETCH_KINDS = new Set<InsightsApiRef['kind']>(['api', 'mcp', 'webhook', 'agent']);

export async function fetchProjectInsights(
  orgUuid: string,
  projectId: string,
  insightsEnv: InsightsEnvironment,
  apis: InsightsApiRef[],
  automations: InsightsAutomationRef[],
  eventApis: InsightsApiRef[],
  range: InsightsRange,
  queryApiUrl: string,
): Promise<ProjectInsightsRaw> {
  const time = rangeToTimeFilter(range);
  const dataFilter = { orgId: orgUuid, environmentIds: getEnvironmentIds(insightsEnv), tenant: 'carbon.super', projectId };

  const [projectApis, automationOverview, overview] = await Promise.all([fetchAllProjectApis(queryApiUrl, dataFilter), fetchProjectAutomationOverview(queryApiUrl, dataFilter, time), fetchProjectOverview(queryApiUrl, dataFilter, time)]);

  // Per-API table rows need a per-component breakdown; resolve each
  // component's real apiId (+version) against `listAllAPI` rather than
  // trusting its own (often stale/empty) `apiId` field.
  const resolved = apis.map((a) => ({ ref: a, api: resolveApi(a, projectApis) }));

  // Per-component rows are scoped to the selected duration (same `time` the
  // project overview uses) so the table tracks the range toggle.
  const componentTime = { from: time.from, to: time.to };
  const perApi = await Promise.all(resolved.map(async ({ ref, api }) => ({ ref, ins: api.id ? await fetchComponentInsights(orgUuid, insightsEnv, api.id, queryApiUrl, componentTime) : null })));

  // Per-API latency. getOverallLatencyByAPI errors server-side, so latency comes
  // from the working getLatency series (same source the single-API view uses).
  // Fetched for every API-like kind (Integration as API / MCP Server / Webhook /
  // AI Agent) to feed the Latency & duration sub-type filter.
  const perApiLatency = await Promise.all(
    resolved.map(async ({ ref, api }) => {
      if (!api.id || !LATENCY_FETCH_KINDS.has(ref.kind)) return { id: ref.id, latency: null as number | null };
      const series = await fetchLatencyByCategory(queryApiUrl, dataFilter, api.id, { from: time.from, to: time.to, queryGranularity: time.queryGranularity });
      const vals = series.map((p) => p.response || 0).filter((v) => v > 0);
      return { id: ref.id, latency: vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : null };
    }),
  );
  const latencyById = new Map(perApiLatency.map((l) => [l.id, l.latency]));
  const apiStats = perApi.map(({ ref, ins }) => {
    const stat = toComponentStat(ref, ins);
    const lat = latencyById.get(ref.id);
    return lat != null ? { ...stat, latency: lat } : stat;
  });

  // Event & file integrations get the same per-component APIM totals as services:
  // they publish an APIM-tracked API on non-MI runtimes; MI ones resolve to no
  // apiId and fall through as zeroed rows.
  const resolvedEvents = eventApis.map((a) => ({ ref: a, api: resolveApi(a, projectApis) }));
  const perEvent = await Promise.all(resolvedEvents.map(async ({ ref, api }) => ({ ref, ins: api.id ? await fetchComponentInsights(orgUuid, insightsEnv, api.id, queryApiUrl, componentTime) : null })));
  const eventStats = perEvent.map(({ ref, ins }) => toComponentStat(ref, ins));

  // Summary rows are matched by name against the component slug OR display
  // name — the backend's `automationName` is the component handler.
  const summaryByName = new Map(automationOverview.summary.map((r) => [r.automationName?.toLowerCase(), r]));
  const durationById = new Map(automationOverview.duration.map((r) => [r.componentId, r]));
  const autoStats: ProjectComponentStat[] = automations.map((a) => {
    const summary = summaryByName.get(a.name.toLowerCase()) ?? summaryByName.get(a.handler.toLowerCase());
    const duration = durationById.get(a.id);
    if (!summary && !duration) return { id: a.id, name: a.name, handler: a.handler, type: a.kind, requestCount: null, errorCount: null, errorRate: null, latency: null, last: null };
    return {
      id: a.id,
      name: a.name,
      handler: a.handler,
      type: a.kind,
      requestCount: summary?.totalExecutions ?? 0,
      errorCount: summary?.failureCount ?? 0,
      errorRate: summary ? Math.round(summary.errorRate) : 0,
      latency: duration ? Math.round(duration.averageDurationMs) : null,
      last: summary?.lastRunRelative ?? null,
    };
  });

  // Deleted integrations: the project-wide overview traffic and task-execution
  // stats still count components removed from the project, but those have no
  // live row. Enumerating each is unreliable (only automations are reported by
  // name), so fold them all into one aggregate row = project total minus the
  // sum over the live rows above. Success = requests/executions that did not
  // error; errors kept in their own column. Both clamp at 0 because the
  // project-level and per-component scopes need not reconcile exactly.
  const liveSuccess = [...apiStats, ...autoStats].reduce((s, c) => s + Math.max(0, (c.requestCount ?? 0) - (c.errorCount ?? 0)), 0);
  const liveErrors = [...apiStats, ...autoStats].reduce((s, c) => s + (c.errorCount ?? 0), 0);
  const taskStats = automationOverview.stats;
  const fullSuccess = Math.max(0, overview.totalTraffic - overview.totalErrors) + (taskStats?.successfulJobs ?? 0);
  const fullErrors = overview.totalErrors + (taskStats?.failedJobs ?? 0);
  const deletedSuccess = Math.max(0, fullSuccess - liveSuccess);
  const deletedErrors = Math.max(0, fullErrors - liveErrors);
  const deletedStats: ProjectComponentStat[] =
    deletedSuccess + deletedErrors > 0
      ? [{ id: 'deleted-aggregate', name: 'Deleted Integrations', handler: '', type: 'api', deleted: true, requestCount: deletedSuccess + deletedErrors, errorCount: deletedErrors, errorRate: 0, latency: null, last: null }]
      : [];

  // KPI totals = sums over the project's own integration components, so the
  // headline numbers always agree with the table beneath them.
  const totalRequests = apiStats.reduce((s, a) => s + (a.requestCount ?? 0), 0);
  const totalErrors = apiStats.reduce((s, a) => s + (a.errorCount ?? 0), 0);

  // Per-sub-type request-weighted avg latency for the Latency & duration filter.
  const latencyForKind = (kind: InsightsApiRef['kind']): number => {
    const cs = apiStats.filter((a) => a.type === kind);
    const req = cs.reduce((s, a) => s + (a.requestCount ?? 0), 0);
    const w = cs.reduce((s, a) => s + (a.latency ?? 0) * (a.requestCount ?? 0), 0);
    return req > 0 ? Math.round(w / req) : 0;
  };
  const serviceLatencyByKind = { api: latencyForKind('api'), agent: latencyForKind('agent'), mcp: latencyForKind('mcp'), webhook: latencyForKind('webhook') };

  const trend = buildTrend(overview.successSummary, overview.errorSummary, automationOverview.trend, time.labelGranularity);

  // Per-type activity series: per-component getAPIUsageOverTime grouped by kind,
  // plus the automation execution trend as the Automations series.
  const aliasesFor = (id: string): string[] => {
    const m = projectApis.find((a) => a.id === id);
    return m ? [m.version ? `${m.name} - ${m.version}` : '', m.name, m.displayName].filter(Boolean) : [];
  };
  const usageFor = async (api: { id: string; version: string }): Promise<{ timeSpan: string; count: number }[]> => {
    if (!api.id) return [];
    return fetchApiUsageOverTime(queryApiUrl, dataFilter, api.id, api.version, aliasesFor(api.id), { from: time.from, to: time.to, queryGranularity: time.queryGranularity });
  };
  const [apiUsage, eventUsage] = await Promise.all([
    Promise.all(resolved.map(async ({ ref, api }) => ({ kind: ref.kind, usage: await usageFor(api) }))),
    Promise.all(resolvedEvents.map(async ({ ref, api }) => ({ kind: ref.kind, usage: await usageFor(api) }))),
  ]);
  const actBuckets = new Map<number, { label: string; services: number; agents: number; events: number; automations: number }>();
  const addAct = (timeSpan: string, key: 'services' | 'agents' | 'events' | 'automations', v: number) => {
    const ts0 = new Date(timeSpan).getTime();
    if (Number.isNaN(ts0)) return;
    const ts = truncateTs(ts0, time.labelGranularity);
    const b = actBuckets.get(ts) ?? { label: bucketLabel(ts, time.labelGranularity), services: 0, agents: 0, events: 0, automations: 0 };
    b[key] += v || 0;
    actBuckets.set(ts, b);
  };
  // Services sub-type breakdown (Integration as API / MCP Server / Webhook),
  // keyed by the same truncated bucket ts so it aligns with `activity`.
  const svcBuckets = new Map<number, { api: number; mcp: number; webhook: number }>();
  const addSvc = (timeSpan: string, kind: InsightsApiRef['kind'], v: number) => {
    if (kind !== 'api' && kind !== 'mcp' && kind !== 'webhook') return;
    const ts0 = new Date(timeSpan).getTime();
    if (Number.isNaN(ts0)) return;
    const ts = truncateTs(ts0, time.labelGranularity);
    const b = svcBuckets.get(ts) ?? { api: 0, mcp: 0, webhook: 0 };
    b[kind] += v || 0;
    svcBuckets.set(ts, b);
  };
  // Event Handlers sub-type breakdown (Event Integration / File Integration),
  // same bucket alignment as the services one above.
  const evtBuckets = new Map<number, { event: number; file: number }>();
  const addEvt = (timeSpan: string, kind: InsightsApiRef['kind'], v: number) => {
    if (kind !== 'event' && kind !== 'file') return;
    const ts0 = new Date(timeSpan).getTime();
    if (Number.isNaN(ts0)) return;
    const ts = truncateTs(ts0, time.labelGranularity);
    const b = evtBuckets.get(ts) ?? { event: 0, file: 0 };
    b[kind] += v || 0;
    evtBuckets.set(ts, b);
  };
  apiUsage.forEach(({ kind, usage }) =>
    usage.forEach((p) => {
      addAct(p.timeSpan, kind === 'agent' ? 'agents' : 'services', p.count);
      addSvc(p.timeSpan, kind, p.count);
    }),
  );
  eventUsage.forEach(({ kind, usage }) =>
    usage.forEach((p) => {
      addAct(p.timeSpan, 'events', p.count);
      addEvt(p.timeSpan, kind, p.count);
    }),
  );
  automationOverview.trend.forEach((p) => addAct(p.timestamp, 'automations', p.totalCount));
  const activity = [...actBuckets.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
  // Align the service breakdown to the activity buckets (0 where a bucket has no
  // service traffic) so both series share one x-axis.
  const svcByLabel = new Map([...svcBuckets.entries()].map(([ts, v]) => [bucketLabel(ts, time.labelGranularity), v]));
  const serviceActivity = activity.map((a) => {
    const s = svcByLabel.get(a.label);
    return { label: a.label, api: s?.api ?? 0, mcp: s?.mcp ?? 0, webhook: s?.webhook ?? 0 };
  });
  const evtByLabel = new Map([...evtBuckets.entries()].map(([ts, v]) => [bucketLabel(ts, time.labelGranularity), v]));
  const eventActivity = activity.map((a) => {
    const e = evtByLabel.get(a.label);
    return { label: a.label, event: e?.event ?? 0, file: e?.file ?? 0 };
  });

  // Duration split by automation sub-type (Automations vs RAG Ingestions), matched
  // by componentId against the automation rows we already classified by kind.
  const durationForKind = (kind: 'auto' | 'rag') => {
    const ids = new Set(autoStats.filter((a) => a.type === kind).map((a) => a.id));
    const ds = automationOverview.duration.filter((d) => ids.has(d.componentId));
    const withAvg = ds.filter((d) => (d.averageDurationMs ?? 0) > 0);
    return {
      avgMs: withAvg.length ? Math.round(withAvg.reduce((s, d) => s + d.averageDurationMs, 0) / withAvg.length) : 0,
      p95Ms: ds.reduce((m, d) => Math.max(m, d.p95DurationMs || 0), 0),
    };
  };
  const autoDurationByKind = { auto: durationForKind('auto'), rag: durationForKind('rag') };

  // Automation activity split by sub-type. The project trend is combined, so
  // apportion each bucket by each kind's share of total executions. With no
  // executions in range, split evenly when both kinds exist, else give the whole
  // bucket to whichever single kind is present.
  const execFor = (kind: 'auto' | 'rag') => autoStats.filter((a) => a.type === kind).reduce((s, a) => s + (a.requestCount ?? 0), 0);
  const autoExec = execFor('auto');
  const ragExec = execFor('rag');
  const totalExec = autoExec + ragExec;
  const hasAuto = autoStats.some((a) => a.type === 'auto');
  const hasRag = autoStats.some((a) => a.type === 'rag');
  let autoFrac: number;
  let ragFrac: number;
  if (totalExec > 0) {
    autoFrac = autoExec / totalExec;
    ragFrac = ragExec / totalExec;
  } else if (hasAuto && hasRag) {
    autoFrac = 0.5;
    ragFrac = 0.5;
  } else {
    autoFrac = hasAuto ? 1 : 0;
    ragFrac = hasRag ? 1 : 0;
  }
  const automationActivity = activity.map((a) => ({ label: a.label, auto: Math.round(a.automations * autoFrac), rag: Math.round(a.automations * ragFrac) }));

  return {
    totalRequests,
    totalErrors,
    totalTraffic: overview.totalTraffic,
    totalTrafficErrors: overview.totalErrors,
    trend,
    activity,
    serviceActivity,
    eventActivity,
    automationActivity,
    serviceLatencyByKind,
    autoDurationByKind,
    components: [...apiStats, ...eventStats, ...autoStats, ...deletedStats],
    taskStats: automationOverview.stats,
  };
}

// Project-level latency trend — devant's getLatencySummary series
// (devant-insights-03.har), one query, no per-API fan-out.
export async function fetchProjectLatencyTrend(orgUuid: string, projectId: string | null, insightsEnv: InsightsEnvironment, range: InsightsRange, queryApiUrl: string): Promise<{ label: string; latency: number }[]> {
  const time = rangeToTimeFilter(range);
  const dataFilter = { orgId: orgUuid, environmentIds: getEnvironmentIds(insightsEnv), tenant: 'carbon.super', ...(projectId ? { projectId } : {}) };
  const result = await postInsightsQuery<{ data?: { getLatencySummary?: { summary?: { timeSpan: string; latencyTime: number }[] } } }>(
    queryApiUrl,
    `query ($dataFilter: DataFilter!, $filter: TimeFilter!, $latencySummaryFilter: LatencySummaryFilter!) {
      getLatencySummary(filter: $filter, latencySummaryFilter: $latencySummaryFilter, dataFilter: $dataFilter) {
        summary { timeSpan latencyTime }
        granularity
      }
    }`,
    { filter: { from: time.from, to: time.to }, latencySummaryFilter: { granularity: time.queryGranularity }, dataFilter },
  );
  const buckets = new Map<number, { sum: number; n: number }>();
  for (const p of result?.data?.getLatencySummary?.summary ?? []) {
    const ts = new Date(p.timeSpan).getTime();
    if (Number.isNaN(ts)) continue;
    const key = truncateTs(ts, time.labelGranularity);
    const b = buckets.get(key) ?? { sum: 0, n: 0 };
    b.sum += p.latencyTime || 0;
    b.n += 1;
    buckets.set(key, b);
  }
  return [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([ts, v]) => ({ label: bucketLabel(ts, time.labelGranularity), latency: Math.round(v.sum / v.n) }));
}

// Org-level overview — same composite deployed devant issues for its org Usage Insights page (devant-orgInsights-01.har): org-wide dataFilter, no projectId.
export async function fetchOrgInsights(orgUuid: string, insightsEnv: InsightsEnvironment, range: InsightsRange, queryApiUrl: string): Promise<OrgInsightsRaw> {
  const time = rangeToTimeFilter(range);
  const dataFilter = { orgId: orgUuid, environmentIds: getEnvironmentIds(insightsEnv), tenant: 'carbon.super' };
  const result = await postInsightsQuery<{
    data?: {
      getTotalTraffic?: number;
      getOverallLatency?: number;
      getTotalErrors?: number;
      getSuccessSummary?: { summary?: { timeSpan: string; requestCount: number }[] };
      getErrorSummary?: { summary?: { timeSpan: string; errorCount: number }[] };
    };
  }>(
    queryApiUrl,
    `query ($dataFilter: DataFilter!, $filter: TimeFilter!, $granularity: String!) {
      getTotalTraffic(filter: $filter, dataFilter: $dataFilter)
      getOverallLatency(filter: $filter, dataFilter: $dataFilter)
      getTotalErrors(filter: $filter, dataFilter: $dataFilter)
      getSuccessSummary(filter: $filter, dataFilter: $dataFilter, granularity: $granularity) {
        summary { timeSpan requestCount }
        granularity
      }
      getErrorSummary(filter: $filter, dataFilter: $dataFilter, granularity: $granularity) {
        summary { timeSpan errorCount }
        granularity
      }
    }`,
    { filter: { from: time.from, to: time.to }, dataFilter, granularity: time.queryGranularity },
  );
  const trend = buildTrend(result?.data?.getSuccessSummary?.summary ?? [], result?.data?.getErrorSummary?.summary ?? [], [], time.labelGranularity);
  return {
    totalTraffic: result?.data?.getTotalTraffic ?? 0,
    totalErrors: result?.data?.getTotalErrors ?? 0,
    avgLatency: result?.data?.getOverallLatency ?? 0,
    trend: trend.map((p) => ({ label: p.label, apiRequests: p.apiRequests, errors: p.errors })),
  };
}

// ---------- Automation (integration-level) insights ----------
// Mirrors devant's `GetIntegrationInsightsOverview` (devant-insights-02.har):
// the same project-scoped dataFilter plus `AutomationFilter.componentIDs`
// narrows stats/durations/executions to one automation component. This replaces
// the earlier client-side derivation from useTaskExecutions, which depended on
// resolving a releaseId through the deployment API and silently showed nothing
// when that chain broke.
export async function fetchAutomationInsights(orgUuid: string, projectId: string, insightsEnv: InsightsEnvironment, componentId: string, range: InsightsRange, queryApiUrl: string): Promise<AutomationInsightsRaw> {
  const time = rangeToTimeFilter(range);
  const dataFilter = { orgId: orgUuid, environmentIds: getEnvironmentIds(insightsEnv), tenant: 'carbon.super', projectId };

  const result = await postInsightsQuery<{
    data?: {
      getTaskExecutionStats?: ProjectTaskStats;
      getAutomationExecutionDuration?: AutomationDurationStat[];
      getTaskExecutionDetails?: TaskExecutionDetail[];
    };
  }>(
    queryApiUrl,
    `query GetIntegrationInsightsOverview($dataFilter: DataFilter!, $timeFilter: TimeFilter!, $automationFilter: AutomationFilter!) {
      getTaskExecutionStats(dataFilter: $dataFilter, timeFilter: $timeFilter, automationFilter: $automationFilter) {
        totalExecutions successfulJobs failedJobs timeoutJobs errorCount errorRatePercent successRatePercent
      }
      getAutomationExecutionDuration(dataFilter: $dataFilter, timeFilter: $timeFilter, automationFilter: $automationFilter) {
        componentName componentId averageDurationMs p95DurationMs averageDurationFormatted p95DurationFormatted
      }
      getTaskExecutionDetails(dataFilter: $dataFilter, timeFilter: $timeFilter, automationFilter: $automationFilter) {
        jobId jobName startTime endTime durationSeconds status durationFormatted revision attemptCount versionId
      }
    }`,
    { dataFilter, timeFilter: { from: time.from, to: time.to }, automationFilter: { componentIDs: [componentId] } },
  );

  return {
    stats: result?.data?.getTaskExecutionStats ?? null,
    durations: result?.data?.getAutomationExecutionDuration ?? [],
    executions: result?.data?.getTaskExecutionDetails ?? [],
  };
}

// ---------- API (integration-level) insights ----------
// apiId-scoped queries ported from choreo-apim-analytics-portal
// (`src/api/traffic|latency|errors/Query.ts`), which hits the same
// analyticsqueryapi endpoint as everything above — this is the real
// "filter by integration" mechanism Devant's own Insights page provides
// (it renders that package for the project page rather than using its own
// data/insights/query.ts, which has no apiId scoping at all).
//
// Granularity values here follow devant-insights-01.har's confirmed-working
// '1h'/'1d' convention (shared with the project-view queries above), not the
// analytics-portal's own display-string GRANULARITY enum ('Hours'/'Days'/...)
// — both frontends feed the same filter field, and the HAR is the one with
// verified real traffic. '1w' is NOT valid: it's not an Elasticsearch
// fixed_interval and 400s server-side (icp-insights-02.har). If one of these
// specific queries comes back empty, a granularity-format mismatch is the
// first thing to check; `postInsightsQuery` degrading to `null` means that
// shows up as one empty widget, not a page crash.

interface TimeSeriesPoint {
  timeSpan: string;
  count: number;
}

/** Some of these ported queries return a single object when scoped to one id and (per the
 * schema shape implied by an `apiId`/`backend`-keyed field sitting next to the list) may
 * return an array when the underlying resolver treats the filter as multi-id. Normalizing
 * here means both shapes resolve correctly without needing GraphQL schema introspection. */
function asArray<T>(v: T | T[] | null | undefined): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

// Per-API total requests over time — distinct from the by-app breakdown below;
// this is the API's own total, not summed from per-app numbers. The analytics
// index keys APIs by "name - version" composite strings (same quirk as
// fetchErrorsDetails/fetchErrorsByStatusCode), so uuid-only apiIds filters
// match nothing — every known alias is sent alongside the uuid.
export async function fetchApiUsageOverTime(queryApiUrl: string, dataFilter: Record<string, unknown>, apiId: string, apiVersion: string, apiAliases: string[], time: { from: string; to: string; queryGranularity: string }): Promise<TimeSeriesPoint[]> {
  const result = await postInsightsQuery<{
    data?: { getAPIUsageOverTime?: { apiId: string | null; usage?: TimeSeriesPoint[] } | { apiId: string | null; usage?: TimeSeriesPoint[] }[] };
  }>(
    queryApiUrl,
    `query ($dataFilter: DataFilter!, $timeFilter: TimeFilter!, $apiUsageOvertimeFilter: APIUsageOverTimeFilter!) {
      getAPIUsageOverTime(timeFilter: $timeFilter, apiUsageOvertimeFilter: $apiUsageOvertimeFilter, dataFilter: $dataFilter) {
        apiId
        usage { timeSpan count }
      }
    }`,
    {
      timeFilter: { from: time.from, to: time.to },
      apiUsageOvertimeFilter: { apiIds: [...new Set([apiId, ...apiAliases])], appIds: [], granularity: time.queryGranularity, trafficType: 'ALL', apiIdVersionPairs: apiVersion ? [{ id: apiId, version: apiVersion }] : [] },
      dataFilter,
    },
  );
  const entries = asArray(result?.data?.getAPIUsageOverTime);
  const accepted = new Set([apiId, ...apiAliases].filter(Boolean));
  // Backend may key the entry by uuid, by "name - version" composite, or by
  // null when it aggregated a single-API filter — accept all three, but never
  // a non-matching named entry (that's another API's traffic).
  const match = entries.find((e) => e.apiId != null && accepted.has(e.apiId)) ?? (entries.length === 1 && entries[0].apiId == null ? entries[0] : undefined);
  return match?.usage ?? [];
}

// Per-application breakdown of a single API's traffic over time. Sends every
// known alias alongside the uuid — the index keys APIs by "name - version"
// composites, so a uuid-only filter matches nothing.
export async function fetchApiUsageByApp(
  queryApiUrl: string,
  dataFilter: Record<string, unknown>,
  apiId: string,
  apiVersion: string,
  apiAliases: string[],
  time: { from: string; to: string; queryGranularity: string },
): Promise<{ applicationName: string; usage: TimeSeriesPoint[] }[]> {
  const result = await postInsightsQuery<{
    data?: { getAPIUsageByAppOverTime?: { usage?: { applicationId: string; applicationName: string; usage?: TimeSeriesPoint[] }[] } };
  }>(
    queryApiUrl,
    `query ($dataFilter: DataFilter!, $timeFilter: TimeFilter!, $apiUsageOvertimeFilter: APIUsageOverTimeFilter!) {
      getAPIUsageByAppOverTime(timeFilter: $timeFilter, apiUsageOvertimeFilter: $apiUsageOvertimeFilter, dataFilter: $dataFilter) {
        usage { applicationId applicationName usage { timeSpan count } }
      }
    }`,
    {
      timeFilter: { from: time.from, to: time.to },
      apiUsageOvertimeFilter: { apiIds: [...new Set([apiId, ...apiAliases])], appIds: [], granularity: time.queryGranularity, trafficType: 'ALL', apiIdVersionPairs: apiVersion ? [{ id: apiId, version: apiVersion }] : [] },
      dataFilter,
    },
  );
  return (result?.data?.getAPIUsageByAppOverTime?.usage ?? []).map((u) => ({ applicationName: u.applicationName, usage: u.usage ?? [] }));
}

// Per-backend breakdown of a single API's traffic over time — "Usage by Backend".
// Sends every known alias alongside the uuid (composite-id index quirk).
export async function fetchUsageByBackend(queryApiUrl: string, dataFilter: Record<string, unknown>, apiId: string, apiAliases: string[], time: { from: string; to: string; queryGranularity: string }): Promise<{ backend: string; usage: TimeSeriesPoint[] }[]> {
  const result = await postInsightsQuery<{
    data?: { getAPIUsageByBackendOverTime?: { usage?: { backend: string; usage?: TimeSeriesPoint[] }[] } };
  }>(
    queryApiUrl,
    `query ($dataFilter: DataFilter!, $timeFilter: TimeFilter!, $apiUsageByBackendOverTimeFilter: APIUsageByBackendOverTimeFilter!) {
      getAPIUsageByBackendOverTime(timeFilter: $timeFilter, apiUsageByBackendOverTimeFilter: $apiUsageByBackendOverTimeFilter, dataFilter: $dataFilter) {
        usage { backend usage { timeSpan count } }
      }
    }`,
    { timeFilter: { from: time.from, to: time.to }, apiUsageByBackendOverTimeFilter: { apiIds: [...new Set([apiId, ...apiAliases])], granularity: time.queryGranularity }, dataFilter },
  );
  return (result?.data?.getAPIUsageByBackendOverTime?.usage ?? []).map((u) => ({ backend: u.backend, usage: u.usage ?? [] }));
}

// Per-resource-path breakdown — "Resource Usage" table. Sends every known
// alias alongside the uuid and accepts any of them back in the response
// (composite-id index quirk).
export async function fetchResourceUsage(queryApiUrl: string, dataFilter: Record<string, unknown>, apiId: string, apiAliases: string[], time: { from: string; to: string }): Promise<{ apiResourceTemplate: string; apiMethod: string; count: number }[]> {
  const result = await postInsightsQuery<{
    data?: { getResourceUsage?: { usage?: { apiId: string; apiResourceTemplate: string; apiMethod: string; count: number }[] } };
  }>(
    queryApiUrl,
    `query ($dataFilter: DataFilter!, $timeFilter: TimeFilter!, $resourceUsageFilter: ResourceUsageFilter!) {
      getResourceUsage(timeFilter: $timeFilter, resourceUsageFilter: $resourceUsageFilter, dataFilter: $dataFilter) {
        usage { apiId apiResourceTemplate apiMethod count }
      }
    }`,
    {
      timeFilter: { from: time.from, to: time.to },
      resourceUsageFilter: { apiIds: [...new Set([apiId, ...apiAliases])], appIds: [], trafficType: 'ALL', searchFilter: { searchText: '', apiIds: [] }, paginationFilter: { limit: 20, offset: 0, sortBy: 'count', sortOrder: 'desc' } },
      dataFilter,
    },
  );
  const accepted = new Set([apiId, ...apiAliases].filter(Boolean));
  return (result?.data?.getResourceUsage?.usage ?? []).filter((u) => accepted.has(u.apiId));
}

// p95 (`response`) vs median (`responseMedian`) latency over time — "Latency by Category".
export async function fetchLatencyByCategory(
  queryApiUrl: string,
  dataFilter: Record<string, unknown>,
  apiId: string,
  time: { from: string; to: string; queryGranularity: string },
): Promise<{ timeSpan: string; response: number; backend: number; requestMediation: number; responseMediation: number; responseMedian: number; backendMedian: number; requestMediationMedian: number; responseMediationMedian: number }[]> {
  const result = await postInsightsQuery<{
    data?: {
      getLatency?: { summary?: { timeSpan: string; response: number; backend: number; requestMediation: number; responseMediation: number; responseMedian: number; backendMedian: number; requestMediationMedian: number; responseMediationMedian: number }[] };
    };
  }>(
    queryApiUrl,
    `query ($dataFilter: DataFilter!, $timeFilter: TimeFilter!, $latencyFilter: LatencyFilter!) {
      getLatency(timeFilter: $timeFilter, latencyFilter: $latencyFilter, dataFilter: $dataFilter) {
        summary { timeSpan response backend requestMediation responseMediation responseMedian backendMedian requestMediationMedian responseMediationMedian }
      }
    }`,
    { timeFilter: { from: time.from, to: time.to }, latencyFilter: { apiId, granularity: time.queryGranularity }, dataFilter },
  );
  return result?.data?.getLatency?.summary ?? [];
}

// Project-wide slowest-API ranking — real, shown as project context alongside a single API's page.
export async function fetchTopSlowestApis(queryApiUrl: string, dataFilter: Record<string, unknown>, time: { from: string; to: string }): Promise<{ apiId: string; latency: number }[]> {
  const result = await postInsightsQuery<{ data?: { topSlowestAPIs?: { apiId: string; latency: number }[] } }>(
    queryApiUrl,
    `query ($dataFilter: DataFilter!, $timeFilter: TimeFilter!, $limit: Int!) {
      topSlowestAPIs(filter: $timeFilter, dataFilter: $dataFilter, limit: $limit) { apiId latency }
    }`,
    { timeFilter: { from: time.from, to: time.to }, dataFilter, limit: 10 },
  );
  return result?.data?.topSlowestAPIs ?? [];
}

// Top-10 slowest with display names resolved via listAllAPI (bars otherwise show raw apiIds). projectId null = org-wide.
export async function fetchTopSlowestApisNamed(orgUuid: string, projectId: string | null, insightsEnv: InsightsEnvironment, range: InsightsRange, queryApiUrl: string): Promise<SlowestApiRow[]> {
  const time = rangeToTimeFilter(range);
  const dataFilter = { orgId: orgUuid, environmentIds: getEnvironmentIds(insightsEnv), tenant: 'carbon.super', ...(projectId ? { projectId } : {}) };
  const [slowest, apis] = await Promise.all([fetchTopSlowestApis(queryApiUrl, dataFilter, time), fetchAllProjectApis(queryApiUrl, dataFilter)]);
  const nameById = new Map(apis.map((a) => [a.id, a.displayName || a.name]));
  return slowest.map((s) => ({ name: nameById.get(s.apiId) || s.apiId, latencyMs: Math.round(s.latency) }));
}

// Error counts by category (auth/targetConnectivity/throttled/other) over time — "Errors Over Time".
export async function fetchErrorsByCategory(
  queryApiUrl: string,
  dataFilter: Record<string, unknown>,
  apiId: string,
  time: { from: string; to: string; queryGranularity: string },
): Promise<{ timeSpan: string; auth: number; targetConnectivity: number; throttled: number; other: number }[]> {
  const result = await postInsightsQuery<{
    data?: { getErrorsByCategory?: { errors?: { timeSpan: string; auth: number; targetConnectivity: number; throttled: number; other: number }[] } };
  }>(
    queryApiUrl,
    `query ($dataFilter: DataFilter!, $timeFilter: TimeFilter!, $errorsByCategoryFilter: ErrorsByCategoryFilter!) {
      getErrorsByCategory(timeFilter: $timeFilter, errorsByCategoryFilter: $errorsByCategoryFilter, dataFilter: $dataFilter) {
        errors { timeSpan auth targetConnectivity throttled other }
      }
    }`,
    { timeFilter: { from: time.from, to: time.to }, dataFilter, errorsByCategoryFilter: { apiId, categories: [], granularity: time.queryGranularity } },
  );
  return result?.data?.getErrorsByCategory?.errors ?? [];
}

// Status-code counts, split Proxy vs Target — real 2-row × status-code matrix ("Errors by Status Code").
export async function fetchErrorsByStatusCode(
  queryApiUrl: string,
  dataFilter: Record<string, unknown>,
  apiId: string,
  apiAliases: string[],
  time: { from: string; to: string },
): Promise<{ proxy: { statusCode: string; count: number }[]; target: { statusCode: string; count: number }[] }> {
  const query = `query ($dataFilter: DataFilter!, $timeFilter: TimeFilter!, $errorCountByStatusCodeFilter: ErrorCountByStatusCodeFilter!) {
    getErrorsByStatusCode(timeFilter: $timeFilter, errorCountByStatusCodeFilter: $errorCountByStatusCodeFilter, dataFilter: $dataFilter) {
      errors { apiId errorCountByCode { statusCode count } }
    }
  }`;
  type Resp = { data?: { getErrorsByStatusCode?: { errors?: { apiId: string; errorCountByCode?: { statusCode: string; count: number }[] }[] } } };
  const paginationFilter = { limit: 20, offset: 0, sortBy: 'count', sortOrder: 'desc' };
  // Response apiId may be the uuid OR a "name - version" composite (same
  // backend quirk as getErrorsDetails), so match every alias — and never fall
  // back to errors[0], which belongs to a different API.
  const accepted = new Set([apiId, ...apiAliases].filter(Boolean));
  const extract = (res: Resp | null) => {
    const errors = res?.data?.getErrorsByStatusCode?.errors ?? [];
    return errors.find((e) => accepted.has(e.apiId))?.errorCountByCode ?? [];
  };
  const [proxyRes, targetRes] = await Promise.all([
    postInsightsQuery<Resp>(queryApiUrl, query, { timeFilter: { from: time.from, to: time.to }, dataFilter, errorCountByStatusCodeFilter: { apiId, errorType: 'PROXY', paginationFilter } }),
    postInsightsQuery<Resp>(queryApiUrl, query, { timeFilter: { from: time.from, to: time.to }, dataFilter, errorCountByStatusCodeFilter: { apiId, errorType: 'TARGET', paginationFilter } }),
  ]);
  return { proxy: extract(proxyRes), target: extract(targetRes) };
}

// Per-application error breakdown — "Errors by Category" table (Application/Reason/Count).
// The response's `apiId` is NOT the uuid — devant-insights-02.har shows the
// backend returns a "name - version" composite there (e.g. "hello-world-service
// - v1.0"), so rows are matched against every known alias for the API instead
// of the uuid alone (a bare uuid match silently emptied the table).
export async function fetchErrorsDetails(queryApiUrl: string, dataFilter: Record<string, unknown>, apiId: string, apiAliases: string[], time: { from: string; to: string }): Promise<{ applicationName: string; reason: string; count: number }[]> {
  const result = await postInsightsQuery<{ data?: { getErrorsDetails?: { usage?: { apiId: string; applicationName: string; reason: string; count: number }[] } } }>(
    queryApiUrl,
    `query ($dataFilter: DataFilter!, $timeFilter: TimeFilter!, $errorsDetailsFilter: ErrorsDetailsFilter!) {
      getErrorsDetails(timeFilter: $timeFilter, errorsDetailsFilter: $errorsDetailsFilter, dataFilter: $dataFilter) {
        usage { apiId applicationName reason count }
      }
    }`,
    { timeFilter: { from: time.from, to: time.to }, dataFilter, errorsDetailsFilter: { apiId, paginationFilter: { limit: 20, offset: 0, sortBy: 'count', sortOrder: 'desc' } } },
  );
  const accepted = new Set([apiId, ...apiAliases].filter(Boolean));
  return (result?.data?.getErrorsDetails?.usage ?? []).filter((u) => accepted.has(u.apiId));
}

// Shared time-range → query-time-filter conversion, exported for the API-view hook
// (mirrors `rangeToTimeFilter` above, which stays project-view-internal).
export function apiRangeToTimeFilter(range: InsightsRange) {
  return rangeToTimeFilter(range);
}

// Merges the base bundle's three time-series (requests/errors/latency, each
// independently bucketed by the backend) into one aligned trend for the
// Overview/Traffic chart. Buckets are matched by timestamp, same technique
// as the project view's `buildTrend`.
function buildApiOverviewTrend(
  usage: { timeSpan: string; count: number }[],
  errors: { timeSpan: string; auth: number; targetConnectivity: number; throttled: number; other: number }[],
  latency: { timeSpan: string; response: number }[],
  labelGranularity: 'hour' | 'day' | 'week',
): ApiInsightsRaw['overviewTrend'] {
  const buckets = new Map<number, { requests: number; errors: number; latency: number }>();
  const get = (ts: number) => buckets.get(ts) ?? { requests: 0, errors: 0, latency: 0 };
  // Timestamps are truncated to the label granularity (same as buildTrend) so
  // the three independently-bucketed series land in the same buckets; counts
  // accumulate when a series has finer sub-buckets than the label granularity.
  const bucketKey = (timeSpan: string): number | null => {
    const ts = new Date(timeSpan).getTime();
    return Number.isNaN(ts) ? null : truncateTs(ts, labelGranularity);
  };
  usage.forEach((p) => {
    const ts = bucketKey(p.timeSpan);
    if (ts === null) return;
    const b = get(ts);
    buckets.set(ts, { ...b, requests: b.requests + (p.count || 0) });
  });
  errors.forEach((p) => {
    const ts = bucketKey(p.timeSpan);
    if (ts === null) return;
    const b = get(ts);
    buckets.set(ts, { ...b, errors: b.errors + (p.auth || 0) + (p.targetConnectivity || 0) + (p.throttled || 0) + (p.other || 0) });
  });
  latency.forEach((p) => {
    const ts = bucketKey(p.timeSpan);
    if (ts === null) return;
    buckets.set(ts, { ...get(ts), latency: Math.round(p.response || 0) });
  });
  return [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([ts, v]) => ({ label: bucketLabel(ts, labelGranularity), requests: v.requests, errors: v.errors, latency: v.latency }));
}

function statusCodeKind(code: string): 'limited' | 'down' | null {
  const digit = code?.trim()[0];
  if (digit === '4') return 'limited';
  if (digit === '5') return 'down';
  return null;
}

export async function fetchApiInsights(orgUuid: string, projectId: string, insightsEnv: InsightsEnvironment, apiRef: InsightsApiRef, range: InsightsRange, tab: 'overview' | 'traffic' | 'latency' | 'errors', queryApiUrl: string): Promise<ApiInsightsRaw> {
  const time = rangeToTimeFilter(range);
  const dataFilter = { orgId: orgUuid, environmentIds: getEnvironmentIds(insightsEnv), tenant: 'carbon.super', projectId };

  // Same real-apiId resolution `fetchProjectInsights` uses: the component's own
  // `apiId` is frequently stale/unset, so `listAllAPI` (project-scoped) is the
  // authoritative source, matched by handler/display name.
  const projectApis = await fetchAllProjectApis(queryApiUrl, dataFilter);
  const { id: apiId, version: apiVersion } = resolveApi(apiRef, projectApis);
  const apiMeta = projectApis.find((a) => a.id === apiId);
  const apiAliases = apiMeta ? [apiMeta.version ? `${apiMeta.name} - ${apiMeta.version}` : '', apiMeta.name, apiMeta.displayName].filter(Boolean) : [];
  if (!apiId) {
    return {
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
  }

  // Base bundle — always fetched: the KPI row (shown on every tab) and the
  // Overview/Traffic trend + Availability donut all come from it, and it
  // doubles as the Errors-tab trend (errorsTrend) and Latency-tab trend
  // (latencyTrend), so no per-tab duplicate queries for those two charts.
  const [usage, errorsByCategory, latencySummary, statusCodes, totals] = await Promise.all([
    fetchApiUsageOverTime(queryApiUrl, dataFilter, apiId, apiVersion, apiAliases, time),
    fetchErrorsByCategory(queryApiUrl, dataFilter, apiId, time),
    fetchLatencyByCategory(queryApiUrl, dataFilter, apiId, time),
    fetchErrorsByStatusCode(queryApiUrl, dataFilter, apiId, apiAliases, time),
    // getTotalTrafficByAPI/getTotalErrorsByAPI are the per-API resolvers verified
    // to return real counts (icp HAR) — the usage-over-time series below only
    // feeds the charts. getOverallLatencyByAPI is omitted: it consistently errors
    // server-side ("internal system error").
    postInsightsQuery<{ data?: { getTotalTrafficByAPI?: number; getTotalErrorsByAPI?: { proxy: number } } }>(
      queryApiUrl,
      `query ($dataFilter: DataFilter!, $filter: TimeFilter!, $apiId: ID!) {
        getTotalTrafficByAPI(filter: $filter, dataFilter: $dataFilter, apiId: $apiId)
        getTotalErrorsByAPI(filter: $filter, dataFilter: $dataFilter, apiId: $apiId) { proxy }
      }`,
      { filter: { from: time.from, to: time.to }, dataFilter: { orgId: orgUuid, environmentIds: getEnvironmentIds(insightsEnv), tenant: 'carbon.super' }, apiId },
    ),
  ]);

  const totalRequests = totals?.data?.getTotalTrafficByAPI ?? usage.reduce((s, p) => s + (p.count || 0), 0);
  const totalErrors = totals?.data?.getTotalErrorsByAPI?.proxy ?? errorsByCategory.reduce((s, p) => s + (p.auth || 0) + (p.targetConnectivity || 0) + (p.throttled || 0) + (p.other || 0), 0);
  // Overall latency for THIS integration across the whole range (getLatency is
  // already apiId-scoped) — mean over buckets that carried traffic, not just the
  // last bucket, so the KPI reflects the integration's overall latency.
  const meanOver = (vals: number[]): number => {
    const nonZero = vals.filter((v) => v > 0);
    return nonZero.length ? Math.round(nonZero.reduce((s, v) => s + v, 0) / nonZero.length) : 0;
  };
  const latencyP95 = meanOver(latencySummary.map((p) => p.response || 0));
  const latencyMedian = meanOver(latencySummary.map((p) => p.responseMedian || 0));

  const allStatusCounts = [...statusCodes.proxy, ...statusCodes.target];
  const limited = allStatusCounts.filter((c) => statusCodeKind(c.statusCode) === 'limited').reduce((s, c) => s + c.count, 0);
  const down = allStatusCounts.filter((c) => statusCodeKind(c.statusCode) === 'down').reduce((s, c) => s + c.count, 0);
  const availableCount = Math.max(0, totalRequests - limited - down);
  const availTotal = Math.max(1, availableCount + limited + down);
  const availability: ApiInsightsRaw['availability'] = (
    [
      { kind: 'available', label: 'Available', value: Math.round((availableCount / availTotal) * 1000) / 10 },
      { kind: 'limited', label: 'Limited', value: Math.round((limited / availTotal) * 1000) / 10 },
      { kind: 'down', label: 'Down', value: Math.round((down / availTotal) * 1000) / 10 },
    ] satisfies ApiInsightsRaw['availability']
  ).filter((s) => s.value > 0);

  const overviewTrend = buildApiOverviewTrend(usage, errorsByCategory, latencySummary, time.labelGranularity);
  const errorsTrend: ApiInsightsRaw['errorsTrend'] = errorsByCategory.map((p) => ({
    label: bucketLabel(new Date(p.timeSpan).getTime(), time.labelGranularity),
    auth: p.auth || 0,
    targetConnectivity: p.targetConnectivity || 0,
    throttled: p.throttled || 0,
    other: p.other || 0,
  }));
  const latencyTrend: ApiInsightsRaw['latencyTrend'] = latencySummary.map((p) => ({
    label: bucketLabel(new Date(p.timeSpan).getTime(), time.labelGranularity),
    p95: Math.round(p.response || 0),
    median: Math.round(p.responseMedian || 0),
    backendP95: Math.round(p.backend || 0),
    backendMedian: Math.round(p.backendMedian || 0),
    requestMedP95: Math.round(p.requestMediation || 0),
    requestMedMedian: Math.round(p.requestMediationMedian || 0),
    responseMedP95: Math.round(p.responseMediation || 0),
    responseMedMedian: Math.round(p.responseMediationMedian || 0),
  }));

  const codeList = [...new Set([...statusCodes.proxy, ...statusCodes.target].map((c) => c.statusCode))].sort();
  const proxyByCode = new Map(statusCodes.proxy.map((c) => [c.statusCode, c.count]));
  const targetByCode = new Map(statusCodes.target.map((c) => [c.statusCode, c.count]));
  const statusCodeHeatmap: ApiInsightsRaw['statusCodeHeatmap'] = {
    rows: ['Proxy', 'Target'],
    cols: codeList,
    cells: codeList.flatMap((code, ci) => [
      { row: 0, col: ci, value: proxyByCode.get(code) ?? 0 },
      { row: 1, col: ci, value: targetByCode.get(code) ?? 0 },
    ]),
    max: Math.max(1, ...[...proxyByCode.values(), ...targetByCode.values()]),
  };

  const base: Omit<ApiInsightsRaw, 'byApplication' | 'byBackend' | 'resources' | 'errorsByCategory'> = {
    totalRequests,
    totalErrors,
    latencyP95,
    latencyMedian,
    overviewTrend,
    availability,
    latencyTrend,
    errorsTrend,
    statusCodeHeatmap,
  };

  if (tab === 'traffic') {
    const [byApp, byBackend, resources] = await Promise.all([
      fetchApiUsageByApp(queryApiUrl, dataFilter, apiId, apiVersion, apiAliases, time),
      fetchUsageByBackend(queryApiUrl, dataFilter, apiId, apiAliases, time),
      fetchResourceUsage(queryApiUrl, dataFilter, apiId, apiAliases, time),
    ]);
    return {
      ...base,
      byApplication: byApp.map((a) => ({ label: a.applicationName, value: a.usage.reduce((s, p) => s + (p.count || 0), 0) })),
      byBackend: byBackend.map((b) => ({ label: b.backend, value: b.usage.reduce((s, p) => s + (p.count || 0), 0) })),
      resources: resources.map((r) => ({ path: r.apiResourceTemplate, method: r.apiMethod, count: r.count, share: totalRequests > 0 ? `${((r.count / totalRequests) * 100).toFixed(1)}%` : '0%' })),
      errorsByCategory: [],
    };
  }

  if (tab === 'errors') {
    const details = await fetchErrorsDetails(queryApiUrl, dataFilter, apiId, apiAliases, time);
    return { ...base, byApplication: [], byBackend: [], resources: [], errorsByCategory: details.map((d) => ({ app: d.applicationName, reason: d.reason, count: d.count })) };
  }

  return { ...base, byApplication: [], byBackend: [], resources: [], errorsByCategory: [] };
}
