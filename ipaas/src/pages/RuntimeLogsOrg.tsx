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

import { useMemo, type JSX } from 'react';
import LogsPageLayout from '../components/Logs/LogsPageLayout';
import LogsToolbar from '../components/Logs/LogsToolbar';
import LogsViewer from '../components/Logs/LogsViewer';
import { GATEWAY_LOGS_FAILED } from '../constants/gatewayLogs';
import { useInfiniteGatewayLogs, useVisibleLogs, useResumeLiveOnAutoRefresh } from '../hooks/useLogs';
import { useLogsFilters } from '../hooks/useLogsFilters';
import type { GatewayLogsRequest } from '../types/logs';
import { filterGatewayRows, gatewayRetentionHorizon, startsBeyondGatewayRetention } from '../utils/gatewayLogs';
import { AUTO_FETCH_INTERVAL, PAGE_SIZE } from '../utils/logs';
import { logsSummary, liveStatus } from '../utils/logsView';

/** The organization's API gateway logs. The data has no project or component dimension, so this reads all of it. */
export default function RuntimeLogsOrg(): JSX.Element {
  const filters = useLogsFilters();
  const { levelFilter, sortDir, searchPhrase, autoFetch, startTime, endTime, hideHealthChecks } = filters;

  const logsRequest: GatewayLogsRequest = useMemo(() => ({ searchPhrase, startTime, endTime, limit: PAGE_SIZE, sort: sortDir }), [searchPhrase, startTime, endTime, sortDir]);

  const { data, isLoading, error, hasNextPage, isFetchingNextPage, fetchNextPage, refetch, backToLive } = useInfiniteGatewayLogs(logsRequest, autoFetch ? AUTO_FETCH_INTERVAL : false);
  const rows = useVisibleLogs(data, { levels: levelFilter });
  const loaded = useVisibleLogs(data);
  const historyOpen = (data?.pages.length ?? 0) > 1;
  useResumeLiveOnAutoRefresh(autoFetch, backToLive);
  const live = liveStatus({ autoFetch, historyOpen, sort: sortDir });

  const logs = useMemo(() => filterGatewayRows(rows, { hideHealthChecks }), [rows, hideHealthChecks]);
  const retentionHorizon = useMemo(() => (startsBeyondGatewayRetention(startTime) ? gatewayRetentionHorizon() : null), [startTime]);

  return (
    <LogsPageLayout
      title="Runtime logs"
      filtersElement={<LogsToolbar filters={filters} environments={[]} logs={logs} canRefresh onRefetch={refetch} gatewayControls />}
      logPanelElement={
        <LogsViewer
          rows={logs}
          live={live.live}
          pausedNote={live.pausedNote}
          onBackToLive={live.backToLive === 'newestFirst' ? () => filters.setSortDir('desc') : live.backToLive === 'newestPage' ? backToLive : undefined}
          failure={error ? GATEWAY_LOGS_FAILED : undefined}
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
          retentionHorizon={retentionHorizon}
        />
      }
    />
  );
}
