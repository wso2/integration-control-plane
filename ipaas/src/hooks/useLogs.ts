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

import { useInfiniteQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { InfiniteData } from '@tanstack/react-query';
import { fetchLogs, fetchComponentLogs, fetchGatewayLogs } from '../api/logs';
import { filterLogRows, type LogRowFilter } from '../utils/logs';
import type { LogsRequest, ComponentLogsRequest, GatewayEnvironmentCursor, GatewayEnvironmentsPage, GatewayLogsPage, GatewayLogsRequest, LogRow } from '../types/logs';

// The log source cannot narrow by level, so leaving levels out of the request
// keeps the query key — and the pages already loaded — stable while the user
// retoggles the level control. Levels are applied client-side (useVisibleLogs).
function sourceRequest<T extends { logLevels: string[] }>(req: T | null): T | null {
  return req ? { ...req, logLevels: [] } : req;
}

// Live means the newest page, refetched: oldest-first lists start at the other end, and a refetch reloads every loaded page.
const liveHeadOnly =
  (interval: number | false, sort: 'asc' | 'desc' | undefined) =>
  (query: { state: { data?: { pages: unknown[] } } }): number | false =>
    sort === 'asc' || (query.state.data?.pages.length ?? 0) > 1 ? false : interval;

// Keeps only the newest page, so the live refresh (paused while older pages are open) can resume.
function useBackToLive(queryKey: QueryKey): () => void {
  const qc = useQueryClient();
  const keyId = JSON.stringify(queryKey);
  return useCallback(() => {
    qc.setQueryData<InfiniteData<unknown, unknown>>(queryKey, (data) => (data && data.pages.length > 1 ? { pages: data.pages.slice(0, 1), pageParams: data.pageParams.slice(0, 1) } : data));
    void qc.invalidateQueries({ queryKey, exact: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qc, keyId]);
}

/** Turning auto refresh back on means "follow new lines", so it drops the older pages that would keep the refresh paused. */
export function useResumeLiveOnAutoRefresh(autoFetch: boolean, backToLive: () => void): void {
  const wasOn = useRef(autoFetch);
  useEffect(() => {
    if (autoFetch && !wasOn.current) backToLive();
    wasOn.current = autoFetch;
  }, [autoFetch, backToLive]);
}

/**
 * The rows a panel renders: the loaded pages flattened, then narrowed by filters
 * the log source could not apply itself.
 */
export function useVisibleLogs(data: InfiniteData<LogRow[]> | undefined, filter: LogRowFilter = {}): LogRow[] {
  const levelsKey = filter.levels?.join(',') ?? '';
  const componentsKey = filter.componentIds?.join(',') ?? '';
  return useMemo(() => {
    const rows = data?.pages.flat() ?? [];
    return filterLogRows(rows, filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, levelsKey, componentsKey]);
}

export function useInfiniteLogs(req: LogsRequest | null, refetchInterval: number | false = false, logsApiUrl?: string) {
  const query = useMemo(() => sourceRequest(req), [req]);
  const queryKey = ['logs', query, logsApiUrl];
  const backToLive = useBackToLive(queryKey);
  const result = useInfiniteQuery({
    queryKey,
    queryFn: async ({ pageParam }) => {
      const pageReq = pageParam ? { ...query!, ...(query!.sort === 'desc' ? { endTime: pageParam } : { startTime: pageParam }) } : query!;
      return fetchLogs(pageReq, logsApiUrl!);
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => {
      if (!query || lastPage.length < query.limit) return undefined;
      return lastPage[lastPage.length - 1]?.timestamp;
    },
    enabled: !!query && !!logsApiUrl,
    refetchInterval: liveHeadOnly(refetchInterval, query?.sort),
  });
  return { ...result, backToLive };
}

export function useInfiniteComponentLogs(req: ComponentLogsRequest | null, refetchInterval: number | false = false, logsApiUrl?: string) {
  const query = useMemo(() => sourceRequest(req), [req]);
  const queryKey = ['component-logs', query, logsApiUrl];
  const backToLive = useBackToLive(queryKey);
  const result = useInfiniteQuery({
    queryKey,
    queryFn: async ({ pageParam }) => {
      const pageReq = pageParam ? { ...query!, ...(query!.sort === 'desc' ? { endTime: pageParam } : { startTime: pageParam }) } : query!;
      return fetchComponentLogs(pageReq, logsApiUrl!);
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => {
      if (!query || lastPage.length < query.limit) return undefined;
      return lastPage[lastPage.length - 1]?.timestamp;
    },
    enabled: !!query && !!logsApiUrl,
    refetchInterval: liveHeadOnly(refetchInterval, query?.sort),
  });
  return { ...result, backToLive };
}

// Module-level so React Query keeps the selected identity between renders.
const gatewayRowPages = (data: InfiniteData<GatewayLogsPage>): InfiniteData<LogRow[]> => ({ ...data, pages: data.pages.map((page) => page.rows) });

/** Paged by narrowing the window from the last row, since the log backend offers no cursor. */
export function useInfiniteGatewayLogs(req: GatewayLogsRequest | null, refetchInterval: number | false = false) {
  const queryKey = ['gateway-logs', req];
  const backToLive = useBackToLive(queryKey);
  const result = useInfiniteQuery({
    queryKey,
    queryFn: async ({ pageParam }) => {
      const pageReq = pageParam ? { ...req!, ...(req!.sort === 'desc' ? { endTime: pageParam } : { startTime: pageParam }) } : req!;
      return fetchGatewayLogs(pageReq);
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    select: gatewayRowPages,
    enabled: !!req,
    refetchInterval: liveHeadOnly(refetchInterval, req?.sort),
  });
  return { ...result, backToLive };
}

const environmentRowPages = (data: InfiniteData<GatewayEnvironmentsPage>): InfiniteData<LogRow[]> => ({ ...data, pages: data.pages.map((page) => page.rows) });

/** Gateway lines carry no environment name, so each environment (and each search phrase) is its own query, stamped onto its rows and paged on its own cursor. */
export function useInfiniteGatewayLogsByEnvironment(req: GatewayLogsRequest | null, environmentIds: string[], searchPhrases: string[], refetchInterval: number | false = false) {
  const queryKey = ['gateway-logs-by-environment', req, environmentIds, searchPhrases];
  const backToLive = useBackToLive(queryKey);
  const result = useInfiniteQuery({
    queryKey,
    queryFn: async ({ pageParam }): Promise<GatewayEnvironmentsPage> => {
      const pages = await Promise.all(
        pageParam.map(async ({ environmentId, searchPhrase, cursor }) => {
          const window = cursor ? (req!.sort === 'desc' ? { endTime: cursor } : { startTime: cursor }) : {};
          const page = await fetchGatewayLogs({ ...req!, ...window, environmentId, searchPhrase });
          return { environmentId, searchPhrase, page };
        }),
      );
      return {
        rows: pages.flatMap(({ environmentId, page }) => page.rows.map((row) => ({ ...row, environment: environmentId }))),
        next: pages.flatMap(({ environmentId, searchPhrase, page }) => (page.nextCursor ? [{ environmentId, searchPhrase, cursor: page.nextCursor }] : [])),
      };
    },
    initialPageParam: environmentIds.flatMap((environmentId) => searchPhrases.map((searchPhrase): GatewayEnvironmentCursor => ({ environmentId, searchPhrase }))),
    getNextPageParam: (lastPage) => (lastPage.next.length > 0 ? lastPage.next : undefined),
    select: environmentRowPages,
    enabled: !!req && environmentIds.length > 0 && searchPhrases.length > 0,
    refetchInterval: liveHeadOnly(refetchInterval, req?.sort),
  });
  return { ...result, backToLive };
}
