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

import { Alert, MenuItem, Select, Skeleton, Stack } from '@wso2/oxygen-ui';
import { useMemo, useState, type JSX } from 'react';
import { useContextEngineLogSources } from '../../../hooks/useContextEngine';
import { useInfiniteLogs, useResumeLiveOnAutoRefresh, useVisibleLogs } from '../../../hooks/useLogs';
import { useLogsFilters } from '../../../hooks/useLogsFilters';
import type { EngineLogSource } from '../../../utils/contextEngineLogs';
import { AUTO_FETCH_INTERVAL, DEFAULT_DP_REGION, PAGE_SIZE } from '../../../utils/logs';
import { liveStatus, logsSummary } from '../../../utils/logsView';
import type { ContextEngine } from '../../../types/contextEngine';
import type { LogsRequest } from '../../../types/logs';
import LogsToolbar from '../../Logs/LogsToolbar';
import LogsViewer from '../../Logs/LogsViewer';

const ALL_SOURCES = 'all';
const sourceSelectSx = { minWidth: 220, height: 40 } as const;
const noticeSx = { mb: 2 } as const;

interface LogsTabProps {
  engine: ContextEngine;
}

/** The engine's runtime logs and its integrations', with a picker to narrow them to one. */
export default function LogsTab({ engine }: LogsTabProps): JSX.Element {
  const { sources, isLoading, integrationsFailed } = useContextEngineLogSources(engine);

  if (isLoading) return <LogsTabSkeleton />;
  // Keyed by engine, so a source picked on one engine never carries over to another.
  return <EngineLogs key={engine.handle} engine={engine} sources={sources} integrationsFailed={integrationsFailed} />;
}

function LogsTabSkeleton(): JSX.Element {
  return (
    <Stack spacing={2}>
      <Skeleton variant="rounded" height={40} />
      <Skeleton variant="rounded" height={480} />
    </Stack>
  );
}

interface EngineLogsProps {
  engine: ContextEngine;
  /** The engine first, then its integrations; never empty. */
  sources: EngineLogSource[];
  integrationsFailed: boolean;
}

function EngineLogs({ engine, sources, integrationsFailed }: EngineLogsProps): JSX.Element {
  const filters = useLogsFilters(`context-engine/${engine.handle}`);
  const { levelFilter, sortDir, searchPhrase, autoFetch, startTime, endTime } = filters;
  const [pickedSource, setSourceFilter] = useState(ALL_SOURCES);
  // A picked integration that has since been removed falls back to every source.
  const sourceFilter = sources.some((s) => s.component === pickedSource) ? pickedSource : ALL_SOURCES;

  // One source is searched on its own; several read the whole project and keep only this engine's rows.
  const componentIds = sourceFilter === ALL_SOURCES ? sources.map((s) => s.component) : [sourceFilter];
  const componentIdsKey = componentIds.join(',');
  const levelFilterKey = levelFilter.join(',');
  const environments = useMemo(() => [{ id: engine.environment, name: engine.environment }], [engine.environment]);

  // The observability proxy URL only gates the query; the logs API resolves it itself.
  const logsApiUrl = window.API_CONFIG?.observabilityUrl || undefined;

  const logsRequest = useMemo<LogsRequest | null>(() => {
    if (!logsApiUrl) return null;
    return {
      projectId: engine.project,
      componentIdList: componentIdsKey.split(','),
      environmentId: engine.environment,
      environmentList: engine.environment,
      logLevels: levelFilter,
      startTime,
      endTime,
      limit: PAGE_SIZE,
      sort: sortDir,
      region: DEFAULT_DP_REGION,
      searchPhrase,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [componentIdsKey, levelFilterKey, engine.project, engine.environment, startTime, endTime, searchPhrase, sortDir, logsApiUrl]);

  const { data, isLoading, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage, backToLive } = useInfiniteLogs(logsRequest, autoFetch ? AUTO_FETCH_INTERVAL : false, logsApiUrl);

  const logs = useVisibleLogs(data, { levels: levelFilter, componentIds });
  const loaded = useVisibleLogs(data, { componentIds });
  const historyOpen = (data?.pages.length ?? 0) > 1;
  useResumeLiveOnAutoRefresh(autoFetch, backToLive);
  const live = liveStatus({ autoFetch, historyOpen, sort: sortDir });

  const sourceSelect = (
    <Select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value as string)} size="small" sx={sourceSelectSx} inputProps={{ 'aria-label': 'Log source' }}>
      <MenuItem value={ALL_SOURCES}>All</MenuItem>
      {sources.map((s) => (
        <MenuItem key={s.component} value={s.component}>
          {s.label}
        </MenuItem>
      ))}
    </Select>
  );

  return (
    <>
      {integrationsFailed && (
        <Alert severity="warning" sx={noticeSx}>
          Could not list this engine&apos;s integrations, so only the engine&apos;s own logs are shown.
        </Alert>
      )}
      {!logsApiUrl && (
        <Alert severity="info" sx={noticeSx}>
          Logs are not available: this console has no observability service configured.
        </Alert>
      )}
      <LogsToolbar filters={filters} environments={environments} logs={logs} canRefresh={!!logsRequest} onRefetch={refetch} extraFilters={sourceSelect} />
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
    </>
  );
}
