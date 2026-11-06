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

import { useQuery } from '@tanstack/react-query';
import type { ModelGraph } from '../model/workflowFlow';
import { isWorkflowError } from './http';
import { workflowKeys } from './queryKeys';
import type { WorkflowApi } from './useWorkflowApi';

/**
 * The workflow descriptor: the compiled `workflow.def.json` the plugin packs into the running
 * program, and the only source of a workflow's *structure* (branches, loops, arms, and the steps a
 * run has not reached yet).
 *
 * A runtime builds it in-process with `workflow.management:getWorkflowMetadata`; the console reads
 * the same document from the Management API's `GET /metadata` (`client.metadata.get`). A runtime built against a
 * workflow module older than that route answers 404, which is a first-class, non-error state: the
 * flow view then draws the run's executed steps and says why.
 */

/** Shaped after `management/metadata.bal`'s `WorkflowMetadata`. */
export interface WorkflowMetadata {
  metadataVersion?: string;
  /** The build-time descriptor. Null when the program was built without one. */
  descriptor: WorkflowDescriptor | null;
}

/** One workflow's or agent's entry in the descriptor, named as it registers. */
interface DescriptorEntry {
  name: string;
  graph?: ModelGraph;
}

/** Shaped by the module's `docs/spec/workflow-descriptor.schema.json`. */
export interface WorkflowDescriptor {
  checksum?: string;
  workflows?: DescriptorEntry[];
  /** A durable agent's graph is a star (the model and its tools), listed apart from workflows. */
  agents?: DescriptorEntry[];
}

export type WorkflowMetadataState =
  | { status: 'loading' }
  /** The runtime serves descriptors. */
  | { status: 'available'; metadata: WorkflowMetadata }
  /** The route isn't served, or the program carries no descriptor. Expected, not a failure. */
  | { status: 'unsupported' }
  | { status: 'error'; message: string };

export function useWorkflowMetadata({ client, connection }: WorkflowApi): WorkflowMetadataState {
  const scopeId = connection.status === 'ready' ? connection.scopeId : '';

  const { data, error, isPending } = useQuery({
    queryKey: workflowKeys.metadata(scopeId),
    queryFn: () => client!.metadata.get(),
    enabled: !!client,
    // The descriptor is fixed for the life of a deployment.
    staleTime: Infinity,
    retry: false,
  });

  if (!client || isPending) {
    return { status: 'loading' };
  }
  if (error) {
    // A 404 is the expected answer from a runtime that predates the route.
    if (isWorkflowError(error, 'NOT_FOUND')) {
      return { status: 'unsupported' };
    }
    return { status: 'error', message: error instanceof Error ? error.message : 'Could not load the workflow structure.' };
  }
  if (!data?.descriptor) {
    return { status: 'unsupported' };
  }
  return { status: 'available', metadata: data };
}

/**
 * The graph of one workflow type, and whether it is a workflow's control flow or an agent's star,
 * or null when the descriptor does not describe the type. Workflows are looked
 * up by name first, then agents, since an agent's runner registers under the agent's own name.
 */
export function workflowGraphFor(state: WorkflowMetadataState, workflowType: string): { graph: ModelGraph; graphKind: 'workflow' | 'agent' } | null {
  if (state.status !== 'available') {
    return null;
  }
  const { descriptor } = state.metadata;
  const workflow = descriptor?.workflows?.find((entry) => entry.name === workflowType);
  if (workflow?.graph) {
    return { graph: workflow.graph, graphKind: 'workflow' };
  }
  const agent = descriptor?.agents?.find((entry) => entry.name === workflowType);
  if (agent?.graph) {
    return { graph: agent.graph, graphKind: 'agent' };
  }
  return null;
}

export function descriptorChecksum(state: WorkflowMetadataState): string | null {
  return state.status === 'available' ? (state.metadata.descriptor?.checksum ?? null) : null;
}
