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

import { buildQuery, workflowFetch } from './http';
import type {
  ActivityTreeNode,
  BulkRetryRequest,
  BulkRetryResult,
  CompletionInfo,
  ExecutionGraph,
  HistoryEvent,
  HumanTaskInfo,
  HumanTaskListFilters,
  HumanTaskSummary,
  Page,
  ResetPoint,
  ResetRequest,
  ReviewActivityInfo,
  ReviewActivitySummary,
  ReviewDecisionInfo,
  ReviewListFilters,
  StartWorkflowRequest,
  TaskAdministration,
  TaskAudience,
  WorkflowDefinition,
  WorkflowExecutionInfo,
  WorkflowHandle,
  WorkflowInstanceSummary,
  WorkflowLifecycleAction,
  WorkflowListFilters,
  WorkflowRuntimeInfo,
} from './types';
import type { WorkflowMetadata } from './workflowMetadataApi';

/**
 * A client bound to one resolved connection. Methods mirror the API's own route tree so its routes
 * stay navigable, and each one absorbs that route's envelope shape here rather than at the call
 * site; the engine wraps some responses and not others, by design:
 *
 *   /history          -> { events }          wrapped
 *   /activity-tree    -> { nodes }           wrapped
 *   /definitions      -> { definitions }     wrapped
 *   /execution-graph  -> { nodes, edges }    UNWRAPPED
 *   /reset-points     -> [ ... ]             BARE ARRAY
 *
 * Every path is relative to the management endpoint's gateway URL, which the gateway maps to the
 * integration's `/workflow` base path: `${baseUrl}/runtime` reaches `/workflow/runtime`.
 */

/** The engine rejects anything above its own `maxPageSize`, so clamp rather than earn a 400. */
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

function clampLimit(limit?: number): number {
  return Math.min(limit ?? DEFAULT_LIMIT, MAX_LIMIT);
}

function runScope(workflowId: string, runId?: string | null): string {
  const id = encodeURIComponent(workflowId);
  return runId ? `${id}/${encodeURIComponent(runId)}` : id;
}

export interface WorkflowClientConnection {
  /** The management API's gateway URL, without a trailing slash. */
  baseUrl: string;
  /**
   * The headers of one request, resolved as it goes out: the gateway credential as it stands then,
   * so a test key minted again reaches the next call.
   */
  getHeaders: () => Promise<Record<string, string>>;
  /**
   * The task queue this integration's worker polls, as `GET /runtime` reports it: the platform names
   * it after the integration's release binding, so it is unique to the integration, its track and its
   * environment. Every integration in an environment shares one namespace, and without a queue the
   * management API lists and counts every queue in it, so each list and count here is limited to this
   * one, whatever its caller passes. Unset (or null), they are not limited.
   */
  taskQueue?: string | null;
}

export function createWorkflowClient({ baseUrl, getHeaders, taskQueue }: WorkflowClientConnection) {
  const get = async <T>(path: string) => workflowFetch<T>(`${baseUrl}${path}`, { headers: await getHeaders() });
  const post = async <T>(path: string, body?: unknown) => workflowFetch<T>(`${baseUrl}${path}`, { method: 'POST', headers: await getHeaders(), body });
  /** Limits a list's filters to this integration's task queue, when it has one. */
  const scoped = <F extends { taskQueue?: string }>(filters: F): F => (taskQueue ? { ...filters, taskQueue } : filters);

  return {
    runtime: {
      /** Also the cheapest health probe: it needs no roles, and a 404 means the API is disabled. */
      get: () => get<WorkflowRuntimeInfo>('/runtime'),
    },

    /** The build-time workflow descriptor; a runtime that predates the route answers 404. */
    metadata: {
      get: () => get<WorkflowMetadata>('/metadata'),
    },

    definitions: {
      list: async () => (await get<{ definitions: WorkflowDefinition[] }>('/definitions'))?.definitions ?? [],
    },

    instances: {
      list: (filters: WorkflowListFilters = {}) =>
        get<Page<WorkflowInstanceSummary>>(
          `/workflows${buildQuery({
            ...scoped(filters),
            limit: clampLimit(filters.limit),
          })}`,
        ),

      start: (body: StartWorkflowRequest) => post<WorkflowHandle>('/workflows', body),

      get: (workflowId: string, runId?: string | null) => get<WorkflowExecutionInfo>(`/workflows/${runScope(workflowId, runId)}`),

      /** `wake` has no run-scoped variant: it always targets the latest run. */
      action: (workflowId: string, action: WorkflowLifecycleAction, options: { runId?: string | null; reason?: string } = {}) => {
        const scope = action === 'wake' ? encodeURIComponent(workflowId) : runScope(workflowId, options.runId);
        return post<{ success: boolean }>(`/workflows/${scope}/${action}`, action === 'terminate' && options.reason ? { reason: options.reason } : undefined);
      },

      history: async (workflowId: string, runId?: string | null) => (await get<{ events: HistoryEvent[] }>(`/workflows/${runScope(workflowId, runId)}/history`))?.events ?? [],

      activityTree: async (workflowId: string, runId?: string | null) => (await get<{ nodes: ActivityTreeNode[] }>(`/workflows/${runScope(workflowId, runId)}/activity-tree`))?.nodes ?? [],

      executionGraph: (workflowId: string, runId?: string | null) => get<ExecutionGraph>(`/workflows/${runScope(workflowId, runId)}/execution-graph`),

      resetPoints: async (workflowId: string, runId?: string | null) => (await get<ResetPoint[]>(`/workflows/${runScope(workflowId, runId)}/reset-points`)) ?? [],

      /** Returns the same workflowId under a new runId. */
      reset: (workflowId: string, body: ResetRequest, runId?: string | null) => post<WorkflowHandle>(`/workflows/${runScope(workflowId, runId)}/reset`, body),
    },

    humanTasks: {
      list: (filters: HumanTaskListFilters = {}) =>
        get<Page<HumanTaskSummary>>(
          `/human-tasks${buildQuery({
            ...scoped(filters),
            limit: clampLimit(filters.limit),
          })}`,
        ),

      pendingCount: async (queue?: string) => (await get<{ count: number }>(`/human-tasks/pending-count${buildQuery(scoped({ taskQueue: queue }))}`))?.count ?? 0,

      get: (taskId: string) => get<HumanTaskInfo>(`/human-tasks/${encodeURIComponent(taskId)}`),

      complete: (taskId: string, result: unknown) => post<CompletionInfo>(`/human-tasks/${encodeURIComponent(taskId)}/complete`, { result }),

      /**
       * Administrator verbs. They act on reviews as well as human tasks: the engine keeps both
       * under `/human-tasks`, whichever kind the task is.
       */
      reassign: (taskId: string, audience: TaskAudience) => post<TaskAdministration>(`/human-tasks/${encodeURIComponent(taskId)}/reassign`, audience),

      /** `null` clears the deadline; a number of milliseconds restarts it from now. */
      extendDeadline: (taskId: string, timeoutMillis: number | null) => post<TaskAdministration>(`/human-tasks/${encodeURIComponent(taskId)}/deadline`, { timeoutMillis }),

      fail: (taskId: string, reason: string, details?: Record<string, unknown>) =>
        post<CompletionInfo>(`/human-tasks/${encodeURIComponent(taskId)}/fail`, {
          reason,
          ...(details ? { details } : {}),
        }),
    },

    reviews: {
      list: (filters: ReviewListFilters = {}) =>
        get<Page<ReviewActivitySummary>>(
          `/review-activities${buildQuery({
            ...scoped(filters),
            limit: clampLimit(filters.limit),
          })}`,
        ),

      get: (taskId: string) => get<ReviewActivityInfo>(`/review-activities/${encodeURIComponent(taskId)}`),

      /** Takes no body at all: the route declares no payload. */
      proceed: (taskId: string) => post<ReviewDecisionInfo>(`/review-activities/${encodeURIComponent(taskId)}/proceed`),

      /** Raw mode can submit any JSON, so the input is not narrowed to an object here. */
      proceedWithInput: (taskId: string, input: unknown) => post<ReviewDecisionInfo>(`/review-activities/${encodeURIComponent(taskId)}/proceed-with-input`, { input }),

      reject: (taskId: string, feedback?: string) => post<ReviewDecisionInfo>(`/review-activities/${encodeURIComponent(taskId)}/reject`, feedback ? { feedback } : {}),

      /** Answers 200 even when items failed: read `applied`/`skipped`/`failed`. */
      bulkRetry: (body: BulkRetryRequest) => post<BulkRetryResult>('/review-activities/bulk-retry', body),
    },
  };
}

export type WorkflowClient = ReturnType<typeof createWorkflowClient>;
