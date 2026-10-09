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

import { Box, Skeleton, Stack, Typography } from '@wso2/oxygen-ui';
import { type JSX } from 'react';
import { useOrgUuid } from '../../../hooks/useOrgUuid';
import { useComponentDeployment } from '../../../hooks/useDeployments';
import { useAutomationInsights } from '../../hooks/useAutomationInsights';
import AutomationExecutions from '../../../components/AutomationExecutions';
import Heatmap from './Heatmap';
import { InsightsCard, KpiCards, TrendAreaChart } from './shared';
import { INSIGHTS_CHART_COLORS, OUTCOME_COLOR } from '../../../constants/insights';
import type { Component } from '../../../types/component';
import type { Environment } from '../../../types/environment';
import type { InsightsEnvironment, InsightsRange } from '../../../types/insights';

// Pushes the heatmap grid down so it lines up with the neighboring duration
// chart's plot area (below that card's title + legend).
const HEATMAP_TOP_OFFSET = '64px';

interface AutomationInsightsViewProps {
  component: Component;
  env: Environment;
  insightsEnv: InsightsEnvironment | null;
  versionId: string;
  projectId: string;
  orgHandler: string;
  projectHandler: string;
  range: InsightsRange;
}

/**
 * Integration-level insights for an automation. Matches the source design's
 * automation view: KPI row, execution-duration scatter, failures-by-time
 * heatmap, and a daily execution trend — all shaped from the insights
 * backend's component-scoped automation queries (see `useAutomationInsights`),
 * the same way devant's own integration insights page fetches them. The
 * "Executions" table + drawer reuses `AutomationExecutions` as-is (already
 * real: `useTaskExecutions` + `ExecutionDrawer`/`LogsDrawer`) rather than
 * reimplementing a parallel "attempts" concept that has no backing data model.
 */
export default function AutomationInsightsView({ component, env, insightsEnv, versionId, projectId, orgHandler, projectHandler, range }: AutomationInsightsViewProps): JSX.Element {
  const orgUuid = useOrgUuid() ?? '';
  const { data: deployment, isLoading: loadingDeployment } = useComponentDeployment(orgHandler, orgUuid, component.id, versionId, env.id);
  const releaseId = deployment?.releaseId ?? '';

  const { data, isLoading, enabled } = useAutomationInsights(orgUuid, projectId, insightsEnv, component.id, range);

  const loading = enabled && isLoading;

  return (
    <Stack gap={2}>
      <KpiCards kpis={data.kpis} loading={loading} lgColumns={5} />

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '0.5fr 0.5fr' }, gap: 2 }}>
        <InsightsCard title="Execution Duration Over Time" subtitle="Run duration per execution (seconds)">
          <TrendAreaChart loading={loading} data={data.scatter.map((p) => ({ label: p.label, duration: p.durationSec }))} xName="Date" yName="Duration (s)" height={320} areas={[{ key: 'duration', name: 'Duration (s)', color: INSIGHTS_CHART_COLORS.blue }]} />
        </InsightsCard>
        <InsightsCard title="Failures by Time" subtitle="Day of week × hour of day">
          <Box sx={{ flex: 1, display: 'flex', paddingTop: HEATMAP_TOP_OFFSET }}>
            {loading ? <Skeleton variant="rounded" height={256} sx={{ flex: 1 }} /> : <Heatmap data={data.heatmap} color={OUTCOME_COLOR.failure} everyCol={4} cellWidth={30} cellHeight={30} />}
          </Box>
        </InsightsCard>
      </Box>

      <InsightsCard title="Execution Trend" subtitle="Runs per day by outcome">
        <TrendAreaChart
          padded
          loading={loading}
          data={data.trend}
          xName="Date"
          yName="Executions"
          height={320}
          areas={[
            { key: 'success', name: 'Success', color: OUTCOME_COLOR.success, stackId: 'outcome' },
            { key: 'failure', name: 'Failed', color: OUTCOME_COLOR.failure, stackId: 'outcome' },
            { key: 'timeout', name: 'Timeout', color: OUTCOME_COLOR.timeout, stackId: 'outcome' },
          ]}
        />
      </InsightsCard>

      <InsightsCard plain title="Executions" subtitle="Click a row to inspect arguments & logs">
        {loadingDeployment || isLoading ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
            Loading…
          </Typography>
        ) : (
          <AutomationExecutions
            releaseId={releaseId}
            projectId={projectId}
            componentId={component.id}
            deploymentTrackId={versionId}
            environmentId={env.id}
            orgHandler={orgHandler}
            projectHandler={projectHandler}
            componentHandler={component.handler}
            envCritical={env.critical ?? false}
          />
        )}
      </InsightsCard>
    </Stack>
  );
}
