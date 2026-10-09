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

import { Box, CircularProgress, PageContent, PageTitle, Stack, Typography } from '@wso2/oxygen-ui';
import { useMemo, useState, type JSX } from 'react';
import { useProject, useProjectByHandler, useProjects } from '../../hooks/useProjects';
import { useComponentByHandler } from '../../hooks/useComponents';
import { useEnvironments } from '../../hooks/useEnvironments';
import { useInsightsEnvironments } from '../../hooks/useInsights';
import { useOrgUuid } from '../../hooks/useOrgUuid';
import { useIntegrationIdentity } from '../../hooks/useIntegrationIdentity';
import { useApiInsights } from '../hooks/useApiInsights';
import { useAutomationInsights } from '../hooks/useAutomationInsights';
import AutomationInsightsView from '../components/Insights/AutomationInsightsView';
import ApiInsightsView from '../components/Insights/ApiInsightsView';
import { InsightsControls } from '../components/Insights/shared';
import ComingSoon from '../../pages/ComingSoon';
import NotFound from '../../components/NotFound';
import { resourceUrl, broaden, type ComponentScope } from '../../nav';
import { UUID_RE } from '../../utils/string';
import { API_LIKE_TYPES, TYPE_TO_KIND } from '../../constants/insights';
import { downloadApiInsightsCsv, downloadAutomationInsightsCsv } from '../utils/insightsCsv';
import type { InsightsApiRef, InsightsRange } from '../../types/insights';

/**
 * Integration-level "Usage Insights" (`.../components/:componentHandler/insights/usage`),
 * reached by clicking a row in the project Insights table. Matches the
 * `automation`/`api` views of the source Claude Design (`Usage Insights.dc.html`
 * — the same file the project view at `pages/ProjectInsights.tsx` was built
 * from). Only automation, RAG ingestion, and API-like (Integration as API / AI Agent / MCP Server / Webhook) components are wired up;
 * every other type keeps the pre-existing "coming soon" placeholder.
 */
export default function ComponentInsightsUsage(scope: ComponentScope): JSX.Element {
  const isUuid = UUID_RE.test(scope.project);
  const { data: projectByHandler, isLoading: loadingByHandler } = useProjectByHandler(!isUuid ? scope.project : '');
  const { data: projectById, isLoading: loadingById } = useProject(isUuid ? scope.project : '');
  const { data: allProjects = [], isLoading: loadingProjects } = useProjects();
  const projectFromList = !isUuid ? (allProjects.find((p) => p.handler === scope.project) ?? null) : null;
  const project = projectByHandler ?? projectById ?? projectFromList;
  const loadingProject = !project && (isUuid ? loadingById : loadingByHandler || loadingProjects);
  const projectId = project?.id ?? '';

  const { data: component, isLoading: loadingComponent } = useComponentByHandler(projectId, scope.component);
  const identity = useIntegrationIdentity(component);
  const orgUuid = useOrgUuid() ?? '';

  const { data: environments = [] } = useEnvironments(scope.org, projectId);
  // Same "one primary environment for the whole page" model the design uses
  // (a single env chip in its app bar, shared across all three views) —
  // critical (Production) first, else the first configured environment.
  const primaryEnv = useMemo(() => environments.find((e) => e.critical) ?? environments[0] ?? null, [environments]);

  const { data: insightsEnvs, isLoading: insightsEnvsLoading } = useInsightsEnvironments(orgUuid, projectId);
  // User-selectable environment, defaulting to the FIRST insights environment —
  // same default the project Insights page uses. Previously this page pinned
  // the project's critical (Production) environment, which silently rendered
  // all-zero insights when the data lived in Development (icp-insights-01.har).
  const [envId, setEnvId] = useState<string>('');
  const envOptions = useMemo(() => insightsEnvs?.map((e) => ({ id: e.externalEnvId || e.id, name: e.name })) ?? [], [insightsEnvs]);
  const activeEnvId = envId || envOptions[0]?.id || '';
  const insightsEnv = useMemo(() => insightsEnvs?.find((e) => (e.externalEnvId || e.id) === activeEnvId) ?? null, [insightsEnvs, activeEnvId]);
  // The executions table drives deployment/log APIs that need the *project*
  // environment matching the selected insights environment; fall back to the
  // page's primary env when the cross-match misses.
  const runtimeEnv = useMemo(() => {
    if (!insightsEnv) return primaryEnv;
    return environments.find((e) => (e.apimEnvId && e.apimEnvId === insightsEnv.externalEnvId) || e.name?.toLowerCase() === insightsEnv.name?.toLowerCase()) ?? primaryEnv;
  }, [environments, insightsEnv, primaryEnv]);

  const [range, setRange] = useState<InsightsRange>('7d');

  const isApiType = identity != null && API_LIKE_TYPES.includes(identity.type);
  const typeLabel =
    identity?.type === 'automation' ? 'Automation' : identity?.type === 'rag-ingestion' ? 'RAG Ingestion' : identity?.type === 'ai-agent' ? 'AI Agent' : identity?.type === 'mcp-server' ? 'MCP Server' : identity?.type === 'webhook' ? 'Webhook' : 'API';
  const reportApiRef = useMemo<InsightsApiRef | null>(
    () =>
      component && isApiType
        ? {
            id: component.id,
            name: component.displayName || component.name,
            handler: component.handler,
            apiId: component.apiId ?? '',
            kind: (identity ? (TYPE_TO_KIND[identity.type] ?? 'api') : 'api') as InsightsApiRef['kind'],
          }
        : null,
    [component, isApiType, identity],
  );
  // Report data — same react-query keys the views use, so this dedupes with
  // their fetches instead of doubling network traffic.
  const autoInsights = useAutomationInsights(orgUuid, projectId, !isApiType ? insightsEnv : null, component?.id ?? '', range);
  const apiInsights = useApiInsights(orgUuid, projectId, isApiType ? insightsEnv : null, reportApiRef, range, 'overview');

  const handleDownloadReport = () => {
    const meta = {
      integrationName: component?.displayName || component?.name || '',
      typeLabel,
      handler: component?.handler ?? '',
      envName: insightsEnv?.name ?? '',
      range,
    };
    if (isApiType) {
      downloadApiInsightsCsv(meta, { kpis: apiInsights.data.kpis, trend: apiInsights.data.overview.trend });
    } else {
      downloadAutomationInsightsCsv(meta, { kpis: autoInsights.data.kpis, trend: autoInsights.data.trend });
    }
  };

  // Env/range/report controls. For the API view these render inline on the
  // tabs row (passed down as `actions`); the automation view has no tabs row,
  // so they stay in the PageTitle actions slot.
  const controls = <InsightsControls envOptions={envOptions} envId={activeEnvId} onEnvChange={setEnvId} range={range} onRangeChange={setRange} onReport={handleDownloadReport} />;

  const isLoading = loadingProject || loadingComponent || insightsEnvsLoading;
  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <CircularProgress color="primary" />
      </Box>
    );
  }
  if (!component) return <NotFound message="Component not found" backTo={resourceUrl(broaden(scope)!, 'overview')} backLabel="Back to Project" />;

  if (identity?.type !== 'automation' && identity?.type !== 'rag-ingestion' && !isApiType) {
    return <ComingSoon title="Coming Soon" description="Usage insights are currently under development." />;
  }

  return (
    <PageContent>
      <PageTitle>
        <PageTitle.Header>Usage Insights</PageTitle.Header>
      </PageTitle>

      {!isApiType && (
        <Stack direction="row" alignItems="center" justifyContent="flex-end" flexWrap="wrap" gap={1.5} sx={{ mb: 2 }}>
          {controls}
        </Stack>
      )}

      {!primaryEnv ? (
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 8 }}>
          No environments configured for this project yet.
        </Typography>
      ) : !isApiType ? (
        <AutomationInsightsView
          component={component}
          env={runtimeEnv ?? primaryEnv}
          insightsEnv={insightsEnv}
          versionId={component.deploymentTracks?.find((t) => t.latest)?.id ?? component.deploymentTracks?.[0]?.id ?? ''}
          projectId={projectId}
          orgHandler={scope.org}
          projectHandler={project?.handler ?? scope.project}
          range={range}
        />
      ) : envOptions.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 8 }}>
          No insights environments are available for this integration yet.
        </Typography>
      ) : (
        <ApiInsightsView orgUuid={orgUuid} projectId={projectId} insightsEnv={insightsEnv} apiRef={reportApiRef!} range={range} actions={controls} />
      )}
    </PageContent>
  );
}
