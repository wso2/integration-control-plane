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

import { Alert, Box, PageContent, PageTitle, Skeleton, Stack, Typography } from '@wso2/oxygen-ui';
import { AudioWaveform, Clock, Gauge, Timer } from '@wso2/oxygen-ui-icons-react';
import { BarChart, LineChart } from '@wso2/oxygen-ui-charts-react';
import { useMemo, useState, type JSX } from 'react';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { useOrgUuid } from '../../hooks/useOrgUuid';
import { useProjectId, useProjects } from '../../hooks/useProjects';
import { useDeliveryConfig, useDeliveryInsights } from '../hooks/useDeliveryInsights';
import MetricSummaryCard from '../components/Delivery/MetricSummaryCard';
import TimeRangeSelector from '../components/Delivery/TimeRangeSelector';
import TopPerformingProjectsTable from '../components/Delivery/TopPerformingProjectsTable';
import NoConfigBanner from '../components/Delivery/NoConfigBanner';
import { ChartBox, InsightsCard } from '../components/Insights/shared';
import { autoTimeUnit, chartDateLabel, convertMinutes, durationTokens } from '../components/Delivery/format';
import type { DeliveryGranularity, DeliveryRange, ProjectDoraRow } from '../../types/delivery';
import type { OrgScope, ProjectScope } from '../../nav';

const CHART = { bars: '#5567D5', failure: '#EF4444', recovery: '#569CD6' };
/** Backend sentinel for "no incidents in range" on lead/recovery aggregates. */
const INFINITY_MINUTES = 1_000_000_000;

/** Big-number/unit pairs, e.g. durationTokens output ['6','days','2','hours']. */
function DurationValue({ tokens }: { tokens: string[] }): JSX.Element {
  return (
    <Stack direction="row" alignItems="flex-end" gap={0.5} flexWrap="wrap">
      {tokens.map((token, i) =>
        Number.isNaN(Number(token)) ? (
          <Typography key={`${token}_${i}`} variant="body1" color="text.secondary" sx={{ pb: 0.25 }}>
            {token}
          </Typography>
        ) : (
          <Typography key={`${token}_${i}`} variant="h5" sx={{ fontWeight: 600 }}>
            {token}
          </Typography>
        ),
      )}
    </Stack>
  );
}

/**
 * Delivery (DORA) insights for the org and project scopes — port of Devant's
 * CIO-dashboard DORAMetrics page. Deployment Frequency and Lead Time for Change
 * always render; Change Failure Rate and Mean Time to Recovery appear once an
 * incident source is configured (see `pages/ConfigureDelivery.tsx`).
 */
export default function DeliveryInsights(scope: OrgScope | ProjectScope): JSX.Element {
  const navigate = useAppNavigate();
  const orgUuid = useOrgUuid() ?? '';
  const projectHandler = scope.level === 'projects' ? scope.project : '';
  const { projectId, project: projectData } = useProjectId(projectHandler);
  const { data: allProjects = [] } = useProjects();

  const [range, setRange] = useState<DeliveryRange>('3M');
  const [granularity, setGranularity] = useState<DeliveryGranularity>('WEEKLY');

  const { config, isLoading: configLoading, isError: configError } = useDeliveryConfig(orgUuid);
  const configured = !!config;
  const scopeReady = !projectHandler || !!projectId;
  const { data, isLoading, isError: insightsError } = useDeliveryInsights(orgUuid, projectHandler ? projectId : undefined, range, granularity, configured, !configLoading && scopeReady);

  const scopeName = projectHandler ? (projectData?.name ?? projectHandler) : scope.org;
  const baseUrl = projectHandler ? `/organizations/${scope.org}/projects/${projectHandler}` : `/organizations/${scope.org}`;

  // ---------- KPI values ----------
  const df = data.deploymentFrequency;
  const dfDisplay = useMemo(() => {
    let average = df && df.totalDeployments > 0 && df.dataPoints > 0 ? df.totalDeployments / df.dataPoints : 0;
    let unit = '/month';
    if (granularity === 'DAILY') {
      if (average !== 0 && Math.round(average) === 0) {
        average *= 7;
        if (Math.round(average) === 0) {
          average *= 4;
          unit = '/month';
        } else {
          unit = '/week';
        }
      } else {
        unit = '/day';
      }
    } else if (granularity === 'WEEKLY') {
      if (average !== 0 && Math.round(average) === 0) {
        average *= 4;
        unit = '/month';
      } else {
        unit = '/week';
      }
    }
    const rounded = Math.round(average);
    const value = !Number.isInteger(average) && rounded > 0 ? `~ ${rounded}` : String(rounded);
    return { value, unit, total: df?.totalDeployments ?? 0 };
  }, [df, granularity]);

  const leadTokens = durationTokens(data.leadTimeSummary && data.leadTimeSummary.avgLeadTime < INFINITY_MINUTES ? data.leadTimeSummary.avgLeadTime : 0);
  const recoveryTokens = durationTokens(data.recoveryTimeSummary && data.recoveryTimeSummary.avgRecoveryTime < INFINITY_MINUTES ? data.recoveryTimeSummary.avgRecoveryTime : 0);
  const failurePct = ((data.failureRateSummary?.failureRate ?? 0) * 100).toFixed(2);

  // ---------- Top projects (org scope) ----------
  const projectRows = useMemo<ProjectDoraRow[]>(
    () =>
      data.topProjects.map((p) => {
        const project = allProjects.find((candidate) => candidate.id === p.projectId);
        const days = (minutes: number) => (minutes >= INFINITY_MINUTES ? '—' : String(Math.round(convertMinutes(minutes, 'days'))));
        return {
          id: p.projectId,
          name: project?.name ?? p.projectId,
          handler: project?.handler ?? '',
          deployments: p.deployments,
          failureRate: (p.failureRate * 100).toFixed(2),
          recoveryTime: days(p.recoveryTime),
          leadTime: days(p.leadTime),
          owner: project?.owner ?? '',
        };
      }),
    [data.topProjects, allProjects],
  );

  // ---------- Chart data ----------
  const deploymentsData = useMemo(() => data.deployments.map((p) => ({ label: chartDateLabel(p.timestamp), count: p.count })), [data.deployments]);
  const leadUnit = useMemo(() => autoTimeUnit(Math.max(...data.leadTimes.map((p) => p.leadTime), 0)), [data.leadTimes]);
  const leadData = useMemo(() => data.leadTimes.map((p) => ({ label: chartDateLabel(p.timestamp), leadTime: convertMinutes(p.leadTime, leadUnit) })), [data.leadTimes, leadUnit]);
  const failureData = useMemo(
    () => [...data.failureRates].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()).map((p) => ({ label: chartDateLabel(p.timestamp), failureRate: Math.round(p.failureRate * 10000) / 100 })),
    [data.failureRates],
  );
  const recoveryUnit = useMemo(() => autoTimeUnit(Math.max(...data.recoveryTimes.map((p) => p.recoveryTime), 0)), [data.recoveryTimes]);
  const recoveryData = useMemo(() => data.recoveryTimes.map((p) => ({ label: chartDateLabel(p.timestamp), recoveryTime: convertMinutes(p.recoveryTime, recoveryUnit) })), [data.recoveryTimes, recoveryUnit]);

  const loading = configLoading || isLoading;

  return (
    <PageContent>
      <PageTitle>
        <PageTitle.Header>Delivery</PageTitle.Header>
      </PageTitle>

      <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1.5} sx={{ mb: 3 }}>
        <Typography variant="body1">
          Performance for{' '}
          <Box component="span" sx={{ fontWeight: 700 }}>
            {scopeName}
          </Box>
        </Typography>
        <TimeRangeSelector range={range} granularity={granularity} onRangeChange={setRange} onGranularityChange={setGranularity} />
      </Stack>

      {(configError || insightsError) && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Failed to load delivery insights. Some metrics may be missing or out of date.
        </Alert>
      )}

      {/* ---------- KPI row ---------- */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' }, gap: 2, mb: 2 }}>
        <MetricSummaryCard icon={<AudioWaveform size={20} />} title="Deployment Frequency" status={df?.perfLevel} percentageChange={df?.relativeChangeInDeployment} isLoading={loading}>
          <Stack direction="row" alignItems="flex-end" gap={0.5}>
            <Typography variant="h5" sx={{ fontWeight: 600 }}>
              {dfDisplay.value}
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ pb: 0.25 }}>
              {dfDisplay.unit} ({dfDisplay.total} total)
            </Typography>
          </Stack>
        </MetricSummaryCard>
        <MetricSummaryCard icon={<Clock size={20} />} title="Lead Time for Change" status={data.leadTimeSummary?.perfLevel} isLoading={loading}>
          <DurationValue tokens={leadTokens} />
        </MetricSummaryCard>
        {configured && (
          <>
            <MetricSummaryCard icon={<Gauge size={20} />} title="Change Failure Rate" status={data.failureRateSummary?.perfLevel} isLoading={loading}>
              <Stack direction="row" alignItems="flex-end" gap={0.5}>
                <Typography variant="h5" sx={{ fontWeight: 600 }}>
                  {failurePct}
                </Typography>
                <Typography variant="body1" color="text.secondary" sx={{ pb: 0.25 }}>
                  %
                </Typography>
              </Stack>
            </MetricSummaryCard>
            <MetricSummaryCard icon={<Timer size={20} />} title="Mean Time to Recovery" status={data.recoveryTimeSummary?.perfLevel} isLoading={loading}>
              <DurationValue tokens={recoveryTokens} />
            </MetricSummaryCard>
          </>
        )}
      </Box>

      {/* ---------- Top Performing Projects (org scope only) ---------- */}
      {!projectHandler && <TopPerformingProjectsTable rows={projectRows} isLoading={loading} onRowClick={(row) => navigate(`/organizations/${scope.org}/projects/${row.handler}/insights/delivery`)} />}

      {/* ---------- Trend charts ---------- */}
      {loading ? (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 2 }}>
          <Skeleton variant="rounded" height={380} />
          <Skeleton variant="rounded" height={380} />
        </Box>
      ) : (
        <>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 2, mb: 2 }}>
            <InsightsCard title="Deployment Frequency">
              <ChartBox>
                <BarChart data={deploymentsData} xAxisDataKey="label" height={320} colors={[CHART.bars]} bars={[{ dataKey: 'count', name: 'Deployment Count', fill: CHART.bars, radius: [3, 3, 0, 0] }]} tooltip={{ show: true }} grid={{ show: true }} />
              </ChartBox>
            </InsightsCard>
            <InsightsCard title="Lead Time for Change">
              <ChartBox>
                <BarChart data={leadData} xAxisDataKey="label" height={320} colors={[CHART.bars]} bars={[{ dataKey: 'leadTime', name: `Lead Time (${leadUnit})`, fill: CHART.bars, radius: [3, 3, 0, 0] }]} tooltip={{ show: true }} grid={{ show: true }} />
              </ChartBox>
            </InsightsCard>
            {configured && (
              <>
                <InsightsCard title="Change Failure Rate">
                  <ChartBox>
                    <LineChart
                      data={failureData}
                      xAxisDataKey="label"
                      height={320}
                      colors={[CHART.failure]}
                      lines={[{ dataKey: 'failureRate', name: 'Failure Rate (%)', stroke: CHART.failure, type: 'monotone' }]}
                      tooltip={{ show: true }}
                      grid={{ show: true }}
                    />
                  </ChartBox>
                </InsightsCard>
                <InsightsCard title="Mean Time to Recovery">
                  <ChartBox>
                    <LineChart
                      data={recoveryData}
                      xAxisDataKey="label"
                      height={320}
                      colors={[CHART.recovery]}
                      lines={[{ dataKey: 'recoveryTime', name: `Mean Recovery Time (${recoveryUnit})`, stroke: CHART.recovery, type: 'monotone' }]}
                      tooltip={{ show: true }}
                      grid={{ show: true }}
                    />
                  </ChartBox>
                </InsightsCard>
              </>
            )}
          </Box>
          {!configured && <NoConfigBanner onConfigure={() => navigate(`${baseUrl}/insights/delivery/configure`)} />}
        </>
      )}
    </PageContent>
  );
}
