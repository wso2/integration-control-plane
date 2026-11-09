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

/**
 * Wire types for the workflow Management API, which a workflow integration serves from its own
 * container on the `/workflow` base path (the Ballerina module attaches the service there). The
 * console reaches it through the API Platform gateway; see `connection/useWorkflowConnection.ts`.
 * Every type here mirrors a record in `module-ballerina-workflow`'s `modules/management/types.bal`:
 * field names and spellings are the API's, not ours.
 *
 * A few fields are typed as the literal `null` rather than a value type. That is deliberate: the
 * runtime never populates them today, and typing them `null` turns "render it" into a compile
 * error instead of an empty column someone has to debug.
 */

// Vocabularies

/** Note `CANCELED`: one L, matching the API. */
export type WorkflowStatus = 'RUNNING' | 'SUSPENDED' | 'COMPLETED' | 'FAILED' | 'CANCELED' | 'TERMINATED' | 'TIMED_OUT' | 'CONTINUED_AS_NEW' | 'UNKNOWN';

/**
 * The subset accepted by the `status` query parameter. `CONTINUED_AS_NEW` and `UNKNOWN` can come
 * back on a row but cannot be filtered on: the runtime silently drops the clause. `SUSPENDED` is
 * the runtime's own split of Temporal's "running" and is applied server-side for us.
 */
export type WorkflowStatusFilter = Exclude<WorkflowStatus, 'CONTINUED_AS_NEW' | 'UNKNOWN'>;

export type TaskStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'CANCELED' | 'TERMINATED' | 'UNKNOWN';

export type WorkflowKind = 'WORKFLOW' | 'AGENT' | 'HUMAN_TASK' | 'REVIEW_ACTIVITY' | 'CHILD_WORKFLOW';

export type DefinitionKind = 'WORKFLOW' | 'AGENT';

export type ActivityNodeType = 'ACTIVITY' | 'TIMER' | 'DATA' | 'CHILD_WORKFLOW' | 'HUMAN_TASK' | 'REVIEW_ACTIVITY';

export type ActivityNodeStatus = 'RUNNING' | 'WAITING' | 'COMPLETED' | 'FAILED' | 'TIMED_OUT' | 'CANCELED';

/** `PRE_RUN` gates an activity before it runs; `ON_FAILURE` decides what to do after one failed. */
export type ReviewTrigger = 'PRE_RUN' | 'ON_FAILURE';

// Paging

/**
 * The request parameter is `pageToken` but the response field is `nextPageToken`, and the tokens
 * are not interchangeable between endpoints: workflows use a Base64 Temporal continuation token,
 * human tasks and reviews use `"<startTime>~<taskId>"`. Nothing outside a resource's own hook
 * should ever hold one.
 */
export interface Page<T> {
  items: T[];
  nextPageToken: string | null;
  hasMore: boolean;
}

// Runtime and definitions

/** `taskQueue` is null until the worker registers. */
export interface WorkflowRuntimeInfo {
  taskQueue: string | null;
}

export interface WorkflowDefinition {
  workflowType: string;
  kind: DefinitionKind;
  /** A JSON Schema document **serialized as a string**: parse before use. */
  inputSchema: string | null;
  isActive: boolean;
  workerCount: number;
}

// Instances

export interface WorkflowInstanceSummary {
  namespace?: string;
  taskQueue?: string;
  workflowId: string;
  runId: string;
  workflowType: string;
  status: WorkflowStatus;
  startTime: string;
  closeTime: string | null;
  kind: WorkflowKind | null;
  /** Always null on a list row: the run's input is only recoverable from its history. */
  input: null;
}

export interface ActivityInvocation {
  activityName: string;
  input: unknown[];
  output: unknown;
  status: string;
  errorMessage: string | null;
  attempt?: number;
}

/**
 * `GET /workflows/{id}`. Note what is *absent*: no `runId`, `startTime`, `closeTime`, `taskQueue`
 * or `input`. Anything needing those must come from the list row or the history.
 * `activityInvocations` is empty unless the run reached `COMPLETED` or `FAILED`.
 */
export interface WorkflowExecutionInfo {
  workflowId: string;
  workflowType: string;
  status: WorkflowStatus;
  kind: WorkflowKind | null;
  result: unknown;
  errorMessage: string | null;
  activityInvocations: ActivityInvocation[];
}

export interface ActivityFailure {
  message: string;
  type: string | null;
  cause: string | null;
}

/**
 * One entry per *attempt*, so a retried step appears more than once with the same `stepId`.
 * Despite the name the result is a flat ordered list: `children` is always null.
 */
export interface ActivityTreeNode {
  /** The Temporal event id that opened this execution, as a string. */
  id: string;
  name: string;
  type: ActivityNodeType;
  status: ActivityNodeStatus;
  startTime: string | null;
  endTime: string | null;
  input: unknown;
  output: unknown;
  failure: ActivityFailure | null;
  attempt: number;
  /** The call site this execution belongs to. Absent when the model could not be matched. */
  stepId: string | null;
  /**
   * A review's own node in the descriptor (`<reviewedStep>#review`), from runtimes that record it.
   * Not what places a review: its `stepId` names the step it gates.
   */
  reviewStepId?: string | null;
  /** Always null today: the tree is flat. */
  children: null;
}

export interface ExecutionGraphNode {
  id: string;
  label: string;
  type: ActivityNodeType;
  status: ActivityNodeStatus;
  metadata: { stepId?: string } | null;
}

/**
 * Edges are purely sequential (node *i* to node *i+1* in history order) and `label` is always
 * null. This is a chain, not a DAG; it does not need a layout engine.
 */
export interface ExecutionGraphEdge {
  source: string;
  target: string;
  label: null;
}

export interface ExecutionGraph {
  nodes: ExecutionGraphNode[];
  edges: ExecutionGraphEdge[];
}

/** `eventId` is a number here while activity-tree and graph node ids are strings. */
export interface HistoryEvent {
  eventId: number;
  eventType: string;
  timestamp: string;
  attributes: Record<string, unknown>;
}

export interface ResetPoint {
  eventId: number;
  eventType: 'WORKFLOW_TASK_COMPLETED' | 'WORKFLOW_TASK_FAILED' | 'WORKFLOW_TASK_TIMED_OUT';
  timestamp: string;
  nodeIds: string[];
  nodeNames: string[];
  /** The default "retry from where it broke" point. */
  isFirstFailure: boolean;
}

export type ResetType = 'first-workflow-task' | 'last-workflow-task' | 'workflow-task-id';

export interface ResetRequest {
  resetType: ResetType;
  /** Required when `resetType` is `workflow-task-id`. */
  eventId?: number;
  reason?: string;
  reapply?: {
    type?: 'signal' | 'none' | 'all-eligible';
    exclude?: ('signal' | 'update' | 'nexus' | 'cancel-request')[];
  };
}

/** Reset returns the same `workflowId` with a new `runId`. */
export interface WorkflowHandle {
  workflowId: string;
  runId: string;
}

export interface StartWorkflowRequest {
  workflowType: string;
  input?: unknown;
  /** Caller-supplied id; the runtime generates a UUID v7 when omitted. */
  workflowId?: string;
  timeoutSeconds?: number;
}

export type WorkflowLifecycleAction = 'suspend' | 'resume' | 'wake' | 'terminate' | 'cancel';

// Human tasks

/**
 * What every task reports, whichever kind (the engine's 0.10 `TaskSummary`). Who may act is the
 * audience (roles or named users, minus the excluded) and who did act is the completer.
 * Administrators stand beside the audience: they may reassign the task, move its deadline, fail
 * it, or complete it, and a completion by one is stamped `administrator`. Fields 0.10 added are
 * optional, so a runtime built against an older module still reads.
 */
export interface TaskSummary {
  kind?: 'HUMAN_TASK' | 'REVIEW_ACTIVITY';
  taskId: string;
  taskName: string;
  title: string;
  description?: string;
  namespace?: string;
  /** Mutations must reach the integration serving this queue, or the API answers 403. */
  taskQueue?: string;
  parentWorkflowId: string;
  parentWorkflowType?: string | null;
  /** The call site in the workflow that created the task, when it named one. */
  stepId?: string | null;
  status: TaskStatus;
  startTime: string;
  closeTime: string | null;
  userRoles: string[];
  users?: string[];
  excludedUsers?: string[];
  excludedRoles?: string[];
  administratorRoles?: string[];
  administratorUsers?: string[];
  /** Absent while pending, and for tasks decided before the runtime began recording it. */
  completedBy?: string | null;
  completedAt?: string | null;
  completedAs?: 'audience' | 'administrator' | null;
  canComplete?: boolean;
  canAdminister?: boolean;
}

export interface HumanTaskSummary extends TaskSummary {
  parentWorkflowType: string | null;
  completedBy: string | null;
  completedAt: string | null;
  canComplete: boolean;
}

export interface HumanTaskInfo extends HumanTaskSummary {
  description: string;
  /** Read-only context rendered alongside the form. */
  taskInput?: Record<string, unknown> | null;
  /** A runtime before 0.10 reports `taskInput` under this name. */
  payload?: Record<string, unknown> | null;
  createdAt: string;
  /** A JSON Schema document **serialized as a string**; null until the plugin supplies one. */
  formSchema: string | null;
  result: unknown;
}

/**
 * The audience an administrator gives a live task. Each present list replaces the task's own; an
 * absent one is left as it was. Administrators themselves cannot be changed.
 */
export interface TaskAudience {
  userRoles?: string[];
  users?: string[];
  excludedUsers?: string[];
  excludedRoles?: string[];
}

/** What an administrator's reassign or deadline change answers with. */
export interface TaskAdministration {
  success: boolean;
  action: 'reassign' | 'extendDeadline';
  administeredBy: string;
  administeredAt: string;
}

export interface CompletionInfo {
  success: boolean;
  completedBy: string;
  completedAt: string;
}

// Review activities

export interface ReviewActivitySummary extends TaskSummary {
  activityName: string;
  trigger: ReviewTrigger;
}

/** The decision a review received, as the runtime recorded it. */
export interface ReviewDecisionRecord {
  action: ReviewDecision;
  input?: Record<string, unknown> | null;
  feedback?: string | null;
}

export interface ReviewActivityInfo extends ReviewActivitySummary {
  description: string;
  /** Empty string for a `PRE_RUN` gate. */
  errorMessage: string;
  /** The proposed arguments: seed the decision form from these. */
  taskInput?: Record<string, unknown> | null;
  /** A runtime before 0.10 reports `taskInput` under this name. */
  activityArgs?: Record<string, unknown> | null;
  /** A JSON Schema document **serialized as a string**. */
  formSchema: string | null;
  createdAt: string;
  /** Null while pending. */
  decision?: ReviewDecisionRecord | null;
  /** A runtime before 0.10 reports the completer under these names. */
  decidedBy?: string | null;
  decidedAt?: string | null;
}

export type ReviewDecision = 'proceed' | 'proceed-with-input' | 'reject';

export interface ReviewDecisionInfo {
  success: boolean;
  decision: ReviewDecision;
  completedBy?: string;
  completedAt?: string;
  /** A runtime before 0.10 reports the completer under these names. */
  decidedBy?: string;
  decidedAt?: string;
}

export interface BulkRetryRequest {
  action: 'retry' | 'fail';
  /** Exactly one of `taskIds` or `parentWorkflowId`. */
  taskIds?: string[];
  parentWorkflowId?: string;
  activityName?: string;
  feedback?: string;
}

export interface BulkItemResult {
  taskId: string;
  outcome: 'APPLIED' | 'SKIPPED' | 'FAILED';
  reason: string | null;
}

/** Answered 200 even when some items failed: always read the counts. */
export interface BulkRetryResult {
  action: 'retry' | 'fail';
  requested: number;
  applied: number;
  skipped: number;
  failed: number;
  items: BulkItemResult[];
  decidedBy: string;
  decidedAt: string;
}

// List filters

export interface WorkflowListFilters {
  status?: WorkflowStatusFilter | '';
  workflowType?: string;
  /** Prefix match, not exact. */
  workflowId?: string;
  startedBy?: string;
  startTimeFrom?: string;
  startTimeTo?: string;
  closeTimeFrom?: string;
  closeTimeTo?: string;
  taskQueue?: string;
  limit?: number;
  pageToken?: string;
}

export interface HumanTaskListFilters {
  status?: TaskStatus | '';
  parentWorkflowId?: string;
  parentWorkflowType?: string;
  taskName?: string;
  userRole?: string;
  startTimeFrom?: string;
  startTimeTo?: string;
  closeTimeFrom?: string;
  closeTimeTo?: string;
  taskQueue?: string;
  limit?: number;
  pageToken?: string;
}

/** Narrower than the human-task set: no `parentWorkflowType`, no `userRole`. */
export interface ReviewListFilters {
  status?: TaskStatus | '';
  parentWorkflowId?: string;
  taskName?: string;
  startTimeFrom?: string;
  startTimeTo?: string;
  closeTimeFrom?: string;
  closeTimeTo?: string;
  taskQueue?: string;
  limit?: number;
  pageToken?: string;
}
