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

import { Box, PageContent, PageTitle, MenuItem, Skeleton, Stack, Typography } from '@wso2/oxygen-ui';
import TextField from '../../components/common/TextField';
import { useMemo, useState, type JSX } from 'react';
import { useOrgUuid } from '../../hooks/useOrgUuid';
import { useOrgInsightsEnvironments, useTopSlowestApis } from '../../hooks/useInsights';
import { useOrgInsights } from '../hooks/useOrgInsights';
import { useProjectLatencyTrend } from '../hooks/useProjectInsights';
import { downloadOrgInsightsCsv } from '../utils/insightsCsv';
import { PROJECT_CHART } from '../../constants/insights';
import { InsightsCard, InsightsControls, KpiCards, TrendAreaChart } from '../components/Insights/shared';
import SlowestApiBars from '../components/Insights/SlowestApiBars';
import type { InsightsRange } from '../../types/insights';
import type { OrgScope } from '../../nav';

/** Org-level Usage Insights — Devant's org page scope: API (inbound) analytics only, org-wide (no projectId). */
export default function OrgInsights({ org }: OrgScope): JSX.Element {
  const orgUuid = useOrgUuid() ?? '';
  const { data: envs, isLoading: envsLoading } = useOrgInsightsEnvironments(orgUuid);

  const [range, setRange] = useState<InsightsRange>('7d');
  const [envId, setEnvId] = useState<string>('');
  const [trendMode, setTrendMode] = useState<'requests' | 'traffic' | 'latency'>('requests');

  // The synthetic "Production" placeholder only stands in while the env list
  // hasn't loaded; an explicitly empty list gets the no-environments state instead.
  const envOptions = useMemo(() => (envs ? envs.map((e) => ({ id: e.externalEnvId || e.id, name: e.name })) : [{ id: 'production', name: 'Production' }]), [envs]);
  const activeEnv = envId || envOptions[0]?.id || 'production';
  const selectedEnv = useMemo(() => envs?.find((e) => (e.externalEnvId || e.id) === activeEnv) ?? null, [envs, activeEnv]);

  const real = useOrgInsights(orgUuid, selectedEnv, range);
  const latencyTrend = useProjectLatencyTrend(orgUuid, null, selectedEnv, range, trendMode === 'latency');
  const slowest = useTopSlowestApis(orgUuid, null, selectedEnv, range);

  const noEnvironments = !envsLoading && (envs?.length ?? 0) === 0;
  const loading = envsLoading || real.isLoading;
  const activeEnvName = envOptions.find((e) => e.id === activeEnv)?.name ?? activeEnv;
  const handleDownloadReport = () => downloadOrgInsightsCsv(org, activeEnvName, range, { kpis: real.kpis, trend: real.trend });

  if (noEnvironments) {
    return (
      <PageContent>
        <PageTitle>
          <PageTitle.Header>Usage Insights</PageTitle.Header>
        </PageTitle>
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 8 }}>
          No insights environments are available for this organization yet.
        </Typography>
      </PageContent>
    );
  }

  return (
    <PageContent>
      <PageTitle>
        <PageTitle.Header>Usage Insights</PageTitle.Header>
      </PageTitle>

      <Stack direction="row" alignItems="center" justifyContent="flex-end" flexWrap="wrap" gap={1.5} sx={{ mb: 2 }}>
        <InsightsControls envOptions={envOptions} envId={activeEnv} onEnvChange={setEnvId} range={range} onRangeChange={setRange} onReport={handleDownloadReport} reportDisabled={!selectedEnv} />
      </Stack>

      <Box sx={{ mb: 2 }}>
        <KpiCards kpis={real.kpis} loading={loading} lgColumns={3} />
      </Box>

      <Box sx={{ mb: 2 }}>
        <InsightsCard
          fill={false}
          title={trendMode === 'latency' ? 'API Latency Trend' : trendMode === 'traffic' ? 'API Traffic Trend' : 'API Requests & Errors Trend'}
          subtitle={trendMode === 'latency' ? 'Average latency (ms)' : trendMode === 'traffic' ? 'Successful vs error responses' : 'API traffic with error volume'}
          action={
            <TextField select size="small" value={trendMode} onChange={(e) => setTrendMode(e.target.value as 'requests' | 'traffic' | 'latency')} inputProps={{ 'aria-label': 'Trend metric' }} sx={{ minWidth: 140 }}>
              <MenuItem value="requests">API Requests</MenuItem>
              <MenuItem value="traffic">Traffic</MenuItem>
              <MenuItem value="latency">Latency</MenuItem>
            </TextField>
          }>
          <Box sx={{ paddingTop: '24px' }}>
            {trendMode === 'latency' ? (
              <TrendAreaChart loading={latencyTrend.isLoading || loading} data={latencyTrend.data} xName="Date" yName="Latency (ms)" height={320} areas={[{ key: 'latency', name: 'Avg Latency (ms)', color: PROJECT_CHART.api }]} />
            ) : trendMode === 'traffic' ? (
              <TrendAreaChart
                loading={loading}
                data={real.trend.map((p) => ({ label: p.label, success: Math.max(0, p.apiRequests - p.errors), errors: p.errors }))}
                xName="Date"
                yName="Traffic"
                height={320}
                areas={[
                  { key: 'success', name: 'Success', color: PROJECT_CHART.success, stackId: 'traffic' },
                  { key: 'errors', name: 'Errors', color: PROJECT_CHART.error, stackId: 'traffic' },
                ]}
              />
            ) : (
              <TrendAreaChart
                loading={loading}
                data={real.trend}
                xName="Date"
                yName="Requests & Errors"
                height={320}
                areas={[
                  { key: 'apiRequests', name: 'API requests', color: PROJECT_CHART.api },
                  { key: 'errors', name: 'Errors', color: PROJECT_CHART.error },
                ]}
              />
            )}
          </Box>
        </InsightsCard>
      </Box>

      <InsightsCard fill={false} title="Top 10 Slowest APIs" subtitle="Across this organization">
        {slowest.isLoading || loading ? <Skeleton variant="rounded" height={280} /> : <SlowestApiBars rows={slowest.data} />}
      </InsightsCard>
    </PageContent>
  );
}
