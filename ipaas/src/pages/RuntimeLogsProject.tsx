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

import { CircularProgress, MenuItem, PageContent, Select } from '@wso2/oxygen-ui';
import { ScrollText } from '@wso2/oxygen-ui-icons-react';
import { useMemo, useState, type JSX } from 'react';
import { useOrgs } from '../hooks/useOrg';
import { useProjects } from '../hooks/useProjects';
import { useComponents } from '../hooks/useComponents';
import { useEnvironments, useAllEnvironments } from '../hooks/useEnvironments';
import { useInfiniteLogs, useVisibleLogs, useResumeLiveOnAutoRefresh } from '../hooks/useLogs';
import type { LogsRequest } from '../types/logs';
import { AUTO_FETCH_INTERVAL, DEFAULT_DP_REGION, PAGE_SIZE } from '../utils/logs';
import LogsPageLayout from '../components/Logs/LogsPageLayout';
import LogsToolbar from '../components/Logs/LogsToolbar';
import LogsViewer from '../components/Logs/LogsViewer';
import { logsSummary, liveStatus } from '../utils/logsView';
import EmptyListing from '../components/EmptyListing';
import { useLogsFilters } from '../hooks/useLogsFilters';
import type { ProjectScope } from '../nav';

export default function RuntimeLogsProject(scope: ProjectScope): JSX.Element {
  const filters = useLogsFilters(`${scope.org}/${scope.project}`);
  const { envFilter, levelFilter, sortDir, searchPhrase, autoFetch, startTime, endTime } = filters;

  const { data: orgs, isLoading: loadingOrgs } = useOrgs();
  const { data: projects, isLoading: loadingProjects } = useProjects();

  const loadingProject = loadingOrgs || loadingProjects;
  const project = projects?.find((p) => p.id === scope.project || p.handler === scope.project);
  const projectId = project?.id ?? '';
  const orgUuid = orgs?.find((o) => o.handle === scope.org)?.uuid ?? '';

  const { data: allComponents = [], isLoading: loadingComponents } = useComponents(scope.org, projectId);
  const { data: projectEnvs = [], isLoading: loadingProjectEnvs } = useEnvironments(orgUuid, projectId);
  const { data: globalEnvs = [], isLoading: loadingGlobalEnvs } = useAllEnvironments();
  // Prefer project-scoped environments (needs UUID); fall back to global when UUID unavailable
  const environments = orgUuid ? projectEnvs : globalEnvs;
  const loadingEnvironments = orgUuid ? loadingProjectEnvs : loadingGlobalEnvs;

  const [integrationFilter, setIntegrationFilter] = useState('all');

  const componentIds = integrationFilter !== 'all' ? [integrationFilter] : allComponents.map((c) => c.id);
  const selectedEnvIds = envFilter.length > 0 ? envFilter : environments.map((e) => e.id);
  const primaryEnv = environments.find((e) => selectedEnvIds.includes(e.id));

  const componentIdsKey = componentIds.join(',');
  const envIdsKey = selectedEnvIds.join(',');
  const levelFilterKey = levelFilter.join(',');

  // Logs come from the observability proxy, which fetchLogs resolves itself; the URL only
  // gates the query, which stays disabled while the proxy is unconfigured.
  const logsApiUrl = window.API_CONFIG?.observabilityUrl || undefined;

  const logsRequest = useMemo<LogsRequest | null>(() => {
    if (componentIds.length === 0 || !primaryEnv || !logsApiUrl) return null;
    return {
      projectId,
      componentIdList: componentIds,
      environmentId: primaryEnv.id,
      environmentList: primaryEnv.name,
      logLevels: levelFilter,
      startTime,
      endTime,
      limit: PAGE_SIZE,
      sort: sortDir,
      region: project?.region || DEFAULT_DP_REGION,
      searchPhrase,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [componentIdsKey, envIdsKey, levelFilterKey, startTime, endTime, searchPhrase, sortDir, projectId, logsApiUrl]);

  const { data, isLoading, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage, backToLive } = useInfiniteLogs(logsRequest, autoFetch ? AUTO_FETCH_INTERVAL : false, logsApiUrl);

  const logs = useVisibleLogs(data, { levels: levelFilter, componentIds });
  const loaded = useVisibleLogs(data);
  const historyOpen = (data?.pages.length ?? 0) > 1;
  useResumeLiveOnAutoRefresh(autoFetch, backToLive);
  const live = liveStatus({ autoFetch, historyOpen, sort: sortDir });

  if (loadingProject || loadingComponents || loadingEnvironments) {
    return (
      <PageContent sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 8 }}>
        <CircularProgress />
      </PageContent>
    );
  }

  if (allComponents.length === 0) {
    return (
      <PageContent>
        <EmptyListing icon={<ScrollText size={48} />} title="No integrations found" description="Add an integration to this project before viewing runtime logs." />
      </PageContent>
    );
  }

  if (environments.length === 0) {
    return (
      <PageContent>
        <EmptyListing icon={<ScrollText size={48} />} title="No environments available" description="No deployment environments were found for this project. Deploy your integration first." />
      </PageContent>
    );
  }

  const integrationSelect = (
    <Select value={integrationFilter} onChange={(e) => setIntegrationFilter(e.target.value as string)} size="small" sx={{ minWidth: 200, height: 40 }} inputProps={{ 'aria-label': 'Integration' }}>
      <MenuItem value="all">All Integrations</MenuItem>
      {allComponents.map((c) => (
        <MenuItem key={c.id} value={c.id}>
          {c.displayName || c.name}
        </MenuItem>
      ))}
    </Select>
  );

  return (
    <LogsPageLayout
      title="Runtime Logs"
      filtersElement={<LogsToolbar filters={filters} environments={environments} logs={logs} canRefresh={!!logsRequest} onRefetch={refetch} extraFilters={integrationSelect} />}
      logPanelElement={
        <LogsViewer
          rows={logs}
          live={live.live}
          pausedNote={live.pausedNote}
          onBackToLive={live.backToLive === 'newestFirst' ? () => filters.setSortDir('desc') : live.backToLive === 'newestPage' ? backToLive : undefined}
          failure={error ? "Couldn't load logs" : undefined}
          summary={logsSummary({ lines: logs.length, loaded: loaded.length })}
          sortDir={sortDir}
          onSortChange={filters.setSortDir}
          isLoading={isLoading}
          error={error}
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
          onRefetch={refetch}
          onFetchNextPage={fetchNextPage}
          onClearFilters={filters.clearFilters}
        />
      }
    />
  );
}
