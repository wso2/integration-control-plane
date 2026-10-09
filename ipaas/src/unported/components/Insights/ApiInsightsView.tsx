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

import { Alert, Box, Chip, ListingTable, MenuItem, Skeleton, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@wso2/oxygen-ui';
import TextField from '../../../components/common/TextField';
import { PieChart } from '@wso2/oxygen-ui-charts-react';
import { useState, type JSX, type ReactNode } from 'react';
import { useApiInsights } from '../../hooks/useApiInsights';
import { CategoryBarChart, InsightsCard, KpiCards, TableSkeletonRows, TrendAreaChart, TrendBarChart } from './shared';
import StatusCodeBars from './StatusCodeBars';
import { API_CHART as CHART, API_TABS, AVAILABILITY_COLOR, METRIC_SERIES } from '../../../constants/insights';
import type { ApiInsightsTab, ErrorCategoryRow, InsightsApiRef, InsightsEnvironment, InsightsRange } from '../../../types/insights';

interface ApiInsightsViewProps {
  orgUuid: string;
  projectId: string;
  insightsEnv: InsightsEnvironment | null;
  apiRef: InsightsApiRef;
  range: InsightsRange;
  /** Rendered at the right end of the tabs row (env/range/report controls from the page). */
  actions?: ReactNode;
}

/** Collapse the raw error rows into the four fixed category buckets shown in the table. */
function errorReasonRows(byCategory: ErrorCategoryRow[]): { label: string; count: number }[] {
  const byReason = new Map<string, number>();
  byCategory.forEach((r) => {
    const key = r.reason?.toUpperCase() ?? 'OTHER';
    byReason.set(key, (byReason.get(key) ?? 0) + r.count);
  });
  const total = [...byReason.values()].reduce((a, b) => a + b, 0);
  const auth = byReason.get('AUTH') ?? 0;
  const target = byReason.get('TARGET_CONNECTIVITY') ?? 0;
  const throttled = byReason.get('THROTTLED') ?? 0;
  return [
    { label: 'Authentication', count: auth },
    { label: 'Target', count: target },
    { label: 'Throttling', count: throttled },
    { label: 'Other', count: Math.max(0, total - auth - target - throttled) },
  ];
}

/**
 * Integration-level insights for an "Integration as API" component. Matches
 * the source design's api view: KPI row + Overview/Traffic/Latency/Errors
 * tabs. Every widget is backed by a real, apiId-scoped query (see
 * `fetchApiInsights` in `api/wip/insights.ts`) — these are the queries
 * `choreo-apim-analytics-portal` uses (the actual "filter by integration"
 * Devant's own Insights page provides), ported onto the same
 * `analyticsqueryapi` endpoint the project view already uses.
 */
export default function ApiInsightsView({ orgUuid, projectId, insightsEnv, apiRef, range, actions }: ApiInsightsViewProps): JSX.Element {
  const [tab, setTab] = useState<ApiInsightsTab>('overview');
  const [overviewMetric, setOverviewMetric] = useState<'requests' | 'errors' | 'latency'>('requests');
  const { data, isLoading, enabled } = useApiInsights(orgUuid, projectId, insightsEnv, apiRef, range, tab);
  const loading = enabled && isLoading;

  return (
    <Stack gap={2}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1.5}>
        <ToggleButtonGroup exclusive size="small" aria-label="Insights view" value={tab} onChange={(_, v: ApiInsightsTab | null) => v && setTab(v)}>
          {API_TABS.map((t) => (
            <ToggleButton key={t.value} value={t.value} sx={{ px: 2, textTransform: 'none' }}>
              {t.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        {actions}
      </Stack>

      <>
        <KpiCards kpis={data.kpis} loading={loading} />

        {tab === 'overview' && (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1.55fr 1fr' }, gap: 2 }}>
            <InsightsCard
              title="Requests, Errors & Latency"
              subtitle={METRIC_SERIES[overviewMetric].subtitle}
              action={
                <TextField select size="small" value={overviewMetric} onChange={(e) => setOverviewMetric(e.target.value as 'requests' | 'errors' | 'latency')} inputProps={{ 'aria-label': 'Overview metric' }} sx={{ minWidth: 130 }}>
                  <MenuItem value="requests">Requests</MenuItem>
                  <MenuItem value="errors">Errors</MenuItem>
                  <MenuItem value="latency">Latency</MenuItem>
                </TextField>
              }>
              <TrendBarChart
                loading={loading}
                data={data.overview.trend}
                xName="Date"
                yName={METRIC_SERIES[overviewMetric].name}
                height={320}
                areas={[{ key: METRIC_SERIES[overviewMetric].dataKey, name: METRIC_SERIES[overviewMetric].name, color: METRIC_SERIES[overviewMetric].color }]}
              />
            </InsightsCard>
            <InsightsCard title="Availability">
              {loading ? (
                <Skeleton variant="rounded" height={230} />
              ) : data.overview.availability.length === 0 ? (
                <Alert severity="info">No traffic in range.</Alert>
              ) : (
                <Stack alignItems="center" gap={2}>
                  <Box sx={{ width: 230, height: 230 }}>
                    <PieChart
                      data={data.overview.availability.map((a) => ({ name: a.label, value: a.value }))}
                      pies={[{ dataKey: 'value', nameKey: 'name', innerRadius: '62%', outerRadius: '100%' }]}
                      colors={data.overview.availability.map((a) => AVAILABILITY_COLOR[a.kind])}
                      height={230}
                      legend={{ show: false }}
                      tooltip={{ show: true }}
                    />
                  </Box>
                  <Stack gap={1} sx={{ width: '100%' }}>
                    {data.overview.availability.map((a) => (
                      <Stack key={a.kind} direction="row" alignItems="center" gap={1}>
                        <Box sx={{ width: 10, height: 10, borderRadius: '3px', bgcolor: AVAILABILITY_COLOR[a.kind], flexShrink: 0 }} />
                        <Typography variant="body2" sx={{ flex: 1 }}>
                          {a.label}
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {a.value}%
                        </Typography>
                      </Stack>
                    ))}
                  </Stack>
                </Stack>
              )}
            </InsightsCard>
          </Box>
        )}

        {tab === 'traffic' && (
          <Stack gap={2}>
            <InsightsCard title="API Usage Over Time" subtitle="Successful vs error responses">
              <TrendBarChart
                loading={loading}
                data={data.traffic.trend}
                xName="Date"
                yName="Requests"
                height={320}
                areas={[
                  { key: 'requests', name: 'Success', color: CHART.requests, stackId: 'traffic' },
                  { key: 'errors', name: 'Error', color: CHART.errors, stackId: 'traffic' },
                ]}
              />
            </InsightsCard>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 2 }}>
              <InsightsCard title="Usage by Application">
                {loading ? (
                  <Skeleton variant="rounded" height={220} />
                ) : data.traffic.byApplication.length === 0 ? (
                  <Alert severity="info">No application traffic in range.</Alert>
                ) : (
                  <CategoryBarChart data={data.traffic.byApplication} xName="Application" yName="Requests" color={CHART.requests} />
                )}
              </InsightsCard>
              <InsightsCard title="Usage by Backend">
                {loading ? (
                  <Skeleton variant="rounded" height={220} />
                ) : data.traffic.byBackend.length === 0 ? (
                  <Alert severity="info">No backend traffic in range.</Alert>
                ) : (
                  <CategoryBarChart data={data.traffic.byBackend} xName="Backend" yName="Requests" color={CHART.target} />
                )}
              </InsightsCard>
            </Box>
            <InsightsCard plain title="Resource Usage">
              {!loading && data.traffic.resources.length === 0 ? (
                <Alert severity="info">No resource usage in range.</Alert>
              ) : (
                <ListingTable.Container>
                  <ListingTable density="compact">
                    <ListingTable.Head>
                      <ListingTable.Row>
                        <ListingTable.Cell>Resource</ListingTable.Cell>
                        <ListingTable.Cell>Method</ListingTable.Cell>
                        <ListingTable.Cell align="right">Requests</ListingTable.Cell>
                        <ListingTable.Cell align="right">Share</ListingTable.Cell>
                      </ListingTable.Row>
                    </ListingTable.Head>
                    <ListingTable.Body>
                      {loading ? (
                        <TableSkeletonRows cols={4} />
                      ) : (
                        data.traffic.resources.map((r, i) => (
                          <ListingTable.Row key={`${r.path}_${r.method}_${i}`}>
                            <ListingTable.Cell sx={{ fontFamily: 'monospace' }}>{r.path}</ListingTable.Cell>
                            <ListingTable.Cell>
                              <Chip size="small" variant="outlined" label={r.method} />
                            </ListingTable.Cell>
                            <ListingTable.Cell align="right">{r.count.toLocaleString()}</ListingTable.Cell>
                            <ListingTable.Cell align="right">{r.share}</ListingTable.Cell>
                          </ListingTable.Row>
                        ))
                      )}
                    </ListingTable.Body>
                  </ListingTable>
                </ListingTable.Container>
              )}
            </InsightsCard>
          </Stack>
        )}

        {tab === 'latency' && (
          <Stack gap={2}>
            {!loading && data.latency.trend.length === 0 ? (
              <InsightsCard title="Latency by Category" subtitle="p95 vs median across the request lifecycle">
                <Alert severity="info">No latency data in range.</Alert>
              </InsightsCard>
            ) : (
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 2 }}>
                {(
                  [
                    { title: 'Total Latency', p95Key: 'p95', medianKey: 'median' },
                    { title: 'Target Latency', p95Key: 'backendP95', medianKey: 'backendMedian' },
                    { title: 'Request Mediation Latency', p95Key: 'requestMedP95', medianKey: 'requestMedMedian' },
                    { title: 'Response Mediation Latency', p95Key: 'responseMedP95', medianKey: 'responseMedMedian' },
                  ] as const
                ).map((c) => (
                  <InsightsCard key={c.title} title={c.title} subtitle="95th percentile vs median (ms)">
                    <TrendAreaChart
                      loading={loading}
                      data={data.latency.trend}
                      xName="Date"
                      yName="Latency (ms)"
                      height={260}
                      areas={[
                        { key: c.p95Key, name: 'p95', color: CHART.p95 },
                        { key: c.medianKey, name: 'Median', color: CHART.median },
                      ]}
                    />
                  </InsightsCard>
                ))}
              </Box>
            )}
          </Stack>
        )}

        {tab === 'errors' && (
          <Stack gap={2}>
            <InsightsCard title="Errors Over Time" subtitle="Grouped by error category">
              <TrendBarChart
                loading={loading}
                data={data.errors.trend}
                xName="Date"
                yName="Errors"
                height={320}
                areas={[
                  { key: 'auth', name: 'Authentication', color: CHART.auth, stackId: 'cat' },
                  { key: 'throttled', name: 'Throttling', color: CHART.throttled, stackId: 'cat' },
                  { key: 'targetConnectivity', name: 'Target', color: CHART.target, stackId: 'cat' },
                  { key: 'other', name: 'Other', color: CHART.other, stackId: 'cat' },
                ]}
              />
            </InsightsCard>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1.15fr 1fr' }, gap: 2 }}>
              <InsightsCard title="Errors by Status Code" subtitle="Proxy vs target · this API">
                {loading ? <Skeleton variant="rounded" height={280} /> : <StatusCodeBars heatmap={data.errors.statusCodeHeatmap} />}
              </InsightsCard>
              <InsightsCard title="Errors by Category" subtitle="Grouped error reasons in range">
                {!loading && data.errors.byCategory.length === 0 ? (
                  <Alert severity="info">No error details in range.</Alert>
                ) : (
                  <ListingTable.Container sx={{ maxHeight: 'none', height: 'auto' }}>
                    <ListingTable density="compact">
                      <ListingTable.Body>
                        {loading ? (
                          <TableSkeletonRows cols={2} />
                        ) : (
                          errorReasonRows(data.errors.byCategory).map((r) => (
                            <ListingTable.Row key={r.label}>
                              <ListingTable.Cell>{r.label}</ListingTable.Cell>
                              <ListingTable.Cell align="right" sx={{ fontWeight: 600 }}>
                                {r.count.toLocaleString()}
                              </ListingTable.Cell>
                            </ListingTable.Row>
                          ))
                        )}
                      </ListingTable.Body>
                    </ListingTable>
                  </ListingTable.Container>
                )}
              </InsightsCard>
            </Box>
          </Stack>
        )}
      </>
    </Stack>
  );
}
