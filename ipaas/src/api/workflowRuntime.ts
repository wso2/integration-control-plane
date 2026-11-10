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

import type { WorkflowDeploy, WorkflowDeployState, WorkflowRuntime, WorkflowRuntimeStatus } from '../types/workflowRuntime';
import { bff, q, seg } from './_client';

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

export const fetchWorkflowRuntime = (): Promise<WorkflowRuntime> => bff.get<BffWorkflowRuntime>('/platform-services/workflow-runtime').then(toWorkflowRuntime);

// Starts creating the runtime when the organization has none. Creating a workflow integration starts it best-effort; this retries.
export const ensureWorkflowRuntime = (): Promise<WorkflowRuntime> => bff.post<BffWorkflowRuntime>('/platform-services/workflow-runtime').then(toWorkflowRuntime);

interface BffWorkflowDeploy {
  environment: string;
  state: string;
  operation?: string;
  startedAt?: string;
  finishedAt?: string;
  releaseName?: string;
  message?: string;
}

const DEPLOY_STATES: readonly WorkflowDeployState[] = ['none', 'deploying', 'deployed', 'failed'];

// An unknown state reads as none: the console shows nothing it can't account for, and polls no further.
export const toWorkflowDeploy = (d: BffWorkflowDeploy): WorkflowDeploy => ({
  environment: d.environment,
  state: (DEPLOY_STATES as readonly string[]).includes(d.state) ? (d.state as WorkflowDeployState) : 'none',
  operation: d.operation === 'deploy' || d.operation === 'promote' ? d.operation : undefined,
  startedAt: d.startedAt,
  finishedAt: d.finishedAt,
  releaseName: d.releaseName,
  message: d.message,
});

/**
 * The deploy a 202 answer to a deploy or promote carries, or undefined for any other answer. The
 * BFF deploys a workflow after its request and answers with the run's status, in state deploying.
 */
export const acceptedWorkflowDeploy = (body: unknown): WorkflowDeploy | undefined => {
  const d = body as Partial<BffWorkflowDeploy> | null;
  return d && d.state === 'deploying' && typeof d.environment === 'string' ? toWorkflowDeploy(d as BffWorkflowDeploy) : undefined;
};

// GET /components/{c}/workflow-deploy reads one annotation of the component, cheap enough to poll.
export const fetchWorkflowDeploy = (componentId: string, environment: string): Promise<WorkflowDeploy> => bff.get<BffWorkflowDeploy>(`/components/${seg(componentId)}/workflow-deploy${q({ environment })}`).then(toWorkflowDeploy);
