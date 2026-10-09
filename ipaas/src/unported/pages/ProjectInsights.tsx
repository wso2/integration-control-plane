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

import { Box, PageContent, PageTitle, Stack } from '@wso2/oxygen-ui';
import { useMemo, useState, type JSX } from 'react';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { useOrgUuid } from '../../hooks/useOrgUuid';
import { useProjectId } from '../../hooks/useProjects';
import { useComponents } from '../../hooks/useComponents';
import { useEnvironments } from '../../hooks/useEnvironments';
import { useInsightsEnvironments } from '../../hooks/useInsights';
import { useProjectInsights } from '../hooks/useProjectInsights';
import { useIntegrationDeploymentStatuses, useProjectRecentDeployments } from '../../hooks/useDeployments';
import { identifyIntegration } from '../../utils/identifyIntegration';
import { downloadProjectInsightsCsv } from '../utils/insightsCsv';
import { API_LIKE_TYPES, DEPLOYMENT_STATUS_CHIP, INSIGHTS_KIND_LABEL, TYPE_TO_KIND } from '../../constants/insights';
import { InsightsControls } from '../components/Insights/shared';
import { ProjectKpiCards } from '../components/Insights/ProjectKpiCards';
import { ActivityOverTime } from '../components/Insights/ActivityOverTime';
import { TopByVolume } from '../components/Insights/TopByVolume';
import { TopFailing } from '../components/Insights/TopFailing';
import { LatencyDuration } from '../components/Insights/LatencyDuration';
import { RecentDeployments } from '../components/Insights/RecentDeployments';
import type { InsightsApiRef, InsightsRange } from '../../types/insights';
import type { ProjectScope } from '../../nav';

export default function ProjectInsights({ org, project }: ProjectScope): JSX.Element {
  const navigate = useAppNavigate();
  const orgUuid = useOrgUuid() ?? '';
  const { projectId, project: projectData, isLoading } = useProjectId(project);

  const { data: components, isLoading: loadingComponents } = useComponents(org, projectId);
  const { data: envs } = useInsightsEnvironments(orgUuid, projectId);
  const { data: projectEnvs } = useEnvironments(orgUuid, projectId);

  const [range, setRange] = useState<InsightsRange>('7d');
  const [envId, setEnvId] = useState<string>('');

  // API-like integrations (Integration as API, AI Agent, MCP Server, Webhook) ride
  // the API insights path since they all publish APIM-tracked APIs, while
  // events/proxies stay excluded. RAG ingestion rides the automation one.
  const apis = useMemo(
    () =>
      (components ?? [])
        .map((c) => ({ c, type: identifyIntegration(c.displayType, c.componentSubType).type }))
        .filter(({ type }) => API_LIKE_TYPES.includes(type))
        .map(({ c, type }) => ({
          id: c.id,
          name: c.displayName || c.name,
          handler: c.handler,
          apiId: c.apiId ?? '',
          kind: (TYPE_TO_KIND[type] ?? 'api') as InsightsApiRef['kind'],
        })),
    [components],
  );
  // RAG Ingestion components run as jobs too — the insights backend's automation
  // queries include them, so they ride the same automation path with kind 'rag'.
  const automations = useMemo(
    () =>
      (components ?? [])
        .map((c) => ({ c, type: identifyIntegration(c.displayType, c.componentSubType).type }))
        .filter(({ type }) => type === 'automation' || type === 'rag-ingestion')
        .map(({ c, type }) => ({ id: c.id, name: c.displayName || c.name, handler: c.handler, kind: (type === 'rag-ingestion' ? 'rag' : 'auto') as 'auto' | 'rag' })),
    [components],
  );
  const eventRefs = useMemo(
    () =>
      (components ?? [])
        .map((c) => ({ c, type: identifyIntegration(c.displayType, c.componentSubType).type }))
        .filter(({ type }) => type === 'event-integration' || type === 'file-integration')
        .map(({ c, type }) => ({ id: c.id, name: c.displayName || c.name, handler: c.handler, apiId: c.apiId ?? '', kind: (type === 'file-integration' ? 'file' : 'event') as InsightsApiRef['kind'] })),
    [components],
  );

  const envOptions = useMemo(() => envs?.map((e) => ({ id: e.externalEnvId || e.id, name: e.name })) ?? [{ id: 'production', name: 'Production' }], [envs]);
  const activeEnv = envId || envOptions[0]?.id || 'production';
  const selectedEnv = useMemo(() => envs?.find((e) => (e.externalEnvId || e.id) === activeEnv) ?? null, [envs, activeEnv]);

  const deploymentEnvId = useMemo(() => (projectEnvs ?? []).find((e) => e.name === selectedEnv?.name)?.id ?? projectEnvs?.[0]?.id ?? '', [projectEnvs, selectedEnv]);
  const allIntegrations = useMemo(() => [...apis, ...automations, ...eventRefs].map((c) => ({ id: c.id, handler: c.handler, name: c.name })), [apis, automations, eventRefs]);
  const { data: statusMap } = useIntegrationDeploymentStatuses(org, orgUuid, projectId, allIntegrations, deploymentEnvId);

  const recentDeployments = useProjectRecentDeployments(org, orgUuid, projectId, allIntegrations, deploymentEnvId);

  const real = useProjectInsights(orgUuid, projectId, selectedEnv, apis, automations, eventRefs, range);

  const data = real.data;

  const loading = isLoading || loadingComponents || (real.enabled && real.isLoading);

  const activeEnvName = envOptions.find((e) => e.id === activeEnv)?.name ?? activeEnv;
  const handleDownloadReport = () => {
    const integrations = data.integrations.map((r) => ({
      name: r.name,
      typeLabel: INSIGHTS_KIND_LABEL[r.type],
      successCount: r.successCount,
      errorCount: r.errorCount,
      latency: r.latency,
      last: r.last,
      status: r.deleted ? 'Deleted' : (DEPLOYMENT_STATUS_CHIP[statusMap?.[r.id] ?? 'NOT_DEPLOYED']?.label ?? 'Not Deployed'),
    }));
    downloadProjectInsightsCsv(projectData?.name ?? project, activeEnvName, range, { kpis: data.kpis, trend: data.trend, integrations });
  };

  return (
    <PageContent>
      <PageTitle>
        <PageTitle.Header>Usage Insights</PageTitle.Header>
      </PageTitle>

      <Stack direction="row" alignItems="center" justifyContent="flex-end" flexWrap="wrap" gap={1.5} sx={{ mb: 2 }}>
        <InsightsControls envOptions={envOptions} envId={activeEnv} onEnvChange={setEnvId} range={range} onRangeChange={setRange} onReport={handleDownloadReport} reportDisabled={!selectedEnv} />
      </Stack>

      <Box sx={{ mb: 2 }}>
        <ProjectKpiCards kpis={data.kpis} loading={loading} />
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '65fr 35fr' }, gap: 2, mb: 2 }}>
        <ActivityOverTime chart={data.activityChart} range={range} loading={loading} />
        <TopFailing rows={data.topFailing} errorSeries={data.trend.map((p) => ({ label: p.label, errors: p.errors + p.automationErrors }))} loading={loading} />
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '65fr 35fr' }, gap: 2, mb: 2 }}>
        <TopByVolume rows={data.topByVolume} loading={loading} onRowClick={(handler) => navigate(`/organizations/${org}/projects/${project}/components/${handler}/insights/usage`)} />
        <Stack gap={2}>
          <LatencyDuration rows={data.latencyRows} loading={loading} />
          <RecentDeployments items={recentDeployments.data ?? []} envName={activeEnvName} loading={recentDeployments.isLoading} />
        </Stack>
      </Box>
    </PageContent>
  );
}
