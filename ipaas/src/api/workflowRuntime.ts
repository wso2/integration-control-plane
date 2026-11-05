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

import type { WorkflowRuntime, WorkflowRuntimeStatus } from '../types/workflowRuntime';
import { bff } from './_client';

interface BffWorkflowRuntime {
  status: string;
  server?: { name: string };
  namespaces: { environment: string; namespace: string }[] | null;
}

const STATUSES: readonly WorkflowRuntimeStatus[] = ['NOT_CONFIGURED', 'NOT_PROVISIONED', 'PROVISIONING', 'READY', 'ERROR'];

// An unknown status is shown as an error: no action is safe on a state this console does not know.
export const toWorkflowRuntime = (r: BffWorkflowRuntime): WorkflowRuntime => ({
  status: (STATUSES as readonly string[]).includes(r.status) ? (r.status as WorkflowRuntimeStatus) : 'ERROR',
  serverName: r.server?.name,
  namespaces: r.namespaces ?? [],
});

export const fetchWorkflowRuntime = (): Promise<WorkflowRuntime> => bff.get<BffWorkflowRuntime>('/workflow-runtime').then(toWorkflowRuntime);

// Starts creating the runtime when the organization has none. Creating a workflow integration starts it best-effort; this retries.
export const ensureWorkflowRuntime = (): Promise<WorkflowRuntime> => bff.post<BffWorkflowRuntime>('/workflow-runtime').then(toWorkflowRuntime);
