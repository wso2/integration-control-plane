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
import { Button, Card, CardContent, Checkbox, CircularProgress, Grid, IconButton, ListItemText, MenuItem, PageContent, Select, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tooltip, Typography } from '@wso2/oxygen-ui';
import { LineChart } from '@wso2/oxygen-ui-charts-react';
import { BarChart3, RefreshCw } from '@wso2/oxygen-ui-icons-react';
import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { useProjectByHandler, useComponentByHandler, useComponents, useEnvironments, useProjectRuntimes } from '../api/queries';
import { useMetrics, type MetricEntry, type MetricsRequest } from '../api/metrics';
import { useMoesifMetricsConfig } from '../api/metricsMoesif';
import { isMoesifEnabled } from '../config/api';
import EmptyListing from '../components/EmptyListing';
import NotFound from '../components/NotFound';
import WorkflowMetricsSection from '../components/WorkflowMetricsSection';
import { resourceUrl, broaden, hasComponent, type ProjectScope, type ComponentScope } from '../nav';

export interface MetricsPageProps {
  scope: ProjectScope | ComponentScope;
  /** Backend selector control rendered in the page header (OpenSearch/Moesif toggle). */
  backendSelector?: JSX.Element;
  /**
   * Whether the OpenSearch observability backend is configured globally. Used
   * together with the targeted integration's Moesif configuration to decide
   * whether the backend toggle is shown (only when BOTH are configured).
   */
  opensearchConfigured?: boolean;
  /**
   * Called when the OpenSearch metrics request reports the backend as
   * unavailable at query time, letting the dispatcher fall back to Moesif and
   * surface its setup instructions instead of a dead-end error.
   */
  onUnavailable?: () => void;
}

const TIME_RANGES: Record<string, number> = { 'Past 1 hour': 1, 'Past 6 hours': 6, 'Past 24 hours': 24, 'Past 7 days': 168 };
const RESOLUTIONS: Record<string, string> = { '1 Minute': '1m', '5 Minutes': '5m', '15 Minutes': '15m', '1 Hour': '1h' };
const DEFAULT_RESOLUTION: Record<string, string> = {
  'Past 1 hour': '1 Minute',
  'Past 6 hours': '5 Minutes',
  'Past 24 hours': '15 Minutes',
  'Past 7 days': '1 Hour',
};
const LINE_OPTS = { dot: false, connectNulls: true, type: 'linear' as const };

const OVERVIEW_REQUEST_LINES = [
  { dataKey: 'successful', name: 'Success', stroke: '#4caf50' },
  { dataKey: 'failed', name: 'Failed', stroke: '#d32f2f' },
] as const;

const OVERVIEW_LATENCY_LINES = [
  { dataKey: 'avg', name: 'Average', stroke: '#4caf50' },
  { dataKey: 'p50', name: '50th Percentile', stroke: '#2196f3' },
  { dataKey: 'p95', name: '95th Percentile', stroke: '#ff9800' },
  { dataKey: 'p99', name: '99th Percentile', stroke: '#9c27b0' },
] as const;

function normalizeServiceType(st?: string): string {
  if (!st || st.toLowerCase() === 'ballerina' || st === 'BI') return 'BI';
  return st.toUpperCase();
}

function sumTimeSeries(ts: Record<string, number>): number {
  let s = 0;
  for (const v of Object.values(ts)) s += v;
  return s;
}

function avgNonZeroTimeSeries(ts: Record<string, number>): number {
  let s = 0,
    c = 0;
  for (const v of Object.values(ts)) {
    if (v > 0) {
      s += v;
      c++;
    }
  }
  return c > 0 ? s / c : 0;
}

interface ApiSummary {
  name: string;
  deployment: string;
  method: string;
  serviceType: string;
  integrationName: string;
  key: string;
  requestCount: number;
  errorCount: number;
  avgResponseTime: number;
  errorRate: number;
  entries: MetricEntry[];
}

function apiDisplayLabel(api: ApiSummary): string {
  const parts = [api.name];
  if (api.deployment) parts.push(api.deployment);
  if (api.method) parts.push(api.method);
  return parts.length > 1 ? `${parts[0]} (${parts.slice(1).join(' · ')})` : parts[0];
}

function apiDisplayLabelWithType(api: ApiSummary, showType: boolean): string {
  const base = apiDisplayLabel(api);
  if (showType) {
    const st = api.serviceType || 'BI';
    if (api.integrationName) return `[${st} · ${api.integrationName}] ${base}`;
    return `[${st}] ${base}`;
  }
  return base;
}

// Derive Top APIs grouped by serviceType+sublevel+groupCtx
function deriveApis(metrics: MetricEntry[], runtimeComponentMap: Record<string, string>): ApiSummary[] {
  const apiMap: Record<string, { successful: MetricEntry[]; failed: MetricEntry[]; method: string; serviceType: string; integrationName: string }> = {};
  for (const m of metrics) {
    const serviceType = normalizeServiceType(m.tags.service_type);
    const isMI = serviceType === 'MI';
    // For MI metrics, group by sublevel + method (e.g. "HelloWorld\0GET")
    // For BI metrics, group by sublevel + deployment
    const groupCtx = isMI ? (m.tags.method ?? '') : (m.tags.deployment ?? m.tags.app_name ?? '');
    const runtimeId = m.tags.icp_runtimeId ?? '';
    const integrationName = runtimeComponentMap[runtimeId] ?? '';
    const ownerKey = runtimeId || integrationName || 'unknown';
    const key = `${serviceType}\0${ownerKey}\0${m.tags.sublevel}\0${groupCtx}`;
    if (!apiMap[key]) apiMap[key] = { successful: [], failed: [], method: m.tags.method ?? '', serviceType, integrationName };
    if (integrationName && !apiMap[key].integrationName) apiMap[key].integrationName = integrationName;
    apiMap[key][m.tags.status === 'failed' ? 'failed' : 'successful'].push(m);
  }
  return Object.entries(apiMap)
    .map(([key, { successful, failed, method, serviceType, integrationName }]) => {
      const [, , name, deployment] = key.split('\0');
      const allEntries = [...successful, ...failed];
      const successReqs = successful.reduce((s, m) => s + sumTimeSeries(m.requests_total.timeSeriesData), 0);
      const failReqs = failed.reduce((s, m) => s + sumTimeSeries(m.requests_total.timeSeriesData), 0);
      const total = successReqs + failReqs;
      const avgMs = (successful.reduce((s, m) => s + avgNonZeroTimeSeries(m.response_time_seconds_avg.timeSeriesData), 0) / Math.max(successful.length, 1)) * 1000;
      // For MI, deployment holds the method (e.g. "GET"); for BI, it holds the deployment name
      const isMI = serviceType === 'MI';
      return {
        name,
        deployment: isMI ? '' : deployment,
        method: isMI ? deployment : method,
        serviceType,
        integrationName,
        key,
        requestCount: total,
        errorCount: failReqs,
        avgResponseTime: avgMs,
        errorRate: total > 0 ? (failReqs / total) * 100 : 0,
        entries: allEntries,
      };
    })
    .sort((a, b) => b.requestCount - a.requestCount);
}

// Aggregate metrics into chart-ready data
function aggregate(metrics: MetricEntry[]) {
  const requestsByTime: Record<string, { time: string; successful: number; failed: number }> = {};
  const latencyByTime: Record<string, { time: string; avg: number; p50: number; p95: number; p99: number; count: number }> = {};
  let totalRequests = 0;
  let errorCount = 0;
  let latestP95 = 0;

  for (const m of metrics) {
    const isFailed = m.tags.status === 'failed';
    for (const [ts, val] of Object.entries(m.requests_total.timeSeriesData)) {
      if (!requestsByTime[ts]) requestsByTime[ts] = { time: ts, successful: 0, failed: 0 };
      if (isFailed) {
        requestsByTime[ts].failed += val;
        errorCount += val;
      } else {
        requestsByTime[ts].successful += val;
      }
      totalRequests += val;
    }
    for (const [ts, val] of Object.entries(m.response_time_seconds_avg.timeSeriesData)) {
      if (val === 0) continue;
      if (!latencyByTime[ts]) latencyByTime[ts] = { time: ts, avg: 0, p50: 0, p95: 0, p99: 0, count: 0 };
      const e = latencyByTime[ts];
      e.count += 1;
      e.avg += val;
      e.p50 += m.response_time_seconds_percentile_50.timeSeriesData[ts] ?? 0;
      e.p95 += m.response_time_seconds_percentile_95.timeSeriesData[ts] ?? 0;
      e.p99 += m.response_time_seconds_percentile_99.timeSeriesData[ts] ?? 0;
    }
  }

  const timestamps = Object.keys(requestsByTime).sort();
  const latencyData = timestamps.map((ts) => {
    const e = latencyByTime[ts];
    if (!e || e.count === 0) return { time: ts, avg: 0, p50: 0, p95: 0, p99: 0 };
    const c = e.count;
    return { time: ts, avg: (e.avg / c) * 1000, p50: (e.p50 / c) * 1000, p95: (e.p95 / c) * 1000, p99: (e.p99 / c) * 1000 };
  });
  for (let i = latencyData.length - 1; i >= 0; i--) {
    if (latencyData[i].p95 > 0) {
      latestP95 = latencyData[i].p95;
      break;
    }
  }

  const requestsData = timestamps.map((ts) => requestsByTime[ts]);
  const errorPercentage = totalRequests > 0 ? (errorCount / totalRequests) * 100 : 0;
  return { requestsData, latencyData, totalRequests, errorCount, errorPercentage, latestP95 };
}

// Build per-API chart data: each selected API becomes a line
function buildApiChartData(apis: ApiSummary[], formatLabel: (iso: string) => string) {
  const allTimestamps = new Set<string>();
  for (const api of apis) {
    for (const entry of api.entries) {
      for (const ts of Object.keys(entry.requests_total.timeSeriesData)) allTimestamps.add(ts);
    }
  }
  const sorted = [...allTimestamps].sort();
  const reqData = sorted.map((ts) => {
    const row: Record<string, string | number> = { label: formatLabel(ts) };
    for (const api of apis) {
      row[api.key] = api.entries.reduce((s, e) => s + (e.requests_total.timeSeriesData[ts] ?? 0), 0);
    }
    return row;
  });
  const latData = sorted.map((ts) => {
    const row: Record<string, string | number> = { label: formatLabel(ts) };
    for (const api of apis) {
      let sum = 0,
        count = 0;
      for (const e of api.entries) {
        const v = e.response_time_seconds_avg.timeSeriesData[ts] ?? 0;
        if (v > 0) {
          sum += v;
          count++;
        }
      }
      row[api.key] = count > 0 ? (sum / count) * 1000 : 0;
    }
    return row;
  });
  return { reqData, latData };
}

// Build per-API success/error breakdowns: each selected API gets a line per chart
function buildApiBreakdownData(apis: ApiSummary[], formatLabel: (iso: string) => string) {
  const allTimestamps = new Set<string>();
  // Pre-aggregate per-API success/error timestamp maps to avoid re-filtering inside the sorted loop
  const apiSuccessMap: Record<string, Record<string, number>> = {};
  const apiErrorMap: Record<string, Record<string, number>> = {};
  for (const api of apis) {
    apiSuccessMap[api.key] = {};
    apiErrorMap[api.key] = {};
    for (const entry of api.entries) {
      const target = entry.tags.status === 'failed' ? apiErrorMap[api.key] : apiSuccessMap[api.key];
      for (const [ts, val] of Object.entries(entry.requests_total.timeSeriesData)) {
        allTimestamps.add(ts);
        target[ts] = (target[ts] ?? 0) + val;
      }
    }
  }
  const sorted = [...allTimestamps].sort();
  const successData = sorted.map((ts) => {
    const row: Record<string, string | number> = { label: formatLabel(ts) };
    for (const api of apis) {
      row[api.key] = apiSuccessMap[api.key][ts] ?? 0;
    }
    return row;
  });
  const errorData = sorted.map((ts) => {
    const row: Record<string, string | number> = { label: formatLabel(ts) };
    for (const api of apis) {
      row[api.key] = apiErrorMap[api.key][ts] ?? 0;
    }
    return row;
  });
  return { successData, errorData };
}

function formatLabel(iso: string, showDate: boolean): string {
  const d = new Date(iso);
  const timeOptions: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: false };
  if (showDate) {
    const date = `${d.getMonth() + 1}/${d.getDate()}`;
    const time = d.toLocaleTimeString([], timeOptions);
    return `${date} ${time}`;
  }
  return d.toLocaleTimeString([], timeOptions);
}

function isUnavailable(error: unknown): boolean {
  if (!error) return false;
  const status = (error as { status?: number }).status;
  const message = (error as Error).message ?? '';
  return status === 503 || message.includes('Observability service is unavailable') || message.includes('OpenSearch service is unavailable');
}

const COLORS = ['#4caf50', '#2196f3', '#ff9800', '#e91e63', '#9c27b0'];

function LegendItem({ label, color, hidden, onToggle }: { label: string; color: string; hidden: boolean; onToggle: () => void }) {
  return (
    <Stack
      direction="row"
      alignItems="center"
      gap={0.75}
      role="button"
      tabIndex={0}
      aria-pressed={hidden}
      aria-label={`Toggle ${label}`}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggle();
        }
      }}
      sx={{
        cursor: 'pointer',
        opacity: hidden ? 0.4 : 1,
        borderRadius: '4px',
        '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: '2px' },
      }}>
      <span style={{ width: 14, height: 3, backgroundColor: color, display: 'inline-block', borderRadius: 1 }} />
      <Typography variant="caption" noWrap sx={{ textDecoration: hidden ? 'line-through' : 'none' }}>
        {label}
      </Typography>
    </Stack>
  );
}

function StatCard({ title, value, color }: { title: string; value: string; color?: string }) {
  return (
    <Card variant="outlined" sx={{ height: '100%' }}>
      <CardContent>
        <Typography variant="body2" color="text.secondary">
          {title}
        </Typography>
        <Typography variant="h4" sx={{ fontWeight: 700, mt: 1, color }}>
          {value}
        </Typography>
      </CardContent>
    </Card>
  );
}

export default function MetricsOpenSearch({ scope, backendSelector, opensearchConfigured, onUnavailable }: MetricsPageProps): JSX.Element {
  const isComponent = hasComponent(scope);
  const { data: project, isLoading: loadingProject } = useProjectByHandler(scope.project);
  const projectId = project?.id ?? '';
  const { data: singleComponent, isLoading: loadingComponent } = useComponentByHandler(projectId, isComponent ? scope.component : undefined);
  const { data: components = [], isLoading: loadingComponents } = useComponents(scope.org, projectId);
  const { data: environments = [], isLoading: loadingEnvironments } = useEnvironments(projectId);

  const [envFilter, setEnvFilter] = useState('');
  const [timeRange, setTimeRange] = useState('Past 1 hour');
  const [refreshKey, setRefreshKey] = useState(0);
  // The metrics query's refetch handle, reachable from the stable refreshAll callback
  // declared before the query itself.
  const refetchRef = useRef<(() => void) | undefined>(undefined);
  const refreshAll = useCallback(() => {
    refetchRef.current?.();
    setRefreshKey((k) => k + 1);
  }, []);
  const [integrationFilter, setIntegrationFilter] = useState('all');
  const [selectedApiKeys, setSelectedApiKeys] = useState<string[]>([]);
  const [hiddenOverviewLines, setHiddenOverviewLines] = useState<Set<string>>(new Set());
  const [hiddenApiLines, setHiddenApiLines] = useState<Set<string>>(new Set());

  const toggleOverviewLine = useCallback((key: string) => {
    setHiddenOverviewLines((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleApiLine = useCallback((key: string) => {
    setHiddenApiLines((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const effectiveEnvId = envFilter || environments[0]?.id || '';
  const componentId = isComponent ? (singleComponent?.id ?? '') : '';

  // The integration whose Moesif configuration decides whether the backend
  // toggle is offered: the single component at component scope, or the selected
  // integration at project scope ('all' resolves to none). The toggle only
  // appears when OpenSearch is configured AND this integration's Moesif
  // dashboard is linked, so a single-backend setup shows no toggle.
  // The backend toggle only exists when the Moesif backend is enabled globally.
  // When it is disabled we skip the Moesif config query entirely so no Moesif
  // request is made and no toggle is offered.
  const moesifEnabled = isMoesifEnabled();
  const toggleTargetComponentId = isComponent ? componentId : integrationFilter !== 'all' ? integrationFilter : '';
  const { data: moesifConfig } = useMoesifMetricsConfig(moesifEnabled ? toggleTargetComponentId || undefined : undefined, moesifEnabled ? effectiveEnvId || undefined : undefined);
  const showBackendToggle = moesifEnabled && !!opensearchConfigured && !!moesifConfig?.dashboardsCreated;

  // Fetch all runtimes for the project to build runtimeId → integration name map
  const { data: projectRuntimes = [] } = useProjectRuntimes(effectiveEnvId, projectId);
  const runtimeComponentMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const r of projectRuntimes) {
      if (r.component?.displayName) map[r.runtimeId] = r.component.displayName;
    }
    return map;
  }, [projectRuntimes]);

  const metricsRequest = useMemo<MetricsRequest | null>(() => {
    if (!effectiveEnvId) return null;
    if (isComponent && !componentId) return null;
    const hours = TIME_RANGES[timeRange] ?? 1;
    const now = new Date();
    const req: MetricsRequest = {
      environmentId: effectiveEnvId,
      startTime: new Date(now.getTime() - hours * 3600_000).toISOString(),
      endTime: now.toISOString(),
      resolutionInterval: RESOLUTIONS[DEFAULT_RESOLUTION[timeRange] ?? '1 Minute'] ?? '1m',
    };
    if (isComponent) {
      req.componentId = componentId;
    } else if (integrationFilter !== 'all') {
      req.componentId = integrationFilter;
    }
    return req;
  }, [isComponent, componentId, integrationFilter, effectiveEnvId, timeRange]);

  const getTimeRange = useCallback(() => {
    const hours = TIME_RANGES[timeRange] ?? 1;
    const now = new Date();
    return { startTime: new Date(now.getTime() - hours * 3600_000).toISOString(), endTime: now.toISOString() };
  }, [timeRange]);

  const { data: metricsData, isLoading, error, refetch } = useMetrics(metricsRequest, getTimeRange);
  refetchRef.current = refetch;
  const allInboundMetrics = useMemo(() => metricsData?.inboundMetrics ?? [], [metricsData]);

  const inboundMetrics = allInboundMetrics;
  const filtersDisabled = isUnavailable(error);

  // When the metrics request reports OpenSearch as unavailable, let the
  // dispatcher fall back to Moesif so its setup instructions are shown instead
  // of a dead-end error here.
  useEffect(() => {
    if (isUnavailable(error)) onUnavailable?.();
  }, [error, onUnavailable]);

  const { requestsData, latencyData, totalRequests, errorCount, errorPercentage, latestP95 } = useMemo(() => aggregate(inboundMetrics), [inboundMetrics]);
  const apis = useMemo(() => deriveApis(inboundMetrics, runtimeComponentMap), [inboundMetrics, runtimeComponentMap]);
  const top5 = apis.slice(0, 5);

  // Auto-select all APIs by default
  const effectiveSelectedApis = useMemo(() => {
    const valid = apis.filter((a) => selectedApiKeys.includes(a.key));
    return valid.length > 0 ? valid : apis;
  }, [apis, selectedApiKeys]);

  const showIntegrationName = true;
  const showDate = (TIME_RANGES[timeRange] ?? 1) >= 24;
  const makeLabel = useCallback((iso: string) => formatLabel(iso, showDate), [showDate]);
  const overviewXAxisInterval = useMemo(() => Math.max(0, Math.ceil((requestsData.length || 1) / 5) - 1), [requestsData.length]);
  const { reqData: apiReqData, latData: apiLatData } = useMemo(() => buildApiChartData(effectiveSelectedApis, makeLabel), [effectiveSelectedApis, makeLabel]);
  const apiXAxisInterval = useMemo(() => Math.max(0, Math.ceil((apiReqData?.length || apiLatData?.length || 1) / 5) - 1), [apiReqData?.length, apiLatData?.length]);
  const { successData: apiSuccessData, errorData: apiErrorData } = useMemo(() => buildApiBreakdownData(effectiveSelectedApis, makeLabel), [effectiveSelectedApis, makeLabel]);
  const apiLines = effectiveSelectedApis.map((a) => ({ key: a.key, label: apiDisplayLabelWithType(a, showIntegrationName) }));

  const requestsChartData = useMemo(() => requestsData.map((d) => ({ ...d, label: makeLabel(d.time) })), [requestsData, makeLabel]);
  const latencyChartData = useMemo(() => latencyData.map((d) => ({ ...d, label: makeLabel(d.time) })), [latencyData, makeLabel]);

  // Early returns
  const loadingContext = isComponent ? loadingComponent : loadingComponents;
  if (loadingProject || loadingContext || loadingEnvironments) {
    return (
      <PageContent sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 8 }}>
        <CircularProgress />
      </PageContent>
    );
  }
  if (!project) {
    return <NotFound message="Project not found" backTo={resourceUrl(broaden(scope)!, 'overview')} backLabel="Back to Organization" />;
  }
  if (isComponent && !singleComponent) {
    return <NotFound message="Component not found" backTo={resourceUrl(broaden(scope)!, 'overview')} backLabel="Back to Project" />;
  }
  if (environments.length === 0) {
    return (
      <PageContent>
        <EmptyListing icon={<BarChart3 size={48} />} title="No environments" description="Configure an environment to view metrics." />
      </PageContent>
    );
  }

  return (
    <PageContent>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Typography variant="h1">Metrics</Typography>
        <Stack direction="row" alignItems="center" gap={1}>
          {showBackendToggle && backendSelector}
          <Tooltip title="Refresh">
            <IconButton size="small" onClick={refreshAll} disabled={filtersDisabled || !metricsRequest}>
              <RefreshCw size={18} />
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>

      <Stack direction="row" gap={2} sx={{ mb: 3 }} flexWrap="wrap" alignItems="center">
        {environments.length > 0 && (
          <Select value={effectiveEnvId} onChange={(e) => setEnvFilter(e.target.value as string)} size="small" sx={{ minWidth: 140 }} inputProps={{ 'aria-label': 'Environment' }} disabled={filtersDisabled}>
            {environments.map((e) => (
              <MenuItem key={e.id} value={e.id}>
                {e.name}
              </MenuItem>
            ))}
          </Select>
        )}
        <Select value={timeRange} onChange={(e) => setTimeRange(e.target.value as string)} size="small" sx={{ minWidth: 160 }} inputProps={{ 'aria-label': 'Time range' }} disabled={filtersDisabled}>
          {Object.keys(TIME_RANGES).map((k) => (
            <MenuItem key={k} value={k}>
              {k}
            </MenuItem>
          ))}
        </Select>
        {!isComponent && components.length > 0 && (
          <Select value={integrationFilter} onChange={(e) => setIntegrationFilter(e.target.value as string)} size="small" sx={{ minWidth: 160 }} inputProps={{ 'aria-label': 'Integration' }} disabled={filtersDisabled}>
            <MenuItem value="all">All Integrations</MenuItem>
            {components.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.displayName}
              </MenuItem>
            ))}
          </Select>
        )}
      </Stack>

      {isLoading ? (
        <CircularProgress size={28} sx={{ display: 'block', mx: 'auto', my: 6 }} />
      ) : error ? (
        <Stack alignItems="center" gap={2} sx={{ py: 6 }}>
          {isUnavailable(error) ? (
            <>
              <BarChart3 size={48} style={{ color: '#78909c' }} />
              <Typography variant="h6" textAlign="center">
                Observability Service Not Configured
              </Typography>
              <Typography color="text.secondary" textAlign="center" sx={{ maxWidth: 600 }}>
                Please ensure the Observability backend is configured and running to view metrics.
              </Typography>
            </>
          ) : (
            <>
              <Typography color="error" textAlign="center">
                Failed to fetch metrics: {(error as Error).message ?? 'Service unavailable'}
              </Typography>
              <Button variant="contained" startIcon={<RefreshCw size={16} />} onClick={refreshAll}>
                Retry
              </Button>
            </>
          )}
        </Stack>
      ) : inboundMetrics.length === 0 ? (
        <EmptyListing icon={<BarChart3 size={48} />} title="No metrics data" description="No metrics available for the selected time range." />
      ) : (
        <>
          {/* Summary cards */}
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <StatCard title="Total Requests" value={totalRequests.toLocaleString()} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <StatCard title="Error Count" value={errorCount.toLocaleString()} color="error.main" />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <StatCard title="Error Percentage" value={`${errorPercentage.toFixed(2)}%`} color="error.main" />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <StatCard title="95th Percentile (Latest)" value={`${latestP95.toFixed(2)} ms`} />
            </Grid>
          </Grid>

          {/* Overview charts */}
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="h6" sx={{ mb: 1 }}>
                    Requests Per Minute
                  </Typography>
                  <LineChart
                    data={requestsChartData}
                    xAxisDataKey="label"
                    height={350}
                    legend={{ show: false }}
                    grid={{ show: true, strokeDasharray: '3 3' }}
                    xAxis={{ interval: overviewXAxisInterval }}
                    margin={{ bottom: 20 }}
                    lines={OVERVIEW_REQUEST_LINES.map((l) => ({ ...l, hide: hiddenOverviewLines.has(l.dataKey), ...LINE_OPTS }))}
                  />
                  <Stack direction="row" justifyContent="center" gap={2} sx={{ mt: 1, flexWrap: 'wrap' }}>
                    {OVERVIEW_REQUEST_LINES.map((l) => (
                      <LegendItem key={l.dataKey} label={l.name} color={l.stroke} hidden={hiddenOverviewLines.has(l.dataKey)} onToggle={() => toggleOverviewLine(l.dataKey)} />
                    ))}
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="h6" sx={{ mb: 1 }}>
                    Request Latency (ms)
                  </Typography>
                  <LineChart
                    data={latencyChartData}
                    xAxisDataKey="label"
                    height={350}
                    legend={{ show: false }}
                    grid={{ show: true, strokeDasharray: '3 3' }}
                    xAxis={{ interval: overviewXAxisInterval }}
                    margin={{ bottom: 20 }}
                    lines={OVERVIEW_LATENCY_LINES.map((l) => ({ ...l, hide: hiddenOverviewLines.has(l.dataKey), ...LINE_OPTS }))}
                  />
                  <Stack direction="row" justifyContent="center" gap={2} sx={{ mt: 1, flexWrap: 'wrap' }}>
                    {OVERVIEW_LATENCY_LINES.map((l) => (
                      <LegendItem key={l.dataKey} label={l.name} color={l.stroke} hidden={hiddenOverviewLines.has(l.dataKey)} onToggle={() => toggleOverviewLine(l.dataKey)} />
                    ))}
                  </Stack>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* Most Used APIs + Statistics of APIs */}
          {top5.length > 0 && (
            <>
              <Card variant="outlined" sx={{ mb: 3 }}>
                <CardContent>
                  <Typography variant="h6" sx={{ mb: 2 }}>
                    Most Used APIs
                  </Typography>
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Rank</TableCell>
                          <TableCell>Integration</TableCell>
                          <TableCell>API Name</TableCell>
                          <TableCell>Method</TableCell>
                          <TableCell align="right">Request Count</TableCell>
                          <TableCell align="right">Error Count</TableCell>
                          <TableCell align="right">Avg Response Time (ms)</TableCell>
                          <TableCell align="right">Error Rate (%)</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {top5.map((api, i) => (
                          <TableRow key={api.key}>
                            <TableCell>{i + 1}</TableCell>
                            <TableCell>{api.integrationName || '\u2014'}</TableCell>
                            <TableCell>
                              {api.name}
                              {api.deployment ? ` (${api.deployment})` : ''}
                            </TableCell>
                            <TableCell>{api.method || '\u2014'}</TableCell>
                            <TableCell align="right">{api.requestCount}</TableCell>
                            <TableCell align="right" sx={{ color: api.errorCount > 0 ? 'error.main' : 'inherit' }}>
                              {api.errorCount}
                            </TableCell>
                            <TableCell align="right">{api.avgResponseTime.toFixed(2)}</TableCell>
                            <TableCell align="right">{api.errorRate.toFixed(2)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </CardContent>
              </Card>

              <Typography variant="h6" sx={{ mb: 1 }}>
                Statistics of APIs
              </Typography>
              <Select
                multiple
                value={effectiveSelectedApis.map((a) => a.key)}
                onChange={(e) => setSelectedApiKeys(e.target.value as string[])}
                size="small"
                sx={{ minWidth: 200, mb: 2 }}
                inputProps={{ 'aria-label': 'API selection' }}
                renderValue={(selected) => ((selected as string[]).length === apis.length ? 'All APIs' : `APIs: ${(selected as string[]).length} selected`)}>
                {apis.map((a) => (
                  <MenuItem key={a.key} value={a.key}>
                    <Checkbox checked={effectiveSelectedApis.some((s) => s.key === a.key)} size="small" />
                    <ListItemText primary={apiDisplayLabelWithType(a, showIntegrationName)} />
                  </MenuItem>
                ))}
              </Select>

              <Grid container spacing={2}>
                <Grid size={{ xs: 12, md: 6 }}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="h6" sx={{ mb: 1 }}>
                        Requests Per Minute
                      </Typography>
                      <LineChart
                        data={apiReqData}
                        xAxisDataKey="label"
                        height={350}
                        legend={{ show: false }}
                        grid={{ show: true, strokeDasharray: '3 3' }}
                        xAxis={{ interval: apiXAxisInterval }}
                        margin={{ bottom: 20 }}
                        lines={apiLines.map((item, i) => ({ dataKey: item.key, name: item.label, stroke: COLORS[i % COLORS.length], hide: hiddenApiLines.has(item.key), ...LINE_OPTS }))}
                      />
                      <Stack sx={{ mt: 1 }} gap={0.5}>
                        {apiLines.map((item, i) => (
                          <LegendItem key={item.key} label={item.label} color={COLORS[i % COLORS.length]} hidden={hiddenApiLines.has(item.key)} onToggle={() => toggleApiLine(item.key)} />
                        ))}
                      </Stack>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="h6" sx={{ mb: 1 }}>
                        Average Request Latency (ms)
                      </Typography>
                      <LineChart
                        data={apiLatData}
                        xAxisDataKey="label"
                        height={350}
                        legend={{ show: false }}
                        grid={{ show: true, strokeDasharray: '3 3' }}
                        xAxis={{ interval: apiXAxisInterval }}
                        margin={{ bottom: 20 }}
                        lines={apiLines.map((item, i) => ({ dataKey: item.key, name: item.label, stroke: COLORS[i % COLORS.length], hide: hiddenApiLines.has(item.key), ...LINE_OPTS }))}
                      />
                      <Stack sx={{ mt: 1 }} gap={0.5}>
                        {apiLines.map((item, i) => (
                          <LegendItem key={item.key} label={item.label} color={COLORS[i % COLORS.length]} hidden={hiddenApiLines.has(item.key)} onToggle={() => toggleApiLine(item.key)} />
                        ))}
                      </Stack>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>

              <Grid container spacing={2} sx={{ mt: 2 }}>
                <Grid size={{ xs: 12, md: 6 }}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="h6" sx={{ mb: 1 }}>
                        Successful Requests by API
                      </Typography>
                      <LineChart
                        data={apiSuccessData}
                        xAxisDataKey="label"
                        height={350}
                        legend={{ show: false }}
                        grid={{ show: true, strokeDasharray: '3 3' }}
                        xAxis={{ interval: apiXAxisInterval }}
                        margin={{ bottom: 20 }}
                        lines={apiLines.map((item, i) => ({ dataKey: item.key, name: item.label, stroke: COLORS[i % COLORS.length], hide: hiddenApiLines.has(item.key), ...LINE_OPTS }))}
                      />
                      <Stack sx={{ mt: 1 }} gap={0.5}>
                        {apiLines.map((item, i) => (
                          <LegendItem key={item.key} label={item.label} color={COLORS[i % COLORS.length]} hidden={hiddenApiLines.has(item.key)} onToggle={() => toggleApiLine(item.key)} />
                        ))}
                      </Stack>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="h6" sx={{ mb: 1 }}>
                        Failed Requests by API
                      </Typography>
                      <LineChart
                        data={apiErrorData}
                        xAxisDataKey="label"
                        height={350}
                        legend={{ show: false }}
                        grid={{ show: true, strokeDasharray: '3 3' }}
                        xAxis={{ interval: apiXAxisInterval }}
                        margin={{ bottom: 20 }}
                        lines={apiLines.map((item, i) => ({ dataKey: item.key, name: item.label, stroke: COLORS[i % COLORS.length], hide: hiddenApiLines.has(item.key), ...LINE_OPTS }))}
                      />
                      <Stack sx={{ mt: 1 }} gap={0.5}>
                        {apiLines.map((item, i) => (
                          <LegendItem key={item.key} label={item.label} color={COLORS[i % COLORS.length]} hidden={hiddenApiLines.has(item.key)} onToggle={() => toggleApiLine(item.key)} />
                        ))}
                      </Stack>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>
            </>
          )}
        </>
      )}
      {!isLoading && !error && <WorkflowMetricsSection request={metricsRequest} getTimeRange={getTimeRange} makeLabel={makeLabel} refreshKey={refreshKey} />}
    </PageContent>
  );
}
