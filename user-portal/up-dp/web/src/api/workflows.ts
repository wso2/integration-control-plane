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

import { accessToken } from '../auth/tokens';
import type {
  HumanTask,
  Page,
  Review,
  ReviewSummary,
  RunInfo,
  RunStatusFilter,
  RunSummary,
  StepAttempt,
  TaskStatus,
  TaskSummary,
  WorkflowDefinition,
  WorkflowMetadata,
} from '../types/workflow';
import { request } from './http';

/**
 * A workflow's Management API on the gateway, reached with the signed-in user's access token.
 * The engine reads the caller and their roles from it, which decides the tasks they see.
 */

export type ReviewDecision = { kind: 'proceed' } | { kind: 'proceed-with-input'; input: Record<string, unknown> } | { kind: 'reject'; feedback?: string };

function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') search.set(key, String(value));
  });
  const text = search.toString();
  return text ? `?${text}` : '';
}

export function workflowClient(endpointUrl: string) {
  const base = endpointUrl.replace(/\/$/, '');
  const id = encodeURIComponent;
  const get = async <T>(path: string) => request<T>(`${base}${path}`, { token: await accessToken() });
  const post = async <T>(path: string, body?: unknown) => request<T>(`${base}${path}`, { method: 'POST', body, token: await accessToken() });

  return {
    taskQueue: async () => (await get<{ taskQueue: string | null }>('/runtime')).taskQueue,
    metadata: () => get<WorkflowMetadata | null>('/metadata'),
    definitions: async () => (await get<{ definitions: WorkflowDefinition[] } | null>('/definitions'))?.definitions ?? [],

    runs: (status: RunStatusFilter | '', limit: number, pageToken?: string) => get<Page<RunSummary>>(`/workflows${query({ status, limit, pageToken })}`),
    start: (workflowType: string, input: unknown) => post<{ workflowId: string; runId: string }>('/workflows', { workflowType, input }),
    run: (workflowId: string, runId: string) => get<RunInfo>(`/workflows/${id(workflowId)}/${id(runId)}`),
    steps: async (workflowId: string, runId: string) => (await get<{ nodes: StepAttempt[] } | null>(`/workflows/${id(workflowId)}/${id(runId)}/activity-tree`))?.nodes ?? [],
    cancel: (workflowId: string, runId: string) => post<{ success: boolean }>(`/workflows/${id(workflowId)}/${id(runId)}/cancel`),

    tasks: (status: TaskStatus | '', limit: number, parentWorkflowId?: string) => get<Page<TaskSummary>>(`/human-tasks${query({ status, limit, parentWorkflowId })}`),
    task: (taskId: string) => get<HumanTask>(`/human-tasks/${id(taskId)}`),
    complete: (taskId: string, result: unknown) => post<unknown>(`/human-tasks/${id(taskId)}/complete`, { result }),

    reviews: (status: TaskStatus | '', limit: number, parentWorkflowId?: string) => get<Page<ReviewSummary>>(`/review-activities${query({ status, limit, parentWorkflowId })}`),
    review: (taskId: string) => get<Review>(`/review-activities/${id(taskId)}`),
    decide: (taskId: string, decision: ReviewDecision) => {
      if (decision.kind === 'proceed') return post<unknown>(`/review-activities/${id(taskId)}/proceed`);
      if (decision.kind === 'proceed-with-input') return post<unknown>(`/review-activities/${id(taskId)}/proceed-with-input`, { input: decision.input });
      return post<unknown>(`/review-activities/${id(taskId)}/reject`, decision.feedback ? { feedback: decision.feedback } : {});
    },
  };
}

export type WorkflowClient = ReturnType<typeof workflowClient>;
