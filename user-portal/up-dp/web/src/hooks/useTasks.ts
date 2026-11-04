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

import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { workflowClient, type ReviewDecision } from '../api/workflows';
import type { Integration } from '../types/portal';
import type { HumanTask, Review, ReviewSummary, ReviewTrigger, TaskStatus, TaskSummary } from '../types/workflow';
import { plainName } from '../utils/time';
import { wfKey } from './useWorkflows';

/** A human task or a review: the engine keeps them apart, the inbox does not. */
export interface WorkItem {
  kind: 'task' | 'review';
  id: string;
  title: string;
  name: string;
  workflowId: string;
  workflowType: string;
  status: TaskStatus;
  startTime: string;
  closeTime: string | null;
  completedBy?: string | null;
  canComplete: boolean;
  trigger?: ReviewTrigger;
  integration: Integration;
  endpointUrl: string;
}

export type WorkItemStatus = 'PENDING' | 'COMPLETED';

const INBOX_POLL_MS = 15 * 1000;
const INBOX_LIMIT = 100;

interface Source {
  integration: Integration;
  url: string;
}

function sourcesOf(integrations: Integration[]): Source[] {
  const seen = new Set<string>();
  return integrations
    .filter((i) => i.kind === 'workflow')
    .flatMap((integration) => integration.deploymentTracks.flatMap((t) => (t.endpoints ?? []).map((e) => ({ integration, url: e.url }))))
    .filter((s) => !seen.has(s.url) && !!seen.add(s.url));
}

function toItem(kind: WorkItem['kind'], t: TaskSummary | ReviewSummary, source: Source): WorkItem {
  return {
    kind,
    id: t.taskId,
    title: t.title || plainName(kind === 'review' ? (t as ReviewSummary).activityName : t.taskName),
    name: plainName(kind === 'review' ? (t as ReviewSummary).activityName : t.taskName),
    workflowId: t.parentWorkflowId,
    workflowType: t.parentWorkflowType ?? '',
    status: t.status,
    startTime: t.startTime,
    closeTime: t.closeTime,
    completedBy: t.completedBy,
    canComplete: t.canComplete !== false,
    trigger: kind === 'review' ? (t as ReviewSummary).trigger : undefined,
    integration: source.integration,
    endpointUrl: source.url,
  };
}

/** What each inbox tab reads. A closed item is one someone decided: FAILED holds rejected tasks as well as timed-out ones. */
const STATUSES: Record<WorkItemStatus, TaskStatus[]> = { PENDING: ['PENDING'], COMPLETED: ['COMPLETED', 'FAILED'] };

async function fetchItems(source: Source, status: WorkItemStatus): Promise<WorkItem[]> {
  const client = workflowClient(source.url);
  const reads = STATUSES[status].flatMap((s) => [
    client.tasks(s, INBOX_LIMIT).then((page) => page.items.map((t) => toItem('task', t, source))),
    client.reviews(s, INBOX_LIMIT).then((page) => page.items.map((r) => toItem('review', r, source))),
  ]);
  const results = await Promise.allSettled(reads);
  if (results.every((r) => r.status === 'rejected')) throw (results[0] as PromiseRejectedResult).reason;
  return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
}

/**
 * The work items on every workflow the user can see, newest first. Pending ones are only those
 * the user may act on. One read per endpoint, so a workflow that can't be reached costs only its own.
 */
export function useWorkItems(integrations: Integration[], status: WorkItemStatus = 'PENDING') {
  const sources = useMemo(() => sourcesOf(integrations), [integrations]);
  const results = useQueries({
    queries: sources.map((source) => ({
      queryKey: wfKey(source.url, 'work-items', status),
      queryFn: () => fetchItems(source, status),
      refetchInterval: INBOX_POLL_MS,
      staleTime: 10 * 1000,
    })),
  });

  const stamp = results.map((r) => r.dataUpdatedAt).join('|');
  const items = useMemo(
    () =>
      results
        .flatMap((r) => r.data ?? [])
        .filter((item) => status !== 'PENDING' || item.canComplete)
        .sort((a, b) => Date.parse(b.startTime) - Date.parse(a.startTime)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stamp, status],
  );

  return {
    items,
    isLoading: results.some((r) => r.isLoading),
    isFetching: results.some((r) => r.isFetching),
    unreachable: sources.filter((_, i) => results[i]?.isError).map((s) => s.integration),
    refetch: () => Promise.all(results.map((r) => r.refetch())),
  };
}

export function useWorkItemDetail(item: WorkItem | null) {
  return useQuery({
    queryKey: wfKey(item?.endpointUrl ?? '', 'work-item', item?.kind, item?.id),
    queryFn: async (): Promise<{ task?: HumanTask; review?: Review }> => {
      const client = workflowClient(item!.endpointUrl);
      return item!.kind === 'task' ? { task: await client.task(item!.id) } : { review: await client.review(item!.id) };
    },
    enabled: !!item,
  });
}

export type WorkItemAction = { kind: 'complete'; result: unknown } | ReviewDecision;

export function useActOnWorkItem(item: WorkItem | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (action: WorkItemAction) => {
      const client = workflowClient(item!.endpointUrl);
      return action.kind === 'complete' ? client.complete(item!.id, action.result) : client.decide(item!.id, action);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: wfKey(item!.endpointUrl) }),
  });
}
