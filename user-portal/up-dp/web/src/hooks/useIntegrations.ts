/*
 * Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com). All Rights Reserved.
 *
 * This software is the property of WSO2 LLC. and its suppliers, if any.
 * Dissemination of any information or reproduction of any material contained
 * herein is strictly forbidden, unless permitted by WSO2 in accordance with
 * the WSO2 Commercial License available at http://wso2.com/licenses.
 * For specific language governing the permissions and limitations under
 * this license, please see the license as well as any agreement you've
 * entered into with WSO2 governing the purchase of this software and any
 * associated services.
 */

import { keepPreviousData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ApiError } from '../api/http';
import { fetchDeployment, fetchExecutions, fetchIntegration, fetchIntegrations, fetchProjects, triggerExecution, type IntegrationQuery } from '../api/portal';
import i18n from '../i18n';
import type { DeploymentTrack, ExecutionArg, Integration, IntegrationKind } from '../types/portal';

const LIVE_POLL_MS = 4000;
const HISTORY_PAGE = 10;

const LIST_STALE_MS = 30 * 1000;
/** UP-DP's largest page, for reading a whole list. */
const MAX_PAGE = 100;

/** The integrations matching a query, a page at a time. */
export function useIntegrationPages(query: Omit<IntegrationQuery, 'cursor'>, enabled = true) {
  return useInfiniteQuery({
    enabled,
    queryKey: ['integrations', query],
    queryFn: ({ pageParam }) => fetchIntegrations({ ...query, cursor: pageParam || undefined }),
    initialPageParam: '',
    getNextPageParam: (page) => page.nextCursor || undefined,
    placeholderData: keepPreviousData,
    staleTime: LIST_STALE_MS,
  });
}

/** The projects the user can filter by. */
export function useProjects() {
  return useQuery({ queryKey: ['projects'], queryFn: fetchProjects, staleTime: 5 * 60 * 1000 });
}

/**
 * Every integration of a kind, read page by page. For the workflows the task inbox reads from,
 * which it needs all of; any other list pages with useIntegrationPages.
 */
export function useAllIntegrations(kind: IntegrationKind, enabled = true) {
  return useQuery({
    enabled,
    queryKey: ['integrations', 'all', kind],
    queryFn: async () => {
      const all: Integration[] = [];
      let cursor: string | undefined;
      do {
        const page = await fetchIntegrations({ kind, limit: MAX_PAGE, cursor });
        all.push(...page.items);
        cursor = page.nextCursor;
      } while (cursor);
      return all;
    },
    staleTime: LIST_STALE_MS,
  });
}

export function useIntegration(id: string | undefined) {
  return useQuery({ queryKey: ['integration', id], queryFn: () => fetchIntegration(id!), enabled: !!id, staleTime: LIST_STALE_MS, retry: (count, error) => !isNotFound(error) && count < 3 });
}

export function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

/** value, once it has stopped changing for delay ms. */
export function useDebounced<T>(value: T, delay = 300): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return settled;
}

/** The track a run lands on unless the user picks another. */
export function latestTrack(integration: Integration): DeploymentTrack | null {
  return integration.deploymentTracks.find((t) => t.latest) ?? integration.deploymentTracks[0] ?? null;
}

export function trackLabel(track: DeploymentTrack): string {
  return track.apiVersion ? i18n.t('format.trackLabel', { version: track.apiVersion, branch: track.branch }) : track.branch;
}

export function useDeployment(integrationId: string, trackId: string | undefined) {
  return useQuery({
    queryKey: ['deployment', integrationId, trackId],
    queryFn: () => fetchDeployment(integrationId, trackId!),
    enabled: !!trackId,
    staleTime: 60 * 1000,
  });
}

/** A track's runs, newest first, a page at a time, followed while one is in flight. */
export function useExecutions(integrationId: string, trackId: string | undefined) {
  return useInfiniteQuery({
    queryKey: ['executions', integrationId, trackId],
    queryFn: ({ pageParam }) => fetchExecutions(integrationId, trackId!, HISTORY_PAGE, pageParam || undefined),
    initialPageParam: '',
    getNextPageParam: (page) => page.nextCursor || undefined,
    enabled: !!trackId,
    refetchInterval: (query) => (query.state.data?.pages.some((p) => p.items.some((e) => e.status === 'Running')) ? LIVE_POLL_MS : false),
  });
}

/** The last run, for the listing cards. */
export function useLastExecution(integrationId: string, trackId: string | undefined) {
  return useQuery({
    queryKey: ['executions', integrationId, trackId, 'last'],
    queryFn: async () => (await fetchExecutions(integrationId, trackId!, 1)).items[0] ?? null,
    enabled: !!trackId,
    refetchInterval: (query) => (query.state.data?.status === 'Running' ? LIVE_POLL_MS : false),
  });
}

export function useTriggerExecution(integrationId: string, trackId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: ExecutionArg[]) => triggerExecution(integrationId, trackId!, args),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['executions', integrationId, trackId] }),
  });
}
