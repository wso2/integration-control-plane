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

/**
 * The workflow Management API a workflow publishes through the gateway: the routes, shapes and
 * spellings of module-ballerina-workflow's management module. Only what the portal reads is here.
 */

/** `CANCELED` has one L, as the API spells it. */
export type RunStatus = 'RUNNING' | 'SUSPENDED' | 'COMPLETED' | 'FAILED' | 'CANCELED' | 'TERMINATED' | 'TIMED_OUT' | 'CONTINUED_AS_NEW' | 'UNKNOWN';

export const RUN_STATUS_FILTERS = ['RUNNING', 'SUSPENDED', 'COMPLETED', 'FAILED', 'CANCELED', 'TERMINATED', 'TIMED_OUT'] as const;
export type RunStatusFilter = (typeof RUN_STATUS_FILTERS)[number];

export type TaskStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'CANCELED' | 'TERMINATED' | 'UNKNOWN';

export interface Page<T> {
  items: T[];
  nextPageToken: string | null;
  hasMore: boolean;
}

export interface WorkflowDefinition {
  workflowType: string;
  kind: 'WORKFLOW' | 'AGENT';
  /** A JSON Schema document, serialized as a string. */
  inputSchema: string | null;
  isActive: boolean;
  workerCount: number;
}

export interface RunSummary {
  workflowId: string;
  runId: string;
  workflowType: string;
  status: RunStatus;
  startTime: string;
  closeTime: string | null;
}

export interface RunInfo {
  workflowId: string;
  workflowType: string;
  status: RunStatus;
  result: unknown;
  errorMessage: string | null;
}

export type StepType = 'ACTIVITY' | 'TIMER' | 'DATA' | 'CHILD_WORKFLOW' | 'HUMAN_TASK' | 'REVIEW_ACTIVITY';
export type StepStatus = 'RUNNING' | 'WAITING' | 'COMPLETED' | 'FAILED' | 'TIMED_OUT' | 'CANCELED';

/** One attempt of one step, in history order. */
export interface StepAttempt {
  id: string;
  name: string;
  type: StepType;
  status: StepStatus;
  startTime: string | null;
  endTime: string | null;
  input: unknown;
  output: unknown;
  failure: { message: string; type: string | null; cause: string | null } | null;
  attempt: number;
  stepId: string | null;
}

export interface TaskSummary {
  kind?: 'HUMAN_TASK' | 'REVIEW_ACTIVITY';
  taskId: string;
  taskName: string;
  title: string;
  description?: string;
  parentWorkflowId: string;
  parentWorkflowType?: string | null;
  status: TaskStatus;
  startTime: string;
  closeTime: string | null;
  completedBy?: string | null;
  canComplete?: boolean;
}

export interface HumanTask extends TaskSummary {
  taskInput?: Record<string, unknown> | null;
  /** A JSON Schema document, serialized as a string. */
  formSchema: string | null;
  result: unknown;
}

export type ReviewTrigger = 'PRE_RUN' | 'ON_FAILURE';

export interface ReviewSummary extends TaskSummary {
  activityName: string;
  trigger: ReviewTrigger;
}

/** The engine's ReviewDecision record: what a reviewer decided. */
export interface ReviewDecisionRecord {
  action: 'proceed' | 'proceed-with-input' | 'reject';
  input?: Record<string, unknown> | null;
  feedback?: string | null;
}

export interface Review extends ReviewSummary {
  /** Empty for a PRE_RUN review. */
  errorMessage: string;
  /** The recorded decision, once made. Only a review's detail has it, not its list row. */
  decision?: ReviewDecisionRecord | null;
  /** The proposed arguments of the step under review. */
  taskInput?: Record<string, unknown> | null;
  formSchema: string | null;
}

/** The compiled shape of a workflow, from `GET /metadata`. */
export interface ModelNode {
  stepId: string;
  kind: string;
  target?: string;
  label?: string;
  parent?: string;
  branch?: string;
}

export interface WorkflowMetadata {
  descriptor: { workflows?: { name: string; graph?: { nodes: ModelNode[] } }[] } | null;
}
