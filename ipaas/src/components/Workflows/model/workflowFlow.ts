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
 * Types for the execution-flow view, shaped like the backend's workflow
 * APIs so the rail keeps its contracts.
 *
 * `InstanceGraph` is produced by `flow/instanceGraph.ts` from a run's activity tree, and
 * `TimelineSpan`s by `model/workflowHistory.ts` from its history. The `ModelGraph` is a workflow's
 * compiled shape: the descriptor's when the engine serves one, otherwise the run's own executed
 * steps in order (see `InstanceGraph.graphSource`).
 */

// ModelGraph: the workflow's compiled shape (api/workflows.ts:142-173)

export interface ModelGraphNode {
  /** Identity of this call site within its workflow, e.g. `reserveStock#2`, `if#1`. */
  stepId: string;
  /** ACTIVITY | HUMAN_TASK | CHILD_WORKFLOW | BRANCH | LOOP | TRY | CODE | EXIT. */
  kind: string;
  /** What the node names: the activity or task. Absent for control flow. */
  target?: string;
  /** Display text: a branch condition. Never part of the identity. */
  label?: string;
  /** Step id of the enclosing control-flow node. Absent at the top level. */
  parent?: string;
  /** Which arm of `parent` this node sits in: `then`, `else`, `body`, `do`, `onFail`. */
  branch?: string;
}

export interface ModelGraphEdge {
  from: string;
  to: string;
  /** Why this edge is taken: an arm name, or the loop's `repeat` back edge. */
  when?: string;
}

export interface ModelGraph {
  file?: string;
  nodes: ModelGraphNode[];
  edges: ModelGraphEdge[];
}

// InstanceGraph: the per-run data (api/workflows.ts:176-231)

export interface StepReview {
  taskId?: string;
  label?: string;
  status?: string;
  startTime?: string;
  endTime?: string;
}

export interface StepExecution {
  /** Executions of this one call site: >1 means the step was retried past a failure. */
  count: number;
  /** History event id per execution, in order. */
  eventIds: string[];
  type?: string;
  label?: string;
  status?: string;
  attempt?: number;
  startTime?: string;
  endTime?: string;
  failure?: string;
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
  graphKind: 'workflow' | 'agent';
  descriptorChecksum: string | null;
  graph: ModelGraph | null;
  /**
   * Where `graph` came from. `history` is drawn from the steps this run executed, in order, because
   * no descriptor describes the workflow: it shows what ran, never a branch that was not taken.
   */
  graphSource: 'descriptor' | 'history' | null;
  stepIdsAvailable: boolean;
  /**
   * Keyed by step id. A step with no entry here never ran: this (not `takenArms`) is how a taken
   * vs. not-taken branch is actually distinguished.
   */
  steps: Record<string, StepExecution>;
  takenArms: Record<string, string[]>;
  unmatched: UnmatchedNode[];
}

// TimelineSpan: one Gantt lane (helpers.ts's TimelineSpan)

export type SpanCategory = 'WORKFLOW' | 'ACTIVITY' | 'HUMAN_TASK' | 'TIMER' | 'CHILD_WORKFLOW' | 'SIGNAL';

export interface TimelineSpan {
  key: string;
  /** Id of the event that opened the span: the join key to a step's `eventIds`. */
  eventId?: string;
  label: string;
  category: SpanCategory;
  /** Upper-case status (COMPLETED, FAILED, RUNNING, ...); empty for a signal. */
  status: string;
  /** Epoch milliseconds. */
  start: number;
  end: number;
  /** No close event yet: the bar runs to the live clock. */
  running: boolean;
}
