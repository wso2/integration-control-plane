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

import { useInfiniteQuery, useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { authenticatedFetch } from '../auth/tokenManager';
import { workflowApiUrl } from '../config/api';

// ── Shared types (runtime-side shapes are loosely typed; known fields declared) ──

export interface WorkflowDefinition {
  workflowType: string;
  inputSchema?: string | null;
  isActive?: boolean;
  workerCount?: number;
}

export interface WorkflowInstance {
  workflowId: string;
  runId?: string;
  workflowType?: string;
  status?: string;
  // WORKFLOW | AGENT | HUMAN_TASK | REVIEW_ACTIVITY | CHILD_WORKFLOW, from the memo; routing asks this, not the id.
  kind?: string;
  startTime?: string;
  closeTime?: string;
  namespace?: string;
  taskQueue?: string;
  [key: string]: unknown;
}

export interface Page<T> {
  items: T[];
  nextPageToken?: string | null;
  hasMore?: boolean;
}

export interface HumanTask {
  taskId: string;
  taskName?: string;
  title?: string;
  description?: string;
  taskInput?: Record<string, unknown>;
  formSchema?: Record<string, unknown> | string;
  parentWorkflowId?: string;
  parentWorkflowType?: string;
  status?: string;
  startTime?: string;
  closeTime?: string;
  userRoles?: string[];
  eligibleRoles?: string[];
  canComplete?: boolean;
  result?: unknown;
  // Absent while pending, and for tasks decided before the runtime began stamping the completer into the memo.
  completedBy?: string;
  completedAt?: string;
  namespace?: string;
  taskQueue?: string;
  [key: string]: unknown;
}

export interface ReviewActivity {
  taskId: string;
  taskName?: string;
  activityName?: string;
  parentWorkflowId?: string;
  parentWorkflowType?: string;
  status?: string;
  trigger?: string;
  startTime?: string;
  namespace?: string;
  taskQueue?: string;
  [key: string]: unknown;
}

export interface ReviewActivityDetail extends ReviewActivity {
  title?: string;
  description?: string;
  formSchema?: Record<string, unknown> | string;
  // The arguments the gated/failed activity would run with; always conforms to formSchema.
  activityArgs?: Record<string, unknown>;
  userRoles?: string[];
  errorMessage?: string;
  closeTime?: string;
  decidedBy?: string;
  decidedAt?: string;
}

export interface HistoryEvent {
  [key: string]: unknown;
}

// ── Execution graph (node-link DAG describing the run's dependency flow) ──

export interface ExecutionGraphNode {
  id: string;
  label: string;
  // WORKFLOW | ACTIVITY | HUMAN_TASK | SIGNAL | TIMER.
  type: string;
  // Same status vocabulary as workflow instances (RUNNING, COMPLETED, FAILED, …).
  status?: string;
  metadata?: Record<string, unknown> | null;
}

export interface ExecutionGraphEdge {
  source: string;
  target: string;
  label?: string | null;
}

export interface ExecutionGraph {
  nodes: ExecutionGraphNode[];
  edges: ExecutionGraphEdge[];
}

// ── Instance graph (the workflow's own structure, joined to one run) ──

// A node of the workflow's structure: every step and control-flow block, whether or not it ran.
export interface ModelGraphNode {
  // Identifies the call site, not the activity: two calls to the same activity have different step ids.
  stepId: string;
  // ACTIVITY | HUMAN_TASK | CHILD_WORKFLOW | EVENT_WAIT | SLEEP | AWAIT_RESULT | BRANCH | LOOP | TRY.
  kind: string;
  // The activity, task, or child workflow named; absent for control flow.
  target?: string;
  // Display text only; never part of the identity.
  label?: string;
  // Step id of the enclosing control-flow node. Absent at the top level.
  parent?: string;
  // Which arm of `parent` this node sits in: `then`, `else`, `body`, `do`, `onFail`, or match patterns.
  branch?: string;
  // An agent tool's backing kind — ACTIVITY, AI_TOOL, PEER — which decides its rail category.
  source?: string;
  line?: number;
  column?: number;
}

export interface ModelGraphEdge {
  from: string;
  to: string;
  // Why this edge is taken: an arm name, loop `body`/`repeat`.
  when?: string;
}

export interface ModelGraph {
  file?: string;
  nodes: ModelGraphNode[];
  edges: ModelGraphEdge[];
}

// A review task drawn on the step it gates, rather than as a step of its own.
export interface StepReview {
  taskId?: string;
  label?: string;
  status?: string;
  startTime?: string;
  endTime?: string;
}

// What happened at one step during this run; a step that never ran has no entry at all.
export interface StepExecution {
  // Executions of this one call site: >1 means a loop iterated, or the step was retried past a failure.
  count: number;
  // One history event id per execution, in the order they ran.
  eventIds: string[];
  type?: string;
  label?: string;
  status?: string;
  attempt?: number;
  startTime?: string;
  endTime?: string;
  failure?: string;
  childWorkflowId?: string;
  reviews?: StepReview[];
}

export interface UnmatchedNode {
  label?: string;
  type?: string;
  status?: string;
  stepId?: string | null;
  reason?: string;
}

export interface InstanceGraph {
  workflowType: string;
  status: string;
  // An 'agent' model's executions carry no step ids, so its steps are matched client-side.
  graphKind?: 'workflow' | 'agent';
  // Checksum of the descriptor the model was read from; a redeploy may have moved on from the run.
  descriptorChecksum?: string | null;
  // Null when no runtime has published a descriptor for this type — draw the flat history instead.
  graph: ModelGraph | null;
  // False when steps ran but none named itself, so the run cannot be placed on the model.
  stepIdsAvailable?: boolean;
  steps: Record<string, StepExecution>;
  // Branch/loop/try step id → the arms something actually ran inside. The only evidence of a taken path.
  takenArms: Record<string, string[]>;
  unmatched: UnmatchedNode[];
}

// ── Low-level request helper (mirrors logs.ts: timeout + error extraction) ──

// The workflow API is asynchronous end to end: the ICP holds no request open. A read may
// answer 202 {status: "FETCHING"} while a runtime materializes it (the ICP coalesces
// identical requests, so polling is cheap); a mutation always answers 202 {operationId} and
// its outcome — including "someone else got there first" — arrives on the operation poll.
// This helper absorbs that contract so every hook keeps its synchronous shape.
const WF_ASYNC_DEADLINE_MS = 75_000;
const WF_POLL_FALLBACK_MS = 750;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function wfFetchOnce(url: string, init: RequestInit): Promise<{ status: number; body: unknown; stale: boolean; fetchedAt?: number }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await authenticatedFetch(url, { ...init, signal: controller.signal });
    const text = await res.text();
    let body: unknown = {};
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = { message: text };
      }
    }
    // Set when the server serves an invalidated copy; a refresh for it is already running behind this answer.
    const stale = res.headers.get('x-workflow-stale') === 'true';
    const fetchedAtRaw = res.headers.get('x-workflow-fetched-at');
    const fetchedAt = fetchedAtRaw ? Number(fetchedAtRaw) : undefined;
    return { status: res.status, body, stale, fetchedAt };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Workflow service is unavailable. Request timed out.');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

// crypto.randomUUID exists only in a secure context — HTTPS, or localhost. A console served
// over plain HTTP on any other host would throw here and fail every mutation before it was
// sent, so the key falls back to something unique enough for de-duplicating one submit.
const newIdempotencyKey = (): string => (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `wf-${Date.now()}-${Math.random().toString(36).slice(2)}`);

// A read that may not be answered yet: the server answers 202 while a runtime materializes the view.
export type Fetchable<T> = { state: 'ready'; value: T; stale?: boolean; fetchedAt?: number } | { state: 'fetching'; retryAfterMs: number };

// The SERVER is still preparing the answer — not react-query's `isFetching`, which is a request in flight.
export const isPreparing = <T>(r: Fetchable<T> | undefined): boolean => r?.state === 'fetching';
export const valueOf = <T>(r: Fetchable<T> | undefined): T | undefined => (r?.state === 'ready' ? r.value : undefined);

// Fallback poll interval for a read the server is still preparing, used only when it names none.
const WF_FETCHING_POLL_MS = 900;

// A read that reports `fetching` rather than waiting for the answer.
async function wfFetchable<T>(componentId: string, environmentId: string, subpath: string): Promise<Fetchable<T>> {
  const { status, body, stale, fetchedAt } = await wfFetchOnce(workflowApiUrl(componentId, environmentId, subpath), {});
  if (status === 202) {
    const accepted = (body ?? {}) as { retryAfterMs?: number };
    return { state: 'fetching', retryAfterMs: accepted.retryAfterMs ?? WF_FETCHING_POLL_MS };
  }
  if (status < 200 || status >= 300) {
    const b = body as { error?: { message?: string }; message?: string } | undefined;
    const error = new Error(b?.error?.message || b?.message || `Request failed (${status})`);
    (error as Error & { status?: number }).status = status;
    throw error;
  }
  return { state: 'ready', value: body as T, stale, fetchedAt };
}

const WF_STALE_FOLLOWUP_MS = 3000;

// An answer produced right after a mutation can predate its effects, so answers younger than this keep polling.
const WF_SETTLE_WINDOW_S = 65;
const WF_SETTLE_POLL_MS = 30000;

// ── Auto-refresh: per viewer, persisted in the browser ──
const AUTO_REFRESH_KEY = 'wf.autoRefresh';

export function autoRefreshEnabled(): boolean {
  try {
    return localStorage.getItem(AUTO_REFRESH_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setAutoRefreshEnabled(on: boolean): void {
  try {
    localStorage.setItem(AUTO_REFRESH_KEY, on ? 'on' : 'off');
  } catch {
    // Storage unavailable: the toggle still works for this render, it just does not persist.
  }
}

const fetchableRefetch = <T>(data: Fetchable<T> | undefined): number | false => {
  // A read still being prepared always polls; the toggle only governs refreshing data already on screen.
  if (data?.state === 'fetching') return data.retryAfterMs;
  if (!autoRefreshEnabled()) return false;
  if (data?.state !== 'ready') return false;
  if (data.stale) return WF_STALE_FOLLOWUP_MS;
  if (data.fetchedAt && Date.now() / 1000 - data.fetchedAt < WF_SETTLE_WINDOW_S) return WF_SETTLE_POLL_MS;
  return false;
};

// When this answer was produced, in epoch seconds.
export const fetchedAtOf = <T>(r: Fetchable<T> | undefined): number | undefined => (r?.state === 'ready' ? r.fetchedAt : undefined);

export const isRefreshing = <T>(r: Fetchable<T> | undefined): boolean => r?.state === 'ready' && r.stale === true;

// Projects a ready value without losing the `fetching` state.
const mapFetchable = <A, B>(r: Fetchable<A>, f: (a: A) => B): Fetchable<B> => (r.state === 'ready' ? { state: 'ready', value: f(r.value), stale: r.stale, fetchedAt: r.fetchedAt } : r);

// A request that waits for its answer; a queued operation is polled by its id and never re-sent.
async function wfRequest<T>(componentId: string, environmentId: string, subpath: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase();
  let request = init;
  if (method !== 'GET') {
    // The key makes a browser-level retry or a double submit collapse onto one operation
    // server-side, instead of acting twice.
    request = { ...init, headers: { ...(init.headers ?? {}), 'x-idempotency-key': newIdempotencyKey() } };
  }
  const deadline = Date.now() + WF_ASYNC_DEADLINE_MS;
  let url = workflowApiUrl(componentId, environmentId, subpath);
  for (;;) {
    const { status, body } = await wfFetchOnce(url, request);
    if (status === 202) {
      const accepted = (body ?? {}) as { operationId?: string; retryAfterMs?: number };
      if (accepted.operationId) {
        // A queued mutation: from here on, poll its outcome. Never re-send the POST — the
        // operation row is the request now.
        url = workflowApiUrl(componentId, environmentId, `operations/${encodeURIComponent(accepted.operationId)}`);
        request = {};
      }
      if (Date.now() > deadline) {
        throw new Error('The workflow service is still preparing this data. Try again shortly.');
      }
      await sleep(accepted.retryAfterMs ?? WF_POLL_FALLBACK_MS);
      continue;
    }
    if (status < 200 || status >= 300) {
      const b = body as { error?: { message?: string }; message?: string } | undefined;
      const message = b?.error?.message || b?.message || `Request failed (${status})`;
      const error = new Error(message);
      (error as Error & { status?: number }).status = status;
      throw error;
    }
    return body as T;
  }
}

function jsonBody(init: RequestInit, body: unknown): RequestInit {
  return { ...init, headers: { ...(init.headers ?? {}), 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

function buildQuery(params: Record<string, string | number | boolean | undefined>): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '' && v !== null) usp.set(k, String(v));
  }
  const s = usp.toString();
  return s ? `?${s}` : '';
}

// Scope-tuple used in every query key so cached data is isolated per component+env.
type Scope = { componentId: string; environmentId: string };
const enabledFor = (s: Scope) => !!s.componentId && !!s.environmentId;

// ── Definitions ──

function fetchDefinitions(componentId: string, environmentId: string): Promise<Fetchable<WorkflowDefinition[]>> {
  return wfFetchable<{ definitions: WorkflowDefinition[] }>(componentId, environmentId, 'definitions').then((r) => mapFetchable(r, (d) => d.definitions ?? []));
}

// ── Workflow instances ──

export interface WorkflowFilters {
  status?: string;
  // Restricts results to one integration's task queue; omitted covers the whole namespace.
  taskQueue?: string;
  workflowType?: string;
  workflowId?: string;
  startTimeFrom?: string;
  startTimeTo?: string;
  closeTimeFrom?: string;
  closeTimeTo?: string;
  // WORKFLOW | AGENT — the memo kind; omitted covers both.
  kind?: string;
  limit?: number;
  pageToken?: string;
}

export function useWorkflowInstances(s: Scope, filters: WorkflowFilters) {
  return useQuery({
    queryKey: ['wf', 'instances', s.componentId, s.environmentId, filters],
    // Reports `fetching` on the first request for a view the server has not materialized yet,
    // so the page can say so instead of showing a spinner for however long it takes, and comes
    // back at the interval the server asked for.
    queryFn: () => wfFetchable<Page<WorkflowInstance>>(s.componentId, s.environmentId, `workflows${buildQuery({ ...filters })}`),
    refetchInterval: ({ state }) => fetchableRefetch(state.data),
    enabled: enabledFor(s),
  });
}

function fetchWorkflowInstances(componentId: string, environmentId: string, filters: WorkflowFilters): Promise<Fetchable<Page<WorkflowInstance>>> {
  return wfFetchable<Page<WorkflowInstance>>(componentId, environmentId, `workflows${buildQuery({ ...filters })}`);
}

// Forward-only token paging, the way the runtime pages: there are no offsets, so "load more" only appends.
export function useWorkflowInstancesInfinite(s: Scope, filters: Omit<WorkflowFilters, 'pageToken'>) {
  return useInfiniteQuery({
    queryKey: ['wf', 'instances', s.componentId, s.environmentId, filters],
    queryFn: ({ pageParam }) => fetchWorkflowInstances(s.componentId, s.environmentId, { ...filters, pageToken: pageParam || undefined }),
    initialPageParam: '',
    // A page still being prepared keeps its own param, so paging pauses instead of ending.
    getNextPageParam: (last, _pages, lastParam) => {
      const page = valueOf(last);
      if (!page) return lastParam;
      return page.hasMore && page.nextPageToken ? page.nextPageToken : undefined;
    },
    refetchInterval: ({ state }) => fetchableRefetch(state.data?.pages[state.data.pages.length - 1]),
    enabled: enabledFor(s),
  });
}

// Task queue of every workflow integration in the project, keyed by component id, from heartbeat metadata.
export function useWorkflowTaskQueues(s: Scope) {
  return useQuery({
    queryKey: ['wf', 'task-queues', s.componentId, s.environmentId],
    queryFn: () => wfRequest<{ taskQueues: Record<string, string> }>(s.componentId, s.environmentId, 'task-queues').then((d) => d.taskQueues ?? {}),
    enabled: enabledFor(s),
    // Queues change on redeploy, not per interaction.
    staleTime: 60000,
  });
}

export function useWorkflowInfo(s: Scope, workflowId: string | null) {
  return useQuery({
    queryKey: ['wf', 'info', s.componentId, s.environmentId, workflowId],
    queryFn: () => wfFetchable<WorkflowInstance>(s.componentId, s.environmentId, `workflows/${encodeURIComponent(workflowId!)}`),
    refetchInterval: ({ state }) => fetchableRefetch(state.data),
    enabled: enabledFor(s) && !!workflowId,
  });
}

export function useWorkflowHistory(s: Scope, workflowId: string | null) {
  return useQuery({
    queryKey: ['wf', 'history', s.componentId, s.environmentId, workflowId],
    queryFn: () => wfFetchable<{ events: HistoryEvent[] }>(s.componentId, s.environmentId, `workflows/${encodeURIComponent(workflowId!)}/history`).then((r) => mapFetchable(r, (d) => d.events ?? [])),
    refetchInterval: ({ state }) => fetchableRefetch(state.data),
    enabled: enabledFor(s) && !!workflowId,
  });
}

export function useWorkflowExecutionGraph(s: Scope, workflowId: string | null) {
  return useQuery({
    queryKey: ['wf', 'graph', s.componentId, s.environmentId, workflowId],
    queryFn: () => wfFetchable<ExecutionGraph>(s.componentId, s.environmentId, `workflows/${encodeURIComponent(workflowId!)}/execution-graph`),
    refetchInterval: ({ state }) => fetchableRefetch(state.data),
    enabled: enabledFor(s) && !!workflowId,
  });
}

export function useWorkflowInstanceGraph(s: Scope, workflowId: string | null) {
  return useQuery({
    queryKey: ['wf', 'instanceGraph', s.componentId, s.environmentId, workflowId],
    queryFn: () => wfFetchable<InstanceGraph>(s.componentId, s.environmentId, `workflows/${encodeURIComponent(workflowId!)}/instance-graph`),
    refetchInterval: ({ state }) => fetchableRefetch(state.data),
    enabled: enabledFor(s) && !!workflowId,
  });
}

// Invalidates every workflow query for an environment, whichever component key each was cached under.
function invalidateForEnvironment(qc: ReturnType<typeof useQueryClient>, environmentId: string): void {
  qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'wf' && q.queryKey[3] === environmentId });
}

export function useStartWorkflow(s: Scope) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { workflowType: string; input?: unknown; workflowId?: string; timeoutSeconds?: number }) => wfRequest<WorkflowInstance>(s.componentId, s.environmentId, 'workflows', jsonBody({ method: 'POST' }, body)),
    onSuccess: () => invalidateForEnvironment(qc, s.environmentId),
  });
}

// ── Reset and bulk retry ──

export interface ResetPoint {
  eventId: number;
  eventType: string;
  timestamp: string;
  nodeIds: string[];
  nodeNames: string[];
  // The point just before the run's first failure.
  isFirstFailure: boolean;
}

// Loaded only while the reset dialog is open: each call is a full history read.
export function useResetPoints(s: Scope, workflowId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['wf', 'reset-points', s.componentId, s.environmentId, workflowId],
    queryFn: () => wfFetchable<ResetPoint[]>(s.componentId, s.environmentId, `workflows/${encodeURIComponent(workflowId!)}/reset-points`),
    refetchInterval: ({ state }) => fetchableRefetch(state.data),
    enabled: enabledFor(s) && !!workflowId && enabled,
  });
}

export type ResetType = 'first-workflow-task' | 'last-workflow-task' | 'workflow-task-id';

// Everything after the reset point re-executes as a new run — including activities whose effects already happened.
export function useResetWorkflow(s: Scope) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ workflowId, resetType, eventId, reason }: { workflowId: string; resetType: ResetType; eventId?: number; reason?: string }) =>
      wfRequest<{ workflowId?: string; runId?: string }>(s.componentId, s.environmentId, `workflows/${encodeURIComponent(workflowId)}/reset`, jsonBody({ method: 'POST' }, { resetType, eventId, reason })),
    onSuccess: () => invalidateForEnvironment(qc, s.environmentId),
  });
}

export interface BulkRetryResult {
  action: string;
  requested: number;
  applied: number;
  skipped: number;
  failed: number;
  items?: Array<{ taskId?: string; outcome?: string; detail?: string }>;
}

export function bulkRetryReviewsRequest(s: Scope, body: { taskIds?: string[]; parentWorkflowId?: string; action: 'retry' | 'fail'; feedback?: string }): Promise<BulkRetryResult> {
  return wfRequest<BulkRetryResult>(s.componentId, s.environmentId, 'review-activities/bulk-retry', jsonBody({ method: 'POST' }, body));
}

// Exported for callers that mutate outside useMutation.
export function invalidateWorkflowQueries(qc: ReturnType<typeof useQueryClient>, environmentId: string): void {
  invalidateForEnvironment(qc, environmentId);
}

export type WorkflowLifecycleAction = 'suspend' | 'resume' | 'cancel' | 'terminate' | 'wake';

export function useWorkflowLifecycle(s: Scope) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ workflowId, action, reason }: { workflowId: string; action: WorkflowLifecycleAction; reason?: string }) => {
      const init = action === 'terminate' ? jsonBody({ method: 'POST' }, { reason: reason ?? '' }) : { method: 'POST' };
      return wfRequest<unknown>(s.componentId, s.environmentId, `workflows/${encodeURIComponent(workflowId)}/${action}`, init);
    },
    onSuccess: () => invalidateForEnvironment(qc, s.environmentId),
  });
}

// ── Human tasks ──

export interface HumanTaskFilters {
  status?: string;
  parentWorkflowId?: string;
  parentWorkflowType?: string;
  taskName?: string;
  taskQueue?: string;
  startTimeFrom?: string;
  startTimeTo?: string;
  limit?: number;
  pageToken?: string;
}

function fetchHumanTasks(componentId: string, environmentId: string, filters: HumanTaskFilters): Promise<Fetchable<Page<HumanTask>>> {
  return wfFetchable<Page<HumanTask>>(componentId, environmentId, `human-tasks${buildQuery({ ...filters })}`);
}

export function useHumanTasks(s: Scope, filters: HumanTaskFilters) {
  return useQuery({
    queryKey: ['wf', 'human-tasks', s.componentId, s.environmentId, filters],
    queryFn: () => fetchHumanTasks(s.componentId, s.environmentId, filters),
    refetchInterval: ({ state }) => fetchableRefetch(state.data),
    enabled: enabledFor(s),
  });
}

export function useHumanTasksInfinite(s: Scope, filters: Omit<HumanTaskFilters, 'pageToken'>) {
  return useInfiniteQuery({
    queryKey: ['wf', 'human-tasks', s.componentId, s.environmentId, filters],
    queryFn: ({ pageParam }) => fetchHumanTasks(s.componentId, s.environmentId, { ...filters, pageToken: pageParam || undefined }),
    initialPageParam: '',
    // A page still being prepared keeps its own param, so paging pauses instead of ending.
    getNextPageParam: (last, _pages, lastParam) => {
      const page = valueOf(last);
      if (!page) return lastParam;
      return page.hasMore && page.nextPageToken ? page.nextPageToken : undefined;
    },
    refetchInterval: ({ state }) => fetchableRefetch(state.data?.pages[state.data.pages.length - 1]),
    enabled: enabledFor(s),
  });
}

// Counts only tasks the caller's roles can act on; the project-wide total is totalPendingTaskCountQueryOptions.
export function pendingTaskCountQueryOptions(s: Scope, taskQueue?: string) {
  return {
    queryKey: ['wf', 'pending-count', s.componentId, s.environmentId, taskQueue] as const,
    queryFn: (): Promise<Fetchable<number>> => wfFetchable<{ count: number }>(s.componentId, s.environmentId, `human-tasks/pending-count${buildQuery({ taskQueue })}`).then((r) => mapFetchable(r, (d) => d.count ?? 0)),
    refetchInterval: ({ state }: { state: { data?: Fetchable<number> } }) => fetchableRefetch(state.data) || 30000,
  };
}

export function usePendingTaskCount(s: Scope, taskQueue?: string, enabled = true) {
  return useQuery({ ...pendingTaskCountQueryOptions(s, taskQueue), enabled: enabledFor(s) && enabled });
}

// Query options for one task's detail; shared by useHumanTask and useQueries-based batch fetches.
export function humanTaskQueryOptions(s: Scope, taskId: string) {
  return {
    queryKey: ['wf', 'human-task', s.componentId, s.environmentId, taskId] as const,
    queryFn: () => wfFetchable<HumanTask>(s.componentId, s.environmentId, `human-tasks/${encodeURIComponent(taskId)}`),
    // Without this the query reports `fetching` once and never asks again, which is worse
    // than the blocking behaviour it replaced: the dialog would spin until something else
    // happened to invalidate it.
    refetchInterval: ({ state }: { state: { data?: Fetchable<HumanTask> } }) => fetchableRefetch(state.data),
  };
}

export function useHumanTask(s: Scope, taskId: string | null, paused = false) {
  const options = humanTaskQueryOptions(s, taskId ?? '');
  return useQuery({
    ...options,
    // Paused while the completion form is being filled: a background refetch swaps the task object under the typing.
    refetchInterval: paused ? false : options.refetchInterval,
    enabled: enabledFor(s) && !!taskId,
  });
}

function invalidateHumanTasks(qc: ReturnType<typeof useQueryClient>, s: Scope) {
  invalidateForEnvironment(qc, s.environmentId);
}

export function useCompleteHumanTask(s: Scope) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, result }: { taskId: string; result: unknown }) => wfRequest<unknown>(s.componentId, s.environmentId, `human-tasks/${encodeURIComponent(taskId)}/complete`, jsonBody({ method: 'POST' }, { result })),
    onSuccess: () => invalidateHumanTasks(qc, s),
  });
}

export function useFailHumanTask(s: Scope) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, reason, details }: { taskId: string; reason: string; details?: unknown }) => wfRequest<unknown>(s.componentId, s.environmentId, `human-tasks/${encodeURIComponent(taskId)}/fail`, jsonBody({ method: 'POST' }, { reason, details })),
    onSuccess: () => invalidateHumanTasks(qc, s),
  });
}

// ── Review activities ──
// (Replaces the deprecated retry-tasks routes; the runtime still exposes /retry-tasks
// for pre-0.7.0 clients but the UI uses /review-activities.)

// ── The unified work queue ──

export interface WorkItemRow {
  kind: 'HUMAN_TASK' | 'REVIEW_ACTIVITY';
  taskId: string;
  taskName?: string;
  title?: string;
  // Reviews only: PRE_RUN (approval gate) | ON_FAILURE (rerun decision).
  trigger?: string;
  parentWorkflowId?: string;
  parentWorkflowType?: string;
  taskQueue?: string;
  status?: string;
  startTime?: string;
  closeTime?: string;
  canComplete?: boolean;
  [key: string]: unknown;
}

export interface WorkItemFilters {
  // HUMAN_TASK or REVIEW_ACTIVITY; both when absent. The proxy narrows to the caller's permissions.
  kind?: string;
  status?: string;
  parentWorkflowId?: string;
  parentWorkflowType?: string;
  taskQueue?: string;
  startTimeFrom?: string;
  startTimeTo?: string;
  limit?: number;
  pageToken?: string;
}

function fetchWorkItems(componentId: string, environmentId: string, filters: WorkItemFilters): Promise<Fetchable<Page<WorkItemRow>>> {
  return wfFetchable<Page<WorkItemRow>>(componentId, environmentId, `work-items${buildQuery({ ...filters })}`);
}

export function useWorkItemsInfinite(s: Scope, filters: Omit<WorkItemFilters, 'pageToken'>) {
  return useInfiniteQuery({
    queryKey: ['wf', 'work-items', s.componentId, s.environmentId, filters],
    queryFn: ({ pageParam }) => fetchWorkItems(s.componentId, s.environmentId, { ...filters, pageToken: pageParam || undefined }),
    initialPageParam: '',
    getNextPageParam: (last, _pages, lastParam) => {
      const page = valueOf(last);
      if (!page) return lastParam;
      return page.hasMore && page.nextPageToken ? page.nextPageToken : undefined;
    },
    refetchInterval: ({ state }) => fetchableRefetch(state.data?.pages[state.data.pages.length - 1]),
    enabled: enabledFor(s),
  });
}

export interface ReviewActivityFilters {
  status?: string;
  parentWorkflowId?: string;
  taskName?: string;
  taskQueue?: string;
  startTimeFrom?: string;
  startTimeTo?: string;
  limit?: number;
  pageToken?: string;
}

// Review-activity pages are fetched and combined up to this many pages so client-side
// filters (e.g. by workflow name, which the runtime API cannot filter on) see the
// full set rather than only the first page.
const REVIEW_ACTIVITY_MAX_PAGES = 20;

// Page size the badge count reads; a full page is reported as capped rather than as an exact total.
const PENDING_REVIEW_PAGE = 50;

async function fetchReviewActivities(componentId: string, environmentId: string, filters: ReviewActivityFilters): Promise<Fetchable<Page<ReviewActivity>>> {
  const items: ReviewActivity[] = [];
  let pageToken: string | undefined;
  for (let i = 0; i < REVIEW_ACTIVITY_MAX_PAGES; i++) {
    const result = await wfFetchable<Page<ReviewActivity>>(componentId, environmentId, `review-activities${buildQuery({ ...filters, pageToken })}`);
    // Each page is its own cached read, so any of them may still be being prepared. The
    // listing is reported as fetching until every page it needs has arrived: combining the
    // pages that did arrive would present a partial set as the whole.
    if (result.state === 'fetching') return result;
    const page = result.value;
    items.push(...(page.items ?? []));
    if (!page.hasMore || !page.nextPageToken) return { state: 'ready', value: { items, hasMore: false } };
    pageToken = page.nextPageToken;
  }
  return { state: 'ready', value: { items, hasMore: true } };
}

export function useReviewActivities(s: Scope, filters: ReviewActivityFilters) {
  return useQuery({
    queryKey: ['wf', 'review-activities', s.componentId, s.environmentId, filters],
    queryFn: () => fetchReviewActivities(s.componentId, s.environmentId, filters),
    refetchInterval: ({ state }) => fetchableRefetch(state.data),
    enabled: enabledFor(s),
  });
}

export interface PendingReviewCount {
  count: number;
  capped: boolean;
}

// Shared by usePendingReviewActivityCount and the project dashboard's batched queries.
export function pendingReviewCountQueryOptions(s: Scope, taskQueue?: string) {
  return {
    queryKey: ['wf', 'pending-review-count', s.componentId, s.environmentId, taskQueue] as const,
    queryFn: (): Promise<Fetchable<PendingReviewCount>> =>
      wfFetchable<Page<ReviewActivity>>(s.componentId, s.environmentId, `review-activities${buildQuery({ status: 'PENDING', taskQueue, limit: PENDING_REVIEW_PAGE })}`).then((r) =>
        mapFetchable(r, (p) => ({
          count: p.items?.length ?? 0,
          capped: p.hasMore === true,
        })),
      ),
    refetchInterval: ({ state }: { state: { data?: Fetchable<PendingReviewCount> } }) => fetchableRefetch(state.data) || 30000,
  };
}

export function usePendingReviewActivityCount(s: Scope, taskQueue?: string, enabled = true) {
  return useQuery({ ...pendingReviewCountQueryOptions(s, taskQueue), enabled: enabledFor(s) && enabled });
}

// ── Counts for the project dashboard ──
// The runtime has no count operation, so a count is the first COUNT_PAGE rows of a listing, `capped` when full.
const COUNT_PAGE = 50;

export interface CappedCount {
  count: number;
  // True when the page filled: the real number is at least `count`.
  capped: boolean;
}

export function instanceCountQueryOptions(s: Scope, filters: Omit<WorkflowFilters, 'limit' | 'pageToken'>) {
  return {
    queryKey: ['wf', 'instance-count', s.componentId, s.environmentId, filters] as const,
    queryFn: (): Promise<Fetchable<CappedCount>> =>
      wfFetchable<Page<WorkflowInstance>>(s.componentId, s.environmentId, `workflows${buildQuery({ ...filters, limit: COUNT_PAGE })}`).then((r) => mapFetchable(r, (p) => ({ count: p.items?.length ?? 0, capped: p.hasMore === true }))),
    refetchInterval: ({ state }: { state: { data?: Fetchable<CappedCount> } }) => fetchableRefetch(state.data) || 30000,
  };
}

export function useInstanceCount(s: Scope, filters: Omit<WorkflowFilters, 'limit' | 'pageToken'>, enabled = true) {
  return useQuery({ ...instanceCountQueryOptions(s, filters), enabled: enabledFor(s) && enabled });
}

// Every role's pending tasks — the project total, not the caller's own slice (`usePendingTaskCount`).
export function totalPendingTaskCountQueryOptions(s: Scope) {
  return {
    queryKey: ['wf', 'pending-count-total', s.componentId, s.environmentId] as const,
    queryFn: (): Promise<Fetchable<number>> => wfFetchable<{ count: number }>(s.componentId, s.environmentId, `human-tasks/pending-count${buildQuery({ all: true })}`).then((r) => mapFetchable(r, (d) => d.count ?? 0)),
    refetchInterval: ({ state }: { state: { data?: Fetchable<number> } }) => fetchableRefetch(state.data) || 30000,
  };
}

export function useTotalPendingTaskCount(s: Scope, enabled = true) {
  return useQuery({ ...totalPendingTaskCountQueryOptions(s), enabled: enabledFor(s) && enabled });
}

// First page of PENDING work items, tasks and reviews together, already scoped to what the caller may act on.
export function pendingWorkItemsQueryOptions(s: Scope, limit = 50, pageToken?: string) {
  return {
    queryKey: ['wf', 'pending-work-items', s.componentId, s.environmentId, limit, pageToken ?? ''] as const,
    queryFn: (): Promise<Fetchable<Page<WorkItemRow>>> => fetchWorkItems(s.componentId, s.environmentId, { status: 'PENDING', limit, pageToken }),
    refetchInterval: ({ state }: { state: { data?: Fetchable<Page<WorkItemRow>> } }) => fetchableRefetch(state.data) || 30000,
  };
}

// Reads the work-items listing because the pending-count endpoint cannot filter by parent workflow type.
export function pendingWorkItemCountQueryOptions(s: Scope, filters: { kind: 'HUMAN_TASK' | 'REVIEW_ACTIVITY'; parentWorkflowType: string; allRoles?: boolean }) {
  return {
    queryKey: ['wf', 'pending-work-item-count', s.componentId, s.environmentId, filters] as const,
    queryFn: (): Promise<Fetchable<CappedCount>> =>
      wfFetchable<Page<WorkItemRow>>(s.componentId, s.environmentId, `work-items${buildQuery({ status: 'PENDING', kind: filters.kind, parentWorkflowType: filters.parentWorkflowType, limit: COUNT_PAGE, all: filters.allRoles ? true : undefined })}`).then((r) =>
        mapFetchable(r, (p) => ({ count: p.items?.length ?? 0, capped: p.hasMore === true })),
      ),
    refetchInterval: ({ state }: { state: { data?: Fetchable<CappedCount> } }) => fetchableRefetch(state.data) || 30000,
  };
}

export function reviewActivityQueryOptions(s: Scope, taskId: string) {
  return {
    queryKey: ['wf', 'review-activity', s.componentId, s.environmentId, taskId] as const,
    queryFn: () => wfFetchable<ReviewActivityDetail>(s.componentId, s.environmentId, `review-activities/${encodeURIComponent(taskId)}`),
    refetchInterval: ({ state }: { state: { data?: Fetchable<ReviewActivityDetail> } }) => fetchableRefetch(state.data),
  };
}

export function useReviewActivity(s: Scope, taskId: string | null, paused = false) {
  const options = reviewActivityQueryOptions(s, taskId ?? '');
  return useQuery({
    ...options,
    // Same pause as useHumanTask: no background refetch under someone editing arguments.
    refetchInterval: paused ? false : options.refetchInterval,
    enabled: enabledFor(s) && !!taskId,
  });
}

export type ReviewDecision = 'proceed' | 'proceed-with-input' | 'reject';

export function useReviewDecision(s: Scope) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, decision, input, feedback }: { taskId: string; decision: ReviewDecision; input?: unknown; feedback?: string }) => {
      let init: RequestInit;
      if (decision === 'proceed-with-input') init = jsonBody({ method: 'POST' }, { input });
      else if (decision === 'reject') init = jsonBody({ method: 'POST' }, { feedback });
      else init = { method: 'POST' };
      return wfRequest<unknown>(s.componentId, s.environmentId, `review-activities/${encodeURIComponent(taskId)}/${decision}`, init);
    },
    onSuccess: () => invalidateForEnvironment(qc, s.environmentId),
  });
}

// ── Project-scope workflow management ────────────────────────────────────────
//
// A project shares one Temporal engine. Every runtime in it is bound to the same namespace
// (`namespace = <project>` in the runtime config) and differs only by task queue
// (`taskQueue = <integration>`). The management API relays to that engine, so any one runtime
// answers for the whole project: calling every integration's callback URL is unnecessary and would
// return the same namespace-wide rows once per runtime.
//
// Reads therefore go through a single gateway runtime, and scope is expressed with the `taskQueue`
// query parameter that the listings and pending-count accept:
//   - integration scope - taskQueue is that integration, so only its rows come back;
//   - project scope - taskQueue omitted, covering every task queue in the namespace, and never
//     another namespace, since the client is namespace-bound.
// Each record carries its own namespace/taskQueue, and that is what routes a follow-up operation
// back to the integration that owns it.
//
// `/definitions` is the exception: it takes no taskQueue and reports only what its own runtime
// hosts, so a project-wide list of startable workflows does have to ask every integration.

export interface WorkflowTarget {
  componentId: string;
  componentName: string;
  // The component handler — what the runtime is configured with as its `taskQueue`.
  handler: string;
}

export type Owned<T> = T & { componentId: string; componentName: string };

export function targetForTaskQueue(targets: WorkflowTarget[], taskQueue?: string): WorkflowTarget | undefined {
  return taskQueue ? targets.find((t) => t.handler === taskQueue) : undefined;
}

// 403/404/503 mean the integration has no running workflow runtime, or none visible to the caller — not a failure.
function isAbsent(e: unknown): boolean {
  const status = (e as { status?: number } | null | undefined)?.status;
  return status === 403 || status === 404 || status === 503;
}

export interface DefinitionsAcross {
  items: Owned<WorkflowDefinition>[];
  isLoading: boolean;
  failed: { componentName: string; message: string }[];
}

export function useWorkflowDefinitionsAcross(targets: WorkflowTarget[], environmentId: string): DefinitionsAcross {
  const results = useQueries({
    queries: targets.map((t) => ({
      queryKey: ['wf', 'definitions', t.componentId, environmentId],
      queryFn: () => fetchDefinitions(t.componentId, environmentId),
      refetchInterval: ({ state }: { state: { data?: Fetchable<WorkflowDefinition[]> } }) => fetchableRefetch(state.data),
      enabled: !!environmentId && !!t.componentId,
    })),
  });

  const items: Owned<WorkflowDefinition>[] = [];
  const failed: { componentName: string; message: string }[] = [];
  results.forEach((r, i) => {
    const target = targets[i];
    if (!target) return;
    // A target whose definitions are still being prepared contributes nothing yet; the query
    // comes back for it, and `isLoading` below keeps the caller from treating the partial
    // fan-out as complete.
    for (const d of valueOf(r.data) ?? []) {
      items.push({ ...d, componentId: target.componentId, componentName: target.componentName });
    }
    if (r.error && !isAbsent(r.error)) {
      failed.push({ componentName: target.componentName, message: r.error instanceof Error ? r.error.message : 'Request failed' });
    }
  });
  return {
    items,
    // Still "loading" while any target's definitions are being prepared server-side: the list
    // is genuinely incomplete until they arrive.
    isLoading: results.some((r) => r.isPending || isPreparing(r.data)),
    failed,
  };
}

// Several integrations may host the same type; the workflow-name filter needs one entry per name.
export function distinctWorkflowTypes(definitions: WorkflowDefinition[]): WorkflowDefinition[] {
  const byType = new Map<string, WorkflowDefinition>();
  for (const d of definitions) {
    if (!byType.has(d.workflowType)) byType.set(d.workflowType, d);
  }
  return [...byType.values()];
}
