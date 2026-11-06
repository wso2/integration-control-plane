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

import type { QueryClient } from '@tanstack/react-query';
import { isWorkflowError } from '../api/http';
import { runScopedKeys, workflowKeys } from '../api/queryKeys';
import { markSettling } from '../api/settleRegistry';
import type { HumanTaskSummary, ReviewActivityInfo, ReviewActivitySummary, ReviewTrigger, TaskStatus } from '../api/types';
import type { WorkItemKind } from '../routing/useWorkflowRoutes';

/**
 * One row in the Human Tasks queue, from either of the two resources behind it.
 *
 * The engine has no single queue route (`/human-tasks` and `/review-activities` are separate, differently-filtered
 * resources), so the merge happens here instead. See `mergeWorkItems`.
 */
export interface WorkItem {
  kind: WorkItemKind;
  /** The id used for every detail read and action on this item. */
  taskId: string;
  title: string;
  /** `taskName` for a human task, `activityName` for a review. */
  name: string;
  parentWorkflowId: string;
  /** Reviews report the parent's type only from workflow 0.10 on. */
  parentWorkflowType: string | null;
  status: TaskStatus;
  startTime: string;
  closeTime: string | null;
  /** Empty means unrestricted (reviews only). */
  userRoles: string[];
  /**
   * Mutations must reach the integration serving this queue, or the engine answers 403. The page is
   * scoped to one integration and cannot route elsewhere, so this is compared against the runtime's
   * own queue to decide whether to offer the action at all.
   */
  taskQueue?: string;
  /** Human tasks only: whether the engine says this caller may complete it. */
  canComplete?: boolean;
  /** Reviews only: an approval gate before the activity, or a decision after it failed. */
  trigger?: ReviewTrigger;
}

export function humanTaskToWorkItem(task: HumanTaskSummary): WorkItem {
  return {
    kind: 'task',
    taskId: task.taskId,
    title: task.title || task.taskName,
    name: task.taskName,
    parentWorkflowId: task.parentWorkflowId,
    parentWorkflowType: task.parentWorkflowType,
    status: task.status,
    startTime: task.startTime,
    closeTime: task.closeTime,
    userRoles: task.userRoles,
    taskQueue: task.taskQueue,
    canComplete: task.canComplete,
  };
}

export function reviewToWorkItem(review: ReviewActivitySummary): WorkItem {
  return {
    kind: 'review',
    taskId: review.taskId,
    title: review.title || review.activityName,
    name: review.activityName,
    parentWorkflowId: review.parentWorkflowId,
    parentWorkflowType: review.parentWorkflowType ?? null,
    status: review.status,
    startTime: review.startTime,
    closeTime: review.closeTime,
    userRoles: review.userRoles,
    taskQueue: review.taskQueue,
    trigger: review.trigger,
  };
}

/**
 * Any pending review can be decided in bulk: the engine's bulk retry proceeds a
 * review whatever its trigger. Human tasks never are; each carries a result a person supplies.
 */
export function isBulkSelectable(item: WorkItem): boolean {
  return item.kind === 'review' && item.status === 'PENDING';
}

/**
 * Whether this integration can act on an item: mutations must reach the integration serving the
 * item's task queue. An item or a runtime that names no queue is taken as served here.
 */
export function ownedHere(taskQueue: string | undefined, runtimeTaskQueue: string | null): boolean {
  return !taskQueue || !runtimeTaskQueue || taskQueue === runtimeTaskQueue;
}

/** The arguments a review holds: `taskInput` from workflow 0.10, `activityArgs` before it. */
export function reviewTaskInput(review: ReviewActivityInfo): Record<string, unknown> | null {
  return review.taskInput ?? review.activityArgs ?? null;
}

/** Who completed a task and when: `completed*` from workflow 0.10, a review's `decided*` before. */
export function taskCompleter(task: { completedBy?: string | null; completedAt?: string | null; decidedBy?: string | null; decidedAt?: string | null }): { by: string | null; at: string | null } {
  return {
    by: task.completedBy ?? task.decidedBy ?? null,
    at: task.completedAt ?? task.decidedAt ?? null,
  };
}

/** A task's name for a heading: its title, or its name without the `<workflowType>.` qualifier. */
export function taskDisplayName(task: { taskId: string; title?: string; taskName?: string; parentWorkflowType?: string | null }): string {
  if (task.title) {
    return task.title;
  }
  if (task.taskName) {
    const prefix = task.parentWorkflowType ? `${task.parentWorkflowType}.` : '';
    return prefix && task.taskName.startsWith(prefix) ? task.taskName.slice(prefix.length) : task.taskName;
  }
  return task.taskId;
}

/** Who a task is open to (roles, named users, and who is excluded) for someone who cannot act. */
export function audienceSummary(task: { userRoles?: string[]; users?: string[]; excludedUsers?: string[]; excludedRoles?: string[] }): string | undefined {
  const roles = (task.userRoles ?? []).join(', ');
  const users = (task.users ?? []).join(', ');
  const excludedRoles = (task.excludedRoles ?? []).join(', ');
  const excludedUsers = (task.excludedUsers ?? []).join(', ');
  if (!roles && !users) {
    return undefined;
  }
  let included: string;
  if (roles && users) included = `roles ${roles} or users ${users}`;
  else if (roles) included = `roles ${roles}`;
  else included = `users ${users}`;
  let excluded = '';
  if (excludedRoles && excludedUsers) excluded = `, except roles ${excludedRoles} and users ${excludedUsers}`;
  else if (excludedRoles) excluded = `, except roles ${excludedRoles}`;
  else if (excludedUsers) excluded = `, except users ${excludedUsers}`;
  return `${included}${excluded}`;
}

/** Whether a completion was made by the audience or by an administrator, when recorded. */
export function completedAsLabel(completedAs?: string | null): string | undefined {
  if (completedAs === 'administrator') return 'As an administrator';
  return completedAs === 'audience' ? 'As the audience' : undefined;
}

/** What a review's trigger means, for its detail. */
export function reviewTriggerLabel(trigger: string | undefined): string {
  if (trigger === 'PRE_RUN') return 'Approval gate: review before the activity runs';
  if (trigger === 'ON_FAILURE') return 'Review failure: decide the failed activity’s retry';
  return trigger || '-';
}

/** What a decided review's recorded decision did. */
export function reviewDecisionLabel(action: unknown): string | undefined {
  switch (action) {
    case 'proceed':
      return 'Proceeded: reran the activity with the original input';
    case 'proceed-with-input':
      return 'Proceeded with changes';
    case 'reject':
      return 'Rejected: the failure was surfaced to the workflow';
    default:
      return typeof action === 'string' && action ? action : undefined;
  }
}

/** `1 review`, `3 reviews`. */
export function countOf(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/** A failed call's own words, which the engine's errors always carry, or `fallback`. */
export function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/**
 * What a refused action says. A credential the gateway refused is renewed as well, as the
 * connection asks of a mutation that got a 401, so trying again can succeed.
 */
export function actionErrorText(connection: { renewCredential: () => void }, error: unknown, fallback: string): string {
  if (isWorkflowError(error, 'GATEWAY_REJECTED')) connection.renewCredential();
  return errorText(error, fallback);
}

/** Whether two JSON values are the same value, whatever the order of their keys. */
export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => sameValue(v, b[i]));
  const aKeys = Object.keys(a);
  const bRecord = b as Record<string, unknown>;
  return aKeys.length === Object.keys(b).length && aKeys.every((key) => key in bRecord && sameValue((a as Record<string, unknown>)[key], bRecord[key]));
}

/** A short message the page raises after an action, as a snackbar. */
export interface TaskNotice {
  message: string;
  severity: 'success' | 'error';
}

/**
 * Deciding a task or review advances its parent run: that run's reads and the run lists are stale,
 * and the visibility store may lag the decision, so the run views keep polling it for a while.
 */
export function refreshParentRun(queryClient: QueryClient, scopeId: string, parentWorkflowId: string): void {
  void queryClient.invalidateQueries({ queryKey: [...workflowKeys.all(scopeId), 'instances'] });
  if (!parentWorkflowId) return;
  markSettling(parentWorkflowId);
  // Without the run id, so every run of the parent workflow matches.
  runScopedKeys(scopeId, parentWorkflowId).forEach((key) => void queryClient.invalidateQueries({ queryKey: key.slice(0, -1) }));
}
