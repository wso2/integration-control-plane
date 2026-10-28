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

import { Box, CircularProgress, PageContent } from '@wso2/oxygen-ui';
import { ScrollText } from '@wso2/oxygen-ui-icons-react';
import { useCallback, useMemo, type JSX } from 'react';
import { useOrgs } from '../hooks/useOrg';
import { useProjects } from '../hooks/useProjects';
import { useComponentByHandler } from '../hooks/useComponents';
import { useEnvironments, useAllEnvironments } from '../hooks/useEnvironments';
import { useInfiniteComponentLogs, useInfiniteGatewayLogsByEnvironment, useVisibleLogs, useResumeLiveOnAutoRefresh } from '../hooks/useLogs';
import { useGatewayLogScope } from '../hooks/useGatewayLogScope';
import { filterGatewayRows, gatewayRetentionHorizon, startsBeyondGatewayRetention, tagGatewayEndpoints } from '../utils/gatewayLogs';
import { logsSummary, retentionNote, liveStatus } from '../utils/logsView';
import { filterLogsByScope, findEnvironment, selectLogSources, sortLogRows } from '../utils/logs';
import type { ComponentLogsRequest, GatewayLogsRequest, LogRow } from '../types/logs';
import { choreologgingComponentLogsApiUrl, choreologgingComponentGatewayLogsApiUrl } from '../config/runtimeConfig';
import { GENERIC_SERVICE_TYPES } from '../constants/integrations';
import { GATEWAY_LOGS_FAILED } from '../constants/gatewayLogs';
import { AUTO_FETCH_INTERVAL, DEFAULT_DP_REGION, PAGE_SIZE } from '../utils/logs';
import LogsPageLayout from '../components/Logs/LogsPageLayout';
import LogsToolbar from '../components/Logs/LogsToolbar';
import LogsViewer from '../components/Logs/LogsViewer';
import EmptyListing from '../components/EmptyListing';
import NotFound from '../components/NotFound';
import { useLogsFilters } from '../hooks/useLogsFilters';
import { broaden, resourceUrl, type ComponentScope } from '../nav';

export default function RuntimeLogsIntegration(scope: ComponentScope): JSX.Element {
  const filters = useLogsFilters(`${scope.org}/${scope.project}/${scope.component}`);
  const { envFilter, endpointFilter, levelFilter, sortDir, searchPhrase, autoFetch, startTime, endTime, sourceFilter, hideHealthChecks } = filters;

  const { data: orgs, isLoading: loadingOrgs } = useOrgs();
  const { data: projects, isLoading: loadingProjects } = useProjects();

  const project = projects?.find((p) => p.id === scope.project || p.handler === scope.project);
  const projectId = project?.id ?? '';
  const orgUuid = orgs?.find((o) => o.handle === scope.org)?.uuid ?? '';

  const { data: component, isLoading: loadingComponent } = useComponentByHandler(projectId, scope.component);

  const { data: projectEnvs = [], isLoading: loadingProjectEnvs } = useEnvironments(orgUuid, projectId);
  const { data: globalEnvs = [], isLoading: loadingGlobalEnvs } = useAllEnvironments();
  // Prefer project-scoped environments (needs UUID); fall back to global when UUID unavailable
  const environments = orgUuid ? projectEnvs : globalEnvs;
  const loadingEnvironments = orgUuid ? loadingProjectEnvs : loadingGlobalEnvs;

  const selectedEnvIds = envFilter.length > 0 ? envFilter : environments.map((e) => e.id);

  // Every environment is read in one pass and narrowed on the rows, so the environment selection never re-queries.
  const levelFilterKey = levelFilter.join(',');

  const isGenericService = GENERIC_SERVICE_TYPES.has(component?.displayType ?? '');
  const logsApiUrl = isGenericService ? choreologgingComponentGatewayLogsApiUrl() : choreologgingComponentLogsApiUrl();

  const logsRequest = useMemo<ComponentLogsRequest | null>(() => {
    // Every environment is read, so this only waits for the list to exist.
    if (!component || environments.length === 0) return null;
    return {
      componentId: component.id,
      versionIdList: [],
      logLevels: levelFilter,
      startTime,
      endTime,
      limit: PAGE_SIZE,
      sort: sortDir,
      region: project?.region || DEFAULT_DP_REGION,
      searchPhrase,
      regexPhrase: '',
      ...(isGenericService ? { logType: 'singleLine' } : {}),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [component?.id, isGenericService, environments.length, levelFilterKey, startTime, endTime, searchPhrase, sortDir, project?.region]);

  const { data, isLoading, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage, backToLive: componentBackToLive } = useInfiniteComponentLogs(logsRequest, autoFetch ? AUTO_FETCH_INTERVAL : false, logsApiUrl);

  const environmentIds = useMemo(() => environments.map((e) => e.id), [environments]);
  const gateway = useGatewayLogScope(scope.org, orgUuid, component, environmentIds);
  const gatewayRequest = useMemo<GatewayLogsRequest | null>(() => {
    if (!gateway.available) return null;
    return { searchPhrase: '', startTime, endTime, limit: PAGE_SIZE, sort: sortDir };
  }, [gateway.available, startTime, endTime, sortDir]);
  // The query has one substring slot: a typed search is the narrower phrase, and endpoint matching happens on the rows anyway.
  const typedSearch = searchPhrase.trim();
  const gatewayPhrases = useMemo(() => (typedSearch ? [typedSearch] : gateway.searchPhrases), [typedSearch, gateway.searchPhrases]);
  const selectedEnvKey = selectedEnvIds.join(',');
  const queriedEnvIds = useMemo(() => selectedEnvKey.split(',').filter(Boolean), [selectedEnvKey]);

  const {
    data: gatewayData,
    isLoading: loadingGateway,
    error: gatewayError,
    hasNextPage: hasMoreGateway,
    isFetchingNextPage: fetchingMoreGateway,
    fetchNextPage: fetchMoreGateway,
    refetch: refetchGateway,
    backToLive: gatewayBackToLive,
  } = useInfiniteGatewayLogsByEnvironment(gatewayRequest, queriedEnvIds, gatewayPhrases, autoFetch ? AUTO_FETCH_INTERVAL : false);

  const componentRows = useVisibleLogs(data, { levels: levelFilter });
  const gatewayRows = useVisibleLogs(gatewayData, { levels: levelFilter });
  // Every line read so far, before any filter, for the "12 of 300 lines" count; gateway lines of other integrations are not counted.
  const componentLoaded = useVisibleLogs(data);
  const gatewayLoaded = useVisibleLogs(gatewayData);
  const loadedCount = useMemo(() => componentLoaded.length + tagGatewayEndpoints(gatewayLoaded, gateway.endpoints).length, [componentLoaded, gatewayLoaded, gateway.endpoints]);

  const scopeFilter = useMemo(() => ({ environments: environments.filter((e) => envFilter.includes(e.id)), endpoints: endpointFilter }), [environments, envFilter, endpointFilter]);

  const componentLogs = useMemo(() => filterLogsByScope(componentRows, scopeFilter), [componentRows, scopeFilter]);
  const gatewayLogs = useMemo(
    () => sortLogRows(filterLogsByScope(filterGatewayRows(tagGatewayEndpoints(gatewayRows, gateway.endpoints), { hideHealthChecks, searchPhrase }), scopeFilter), sortDir),
    [gatewayRows, gateway.endpoints, hideHealthChecks, searchPhrase, scopeFilter, sortDir],
  );

  // Merged for display only: a shared cursor would step past rows the other source had not fetched.
  const logs = useMemo(() => (gateway.available ? selectLogSources(componentLogs, gatewayLogs, sourceFilter, sortDir) : componentLogs), [gateway.available, componentLogs, gatewayLogs, sourceFilter, sortDir]);

  // Rows span environments, so one that cannot be placed gets no name.
  const envNameOf = (row: LogRow): string | undefined => findEnvironment(environments, row.environment)?.name;
  const endpointNameOf = (row: LogRow): string | undefined => (gateway.endpoints.length > 1 ? gateway.endpoints.find((e) => e.id === row.endpoint)?.displayName : undefined);

  const showsComponent = !gateway.available || sourceFilter !== 'gateway';
  const showsGateway = gateway.available && sourceFilter !== 'component';
  const componentFailed = showsComponent && !!error;
  const gatewayFailed = showsGateway && !!gatewayError;
  // One failed source leaves the other's rows on screen; the panel's error state is for when nothing selected loaded.
  const panelError = (componentFailed || !showsComponent) && (gatewayFailed || !showsGateway) ? (componentFailed ? error : gatewayError) : null;
  // An integration whose gateway scope is still resolving may yet have gateway rows, so empty is not final until it settles.
  const gatewayPending = sourceFilter !== 'component' && (gateway.resolving || (showsGateway && loadingGateway));
  // Only while nothing is on screen yet, so a source starting later never blanks rows already shown.
  const panelLoading = logs.length === 0 && ((showsComponent && isLoading) || gatewayPending);
  const statusFailure = componentFailed && gatewayFailed ? "Couldn't load logs" : componentFailed ? "Couldn't load application logs" : gatewayFailed ? GATEWAY_LOGS_FAILED : undefined;

  // Gateway rows only: the integration's own logs outlive the gateway's, so the divider would misinform.
  const retentionHorizon = useMemo(() => (showsGateway && startsBeyondGatewayRetention(startTime) ? gatewayRetentionHorizon() : null), [showsGateway, startTime]);

  // Live refresh stops once older pages are loaded (see useLogs), so the status says why.
  const historyOpen = (data?.pages.length ?? 0) > 1 || (gatewayData?.pages.length ?? 0) > 1;
  const backToLive = useCallback((): void => {
    componentBackToLive();
    if (gateway.available) gatewayBackToLive();
  }, [componentBackToLive, gatewayBackToLive, gateway.available]);
  useResumeLiveOnAutoRefresh(autoFetch, backToLive);
  const live = liveStatus({ autoFetch, historyOpen, sort: sortDir });

  const refetchAll = (): Promise<unknown> => Promise.all([refetch(), gateway.available ? refetchGateway() : null]);
  const fetchNextAll = (): void => {
    if (showsComponent && hasNextPage) void fetchNextPage();
    if (showsGateway && hasMoreGateway) void fetchMoreGateway();
  };

  if (loadingOrgs || loadingProjects || loadingComponent || loadingEnvironments) {
    return (
      <Box sx={{ display: 'flex', minHeight: '100%', justifyContent: 'center', alignItems: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!component) {
    return <NotFound message="Integration not found" backTo={resourceUrl(broaden(scope)!, 'overview')} backLabel="Back to Project" />;
  }

  if (environments.length === 0) {
    return (
      <PageContent>
        <EmptyListing icon={<ScrollText size={48} />} title="No environments available" description="No deployment environments were found for this project. Deploy your integration first." />
      </PageContent>
    );
  }

  return (
    <LogsPageLayout
      title="Runtime Logs"
      filtersElement={<LogsToolbar filters={filters} environments={environments} endpoints={gateway.endpoints} logs={logs} canRefresh={!!logsRequest} onRefetch={refetchAll} sourceControls={gateway.available} />}
      logPanelElement={
        <LogsViewer
          rows={logs}
          live={live.live}
          pausedNote={live.pausedNote}
          onBackToLive={live.backToLive === 'newestFirst' ? () => filters.setSortDir('desc') : live.backToLive === 'newestPage' ? backToLive : undefined}
          failure={statusFailure}
          summary={logsSummary({ lines: logs.length, loaded: loadedCount, endpoints: gateway.endpoints.length, environments: environments.length })}
          sortDir={sortDir}
          onSortChange={filters.setSortDir}
          isLoading={panelLoading}
          error={panelError}
          hasNextPage={(showsComponent && hasNextPage) || (showsGateway && hasMoreGateway)}
          isFetchingNextPage={isFetchingNextPage || fetchingMoreGateway}
          onRefetch={refetchAll}
          onFetchNextPage={fetchNextAll}
          onClearFilters={filters.clearFilters}
          retentionHorizon={retentionHorizon}
          retentionNote={retentionNote(sortDir, sourceFilter === 'all')}
          envNameOf={envNameOf}
          endpointNameOf={endpointNameOf}
        />
      }
    />
  );
}
