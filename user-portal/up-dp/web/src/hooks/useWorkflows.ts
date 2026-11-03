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

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { workflowClient } from '../api/workflows';
import type { Integration } from '../types/portal';
import type { RunStatusFilter } from '../types/workflow';

/** Every workflow read on one endpoint shares this prefix, so one invalidation refreshes them all. */
export const wfKey = (url: string, ...rest: unknown[]) => ['wf', url, ...rest];

const LIVE_POLL_MS = 5000;
const RUNS_PAGE = 20;

/** The Management API endpoint of a workflow on one track. */
export function managementEndpoint(integration: Integration, trackId: string | undefined): string | undefined {
  const tracks = managedTracks(integration);
  return (tracks.find((t) => t.id === trackId) ?? tracks[0])?.endpoints?.[0]?.url;
}

/** The tracks a workflow has a Management API on. */
export function managedTracks(integration: Integration) {
  return integration.deploymentTracks.filter((t) => t.endpoints?.length);
}

export function useWorkflowClient(url: string | undefined) {
  return useMemo(() => (url ? workflowClient(url) : null), [url]);
}

export function useDefinitions(url: string | undefined) {
  const client = useWorkflowClient(url);
  return useQuery({ queryKey: wfKey(url ?? '', 'definitions'), queryFn: () => client!.definitions(), enabled: !!client, staleTime: 5 * 60 * 1000 });
}

export function useRuns(url: string | undefined, status: RunStatusFilter | '') {
  const client = useWorkflowClient(url);
  return useInfiniteQuery({
    queryKey: wfKey(url ?? '', 'runs', status),
    queryFn: ({ pageParam }) => client!.runs(status, RUNS_PAGE, pageParam || undefined),
    initialPageParam: '',
    getNextPageParam: (page) => (page.hasMore && page.nextPageToken ? page.nextPageToken : undefined),
    enabled: !!client,
    refetchInterval: (query) => (query.state.data?.pages.some((p) => p.items.some((r) => r.status === 'RUNNING')) ? LIVE_POLL_MS : false),
  });
}

/** One run: what the engine says of it and its steps, followed while it runs. */
export function useRun(url: string | undefined, workflowId: string | undefined, runId: string | undefined) {
  const client = useWorkflowClient(url);
  const enabled = !!client && !!workflowId && !!runId;
  const info = useQuery({
    queryKey: wfKey(url ?? '', 'run', workflowId, runId),
    queryFn: () => client!.run(workflowId!, runId!),
    enabled,
    refetchInterval: (query) => (query.state.data?.status === 'RUNNING' ? LIVE_POLL_MS : false),
  });
  const running = info.data?.status === 'RUNNING';
  const steps = useQuery({
    queryKey: wfKey(url ?? '', 'steps', workflowId, runId),
    queryFn: () => client!.steps(workflowId!, runId!),
    enabled,
    refetchInterval: running ? LIVE_POLL_MS : false,
  });
  return { info, steps };
}

export function useStartRun(url: string | undefined) {
  const client = useWorkflowClient(url);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ workflowType, input }: { workflowType: string; input: unknown }) => client!.start(workflowType, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: wfKey(url ?? '') }),
  });
}

export function useCancelRun(url: string | undefined) {
  const client = useWorkflowClient(url);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ workflowId, runId }: { workflowId: string; runId: string }) => client!.cancel(workflowId, runId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: wfKey(url ?? '') }),
  });
}
