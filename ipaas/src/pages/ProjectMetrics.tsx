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

import { Alert, Box, Button, CircularProgress, IconButton, MenuItem, PageContent, PageTitle, Stack, TextField, Typography } from '@wso2/oxygen-ui';
import { ChevronDown, ChevronUp } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useMemo, useState, type JSX } from 'react';
import { useAppNavigate } from '../hooks/useAppNavigate';
import { useQueryClient } from '@tanstack/react-query';
import { useProjectId } from '../hooks/useProjects';
import { useComponents } from '../hooks/useComponents';
import { useEnvironments, useCloudDataPlanes } from '../hooks/useEnvironments';
import { useOrgUuid } from '../hooks/useOrgUuid';
import { useProjectMetricsModel, rangeToIso } from '../hooks/useObservabilityMetrics';
import { useInfiniteLogs, useVisibleLogs } from '../hooks/useLogs';
import MetricsHeader from '../components/Observability/MetricsHeader';
import ProjectMetricsDiagram from '../components/Observability/ProjectMetricsDiagram';
import LogsPanel from '../components/Logs/LogsPanel';
import LogEntry from '../components/Logs/LogEntry';
import { choreologgingProjectLogsApiUrl } from '../config/runtimeConfig';
import { IS_CLOUD } from '../features';
import { DEFAULT_DP_REGION, PAGE_SIZE } from '../utils/logs';
import type { LogsRequest } from '../types/logs';
import type { MetricsRange } from '../types/observability';
import type { ProjectScope } from '../nav';

/**
 * Project-level Metrics page — port of Devant's project observability view:
 * the cell diagram with its observability layer active (per-edge HTTP metrics
 * from `/metrics/project/http`) over the selected environment and time range,
 * with the project runtime-logs panel underneath. A node's "Observe" action
 * jumps to that integration's own Metrics page.
 */
export default function ProjectMetrics(scope: ProjectScope): JSX.Element {
  const navigate = useAppNavigate();
  const { projectId, project, isLoading: loadingProject } = useProjectId(scope.project);
  const orgUuid = useOrgUuid() ?? '';
  const queryClient = useQueryClient();

  const { data: components = [], isLoading: loadingComponents } = useComponents(scope.org, projectId);
  const { data: environments = [], isLoading: loadingEnvironments } = useEnvironments(orgUuid, projectId);
  const [envId, setEnvId] = useState('');
  useEffect(() => {
    if (environments.length) setEnvId((prev) => (prev && environments.some((e) => e.id === prev) ? prev : (environments.find((e) => e.critical) ?? environments[0]).id));
  }, [environments]);
  const primaryEnv = environments.find((e) => e.id === envId);

  const [range, setRange] = useState<MetricsRange>('24h');
  const [refreshSeconds, setRefreshSeconds] = useState(0);
  const [logsOpen, setLogsOpen] = useState(true);

  const diagram = useProjectMetricsModel(projectId, envId, range, refreshSeconds);
  const handleRefresh = () => void queryClient.invalidateQueries({ queryKey: ['projectMetricsModel'] });

  const handleObserve = (componentId: string) => {
    const handler = components.find((c) => c.id === componentId)?.handler;
    if (handler) navigate(`/organizations/${scope.org}/projects/${scope.project}/components/${handler}/metrics`);
  };

  // ---------- Project runtime logs (same request the runtime-logs page builds) ----------
  const { data: cdps } = useCloudDataPlanes(orgUuid);
  const logsApiUrl = useMemo(() => {
    if (IS_CLOUD) return window.API_CONFIG?.observabilityUrl || undefined;
    if (!primaryEnv?.dpId || !cdps) return undefined;
    const cdp = cdps.find((c) => c.id.toLowerCase() === primaryEnv.dpId!.toLowerCase());
    return cdp ? choreologgingProjectLogsApiUrl(cdp.external_gateway_virtual_host) : undefined;
  }, [primaryEnv?.dpId, cdps]);

  const { from: logsFrom, to: logsTo } = useMemo(() => rangeToIso(range), [range]);
  const componentIdsKey = components.map((c) => c.id).join(',');
  const logsRequest = useMemo<LogsRequest | null>(() => {
    if (!projectId || components.length === 0 || !primaryEnv || !logsApiUrl) return null;
    return {
      projectId,
      componentIdList: components.map((c) => c.id),
      environmentId: primaryEnv.id,
      environmentList: primaryEnv.name,
      logLevels: [],
      startTime: logsFrom,
      endTime: logsTo,
      limit: PAGE_SIZE,
      sort: 'desc',
      region: project?.region || DEFAULT_DP_REGION,
      searchPhrase: '',
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, componentIdsKey, primaryEnv?.id, logsFrom, logsTo, logsApiUrl, project?.region]);
  const logs = useInfiniteLogs(logsOpen ? logsRequest : null, false, logsApiUrl);
  const logItems = useVisibleLogs(logs.data, { componentIds: components.map((c) => c.id) });

  if (loadingProject || loadingComponents || loadingEnvironments) {
    return (
      <Box sx={{ display: 'flex', flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <CircularProgress color="primary" />
      </Box>
    );
  }

  return (
    <PageContent>
      <PageTitle>
        <PageTitle.Header>Metrics</PageTitle.Header>
      </PageTitle>

      <MetricsHeader range={range} onRangeChange={setRange} refreshSeconds={refreshSeconds} onRefreshSecondsChange={setRefreshSeconds} onRefresh={handleRefresh} isRefreshing={diagram.isFetching}>
        {environments.length > 1 && (
          <TextField select size="small" label="Environment" value={envId} onChange={(e) => setEnvId(e.target.value)} sx={{ minWidth: 150 }}>
            {environments.map((e) => (
              <MenuItem key={e.id} value={e.id}>
                {e.name}
              </MenuItem>
            ))}
          </TextField>
        )}
      </MetricsHeader>

      <Box sx={{ mb: 2 }}>
        {diagram.isError ? (
          <Alert
            severity="error"
            action={
              <Button color="inherit" size="small" onClick={() => void diagram.refetch()}>
                Retry
              </Button>
            }>
            Failed to load the project dependency graph.
          </Alert>
        ) : (
          <ProjectMetricsDiagram projectId={projectId} components={components} model={diagram.model} isLoading={diagram.isLoading} onObserve={handleObserve} />
        )}
      </Box>

      {/* ---------- Runtime logs panel ---------- */}
      <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2, py: 1 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            Runtime Logs
          </Typography>
          <IconButton size="small" onClick={() => setLogsOpen((v) => !v)}>
            {logsOpen ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </IconButton>
        </Stack>
        {logsOpen && (
          <Box sx={{ height: 380, borderTop: '1px solid', borderColor: 'divider' }}>
            <LogsPanel
              isLoading={logs.isLoading}
              error={logs.error}
              items={logItems}
              getKey={(l, i) => `${l.timestamp}_${i}`}
              renderRow={(l, expanded, toggle) => <LogEntry log={l} expanded={expanded} onToggle={toggle} envName={primaryEnv?.name} />}
              onRefetch={() => void logs.refetch()}
              hasNextPage={logs.hasNextPage}
              isFetchingNextPage={logs.isFetchingNextPage}
              onFetchNextPage={() => void logs.fetchNextPage()}
            />
          </Box>
        )}
      </Box>
    </PageContent>
  );
}
