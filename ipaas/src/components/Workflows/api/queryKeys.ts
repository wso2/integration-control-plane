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
 * Query keys for everything read from the workflow engine.
 *
 * `scopeId` (from the ready connection) folds the integration, its release and the environment
 * into one string, so a read from one deployment is never served for another. The caller is not
 * in it: every call names the signed-in user, and a session cannot change user or organization.
 *
 * Everything sits under `wf`, which `shared/autoRefresh.ts` relies on to find the workflow reads.
 */

const ROOT = 'wf';

export const workflowKeys = {
  all: (scopeId: string) => [ROOT, scopeId] as const,

  runtime: (scopeId: string) => [ROOT, scopeId, 'runtime'] as const,
  metadata: (scopeId: string) => [ROOT, scopeId, 'metadata'] as const,
  definitions: (scopeId: string) => [ROOT, scopeId, 'definitions'] as const,

  instances: (scopeId: string, filters?: unknown) => [ROOT, scopeId, 'instances', filters ?? {}] as const,
  instance: (scopeId: string, workflowId: string, runId?: string | null) => [ROOT, scopeId, 'instance', workflowId, runId ?? ''] as const,
  history: (scopeId: string, workflowId: string, runId?: string | null) => [ROOT, scopeId, 'history', workflowId, runId ?? ''] as const,
  activityTree: (scopeId: string, workflowId: string, runId?: string | null) => [ROOT, scopeId, 'activity-tree', workflowId, runId ?? ''] as const,
  executionGraph: (scopeId: string, workflowId: string, runId?: string | null) => [ROOT, scopeId, 'execution-graph', workflowId, runId ?? ''] as const,
  resetPoints: (scopeId: string, workflowId: string, runId?: string | null) => [ROOT, scopeId, 'reset-points', workflowId, runId ?? ''] as const,

  humanTasks: (scopeId: string, filters?: unknown) => [ROOT, scopeId, 'human-tasks', filters ?? {}] as const,
  humanTask: (scopeId: string, taskId: string) => [ROOT, scopeId, 'human-task', taskId] as const,
  pendingCount: (scopeId: string, taskQueue?: string) => [ROOT, scopeId, 'pending-count', taskQueue ?? ''] as const,

  reviews: (scopeId: string, filters?: unknown) => [ROOT, scopeId, 'reviews', filters ?? {}] as const,
  review: (scopeId: string, taskId: string) => [ROOT, scopeId, 'review', taskId] as const,
};

/** Every key scoped to one run: what a lifecycle action or reset must invalidate together. */
export function runScopedKeys(scopeId: string, workflowId: string, runId?: string | null) {
  return [
    workflowKeys.instance(scopeId, workflowId, runId),
    workflowKeys.history(scopeId, workflowId, runId),
    workflowKeys.activityTree(scopeId, workflowId, runId),
    workflowKeys.executionGraph(scopeId, workflowId, runId),
    workflowKeys.resetPoints(scopeId, workflowId, runId),
  ];
}

/** Whether a query key belongs to the connection `scopeId` names. */
export function isScopedWorkflowKey(queryKey: readonly unknown[], scopeId: string): boolean {
  return queryKey[0] === ROOT && queryKey[1] === scopeId;
}
