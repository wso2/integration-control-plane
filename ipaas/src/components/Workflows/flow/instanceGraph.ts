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

import type { ActivityTreeNode, WorkflowStatus } from '../api/types';
import type { InstanceGraph, ModelGraph, ModelGraphEdge, ModelGraphNode, StepExecution, UnmatchedNode } from '../model/workflowFlow';

/**
 * Folds a workflow's published structure together with one run's history, producing the
 * `InstanceGraph` the flow rail draws.
 *
 * The console talks straight to the integration's management API, with no server in between to
 * compose the graph, so the composition happens here, in the browser, over the descriptor fetched
 * from the engine.
 *
 * Three behaviours are forced by what the Management API actually returns:
 *
 *  1. `ActivityTreeNode` carries no `childWorkflowId`, so a folded review has no `taskId`. A review
 *     names the step it gates through its own `stepId`; with no model, a
 *     review whose step has not run (an approval gate still waiting) keeps a step of its own, so the
 *     wait shows on the chain rather than only as an unplaced note.
 *  2. With no model at all there is nothing to place an unstamped step against, so instead of being
 *     dropped it gets a synthetic `@node:<id>` step, so a run still shows every execution it made,
 *     and those steps, in the order they first ran, become the graph (`chainFromExecutions`).
 *     A published model, even one with no nodes, is an answer about this workflow, so against one
 *     the normal placement rules apply (`placeExecution`).
 *  3. The model is indexed once into a `Map`, so each placement is a lookup rather than a scan.
 */

/**
 * Execution node types that carry no step id of their own and are placed by order against the
 * model, mapped to the model `kind` each corresponds to.
 */
const INTERPOLATED_KINDS: Record<string, string> = {
  DATA: 'EVENT_WAIT',
  TIMER: 'SLEEP',
  CHILD_WORKFLOW: 'CHILD_WORKFLOW',
};

const REVIEW_ACTIVITY_TYPE = 'REVIEW_ACTIVITY';

/**
 * `workflow:getResult` *is* a step (the author wrote a durable wait, and the runtime routes it
 * through an implicit activity), so it matches the model's `AWAIT_RESULT` node by name, since its
 * node type is a plain ACTIVITY. The rest are reads and the agent loop's own polling: machinery
 * that was never in the graph.
 */
const AWAIT_RESULT_ACTIVITY = 'workflow:getResult';
const NON_STEP_ACTIVITIES = ['workflow:getInfo', 'workflow:pendingAgentDataEvents', 'workflow:run', 'workflow:sendData'];

/** Steps synthesised for executions the model could not place carry this prefix. */
export const SYNTHETIC_STEP_PREFIX = '@node:';

export interface ComposeInstanceGraphInput {
  workflowType: string;
  status: WorkflowStatus;
  nodes: ActivityTreeNode[];
  /** The descriptor's graph for this workflow type, or null when the engine does not serve it. */
  model: ModelGraph | null;
  descriptorChecksum?: string | null;
  graphKind?: 'workflow' | 'agent';
}

interface ModelIndex {
  byStepId: Map<string, { node: ModelGraphNode; index: number }>;
  nodes: ModelGraphNode[];
}

function indexModel(model: ModelGraph | null): ModelIndex {
  const nodes = model?.nodes ?? [];
  const byStepId = new Map<string, { node: ModelGraphNode; index: number }>();
  nodes.forEach((node, index) => {
    if (!byStepId.has(node.stepId)) {
      byStepId.set(node.stepId, { node, index });
    }
  });
  return { byStepId, nodes };
}

/**
 * The first model step at or after `cursor` whose kind matches an unstamped execution. Sound
 * because a workflow body is single-threaded, so history is a linear walk of the model and order
 * is evidence.
 */
function interpolateStep(nodeType: string, nodeName: string, model: ModelIndex, cursor: number): string | undefined {
  const wantedKind = nodeName === AWAIT_RESULT_ACTIVITY ? 'AWAIT_RESULT' : INTERPOLATED_KINDS[nodeType];
  if (!wantedKind) {
    return undefined;
  }
  for (let index = cursor; index < model.nodes.length; index += 1) {
    if (model.nodes[index].kind === wantedKind) {
      return model.nodes[index].stepId;
    }
  }
  return undefined;
}

/**
 * Accumulates one execution onto its step. The count is what a loop's badge shows; the status is
 * the latest, so a step that failed and then succeeded on retry reads as succeeded; the first
 * failure seen is kept, which is what distinguishes "recovered" from "succeeded first time".
 */
function recordExecution(steps: Map<string, StepExecution>, stepId: string, node: ActivityTreeNode): void {
  const existing = steps.get(stepId);
  if (!existing) {
    steps.set(stepId, {
      count: 1,
      eventIds: [node.id],
      type: node.type,
      label: node.name,
      status: node.status,
      attempt: node.attempt,
      startTime: node.startTime ?? undefined,
      endTime: node.endTime ?? undefined,
      failure: node.failure?.message,
    });
    return;
  }
  steps.set(stepId, {
    ...existing,
    count: existing.count + 1,
    eventIds: [...existing.eventIds, node.id],
    status: node.status,
    attempt: node.attempt,
    endTime: node.endTime ?? existing.endTime,
    failure: existing.failure ?? node.failure?.message,
  });
}

/**
 * Records that the arm holding this step was taken, walking up the model's nesting so an inner
 * step marks every container above it. No history event records a branch condition, so "something
 * inside it ran" is the only evidence an arm was taken.
 */
function recordTakenArm(takenArms: Map<string, string[]>, model: ModelIndex, stepId: string): void {
  let current: string | undefined = stepId;
  let guard = 0;
  while (current && guard < 32) {
    guard += 1;
    const entry = model.byStepId.get(current);
    if (!entry) {
      return;
    }
    const { parent, branch } = entry.node;
    if (!parent || !branch) {
      return;
    }
    const arms = takenArms.get(parent) ?? [];
    if (!arms.includes(branch)) {
      arms.push(branch);
    }
    takenArms.set(parent, arms);
    current = parent;
  }
}

/**
 * The run's executed steps, in the order each first ran, as a graph the rail can draw.
 *
 * No descriptor means no structure, only what ran. Laying the steps out in order gives
 * the rail and the diagram a chain, each node clickable like any other, without inventing a
 * branch the history cannot show. Each node's kind is its execution type, which the rail's icons
 * already read.
 */
function chainFromExecutions(steps: Map<string, StepExecution>): ModelGraph {
  const nodes: ModelGraphNode[] = [...steps.entries()].map(([stepId, execution]) => ({
    stepId,
    kind: execution.type ?? 'ACTIVITY',
    target: execution.label ?? stepId,
  }));
  const edges: ModelGraphEdge[] = nodes.slice(1).map((node, i) => ({ from: nodes[i].stepId, to: node.stepId }));
  return { nodes, edges };
}

/**
 * Why one execution has no step on the model to belong to. `stamped` marks an execution that named
 * its call site when the model simply has no such step: version skew, not a runtime too old to name
 * its steps. The two leave `steps` equally empty and must not read the same, so `stepIdsAvailable`
 * separates them by it.
 */
interface Unplaceable {
  reason: string;
  stamped?: boolean;
}

/**
 * Which model step one execution belongs to, or why none does. Every placement rule lives here, so a new outcome is a case in one decision rather than a flag
 * threaded through the loop.
 */
function placeExecution(node: ActivityTreeNode, model: ModelGraph | null, index: ModelIndex, cursor: number, graphKind: 'workflow' | 'agent'): string | Unplaceable {
  if (node.stepId) {
    // A model was published and does not have this step: the run and the model are different
    // versions of the workflow. Recording it anyway would file it under an id no node carries, so
    // the step would draw as never executed while the history shows it ran, and nothing would say
    // why. "Published" is the question, not "has nodes": a model with no nodes is still an answer.
    if (model && !index.byStepId.has(node.stepId)) {
      return { reason: 'no step with this id in the model; the run and the model are different versions', stamped: true };
    }
    return node.stepId;
  }
  if (!model) {
    // No model to place it against. Upstream drops the node; here it gets a step of its own so
    // the run still accounts for every execution it made.
    return `${SYNTHETIC_STEP_PREFIX}${node.id}`;
  }
  if (graphKind === 'agent') {
    // The model chose this call, so there is no lexical order to interpolate against.
    return { reason: 'no step id, and an agent has no order to place it by' };
  }
  // Unstamped: placed by order against the model, which is sound because a workflow body is
  // single-threaded, so history is a linear walk.
  return interpolateStep(node.type, node.name, index, cursor) ?? { reason: 'no step id, and no matching step in the model' };
}

function unmatchedEntry(node: ActivityTreeNode, reason: string): UnmatchedNode {
  return {
    label: node.name,
    type: node.type,
    status: node.status,
    stepId: node.stepId,
    reason,
  };
}

export function composeInstanceGraph({ workflowType, status, nodes, model, descriptorChecksum = null, graphKind = 'workflow' }: ComposeInstanceGraphInput): InstanceGraph {
  const index = indexModel(model);
  const steps = new Map<string, StepExecution>();
  const takenArms = new Map<string, string[]>();
  const unmatched: UnmatchedNode[] = [];
  // Reviews by the step each gates, folded on once every step has been placed.
  const reviews = new Map<string, ActivityTreeNode[]>();

  // Where interpolation has reached in the model, so an unstamped execution lands on the first
  // matching step at or after the last anchored one.
  let cursor = 0;
  let executedCount = 0;
  // A step that named itself but found no node under that name in a published model. It reads the
  // same as a runtime too old to name its steps in `steps` (empty), and must not to a reader.
  let stampedUnplaced = false;

  nodes.forEach((node) => {
    if (NON_STEP_ACTIVITIES.includes(node.name)) {
      // Machinery, not a step the author wrote.
      return;
    }
    executedCount += 1;

    if (node.type === REVIEW_ACTIVITY_TYPE) {
      // A review is not a step: it attaches to the step it gates, named by its own step id, once
      // every step has been placed; a gate runs before the step it gates.
      if (node.stepId) {
        reviews.set(node.stepId, [...(reviews.get(node.stepId) ?? []), node]);
        return;
      }
      if (model) {
        unmatched.push(unmatchedEntry(node, 'a review task with no step id'));
        return;
      }
      // A runtime too old to name the gated step, and no model: the review keeps its own step.
      recordExecution(steps, `${SYNTHETIC_STEP_PREFIX}${node.id}`, node);
      return;
    }

    const placed = placeExecution(node, model, index, cursor, graphKind);
    if (typeof placed !== 'string') {
      unmatched.push(unmatchedEntry(node, placed.reason));
      stampedUnplaced = stampedUnplaced || placed.stamped === true;
      return;
    }

    const modelEntry = index.byStepId.get(placed);
    // A step that named itself is direct evidence of where execution is, so it may move the cursor
    // back: a loop's next iteration must interpolate its unstamped waits from the loop's top.
    if (modelEntry && (node.stepId || modelEntry.index >= cursor)) {
      cursor = modelEntry.index + 1;
    }
    recordExecution(steps, placed, node);
    recordTakenArm(takenArms, index, placed);
  });

  // Fold the reviews onto their steps, so the rail never has to correlate them itself.
  reviews.forEach((entries, stepId) => {
    const target = steps.get(stepId);
    if (target) {
      target.reviews = [
        ...(target.reviews ?? []),
        ...entries.map((review) => ({
          label: review.name,
          status: review.status,
          startTime: review.startTime ?? undefined,
          endTime: review.endTime ?? undefined,
        })),
      ];
      return;
    }
    if (!model) {
      // Its step has not run: an approval gate still waiting. With nothing else to draw it on,
      // it keeps a step of its own, in the order it ran.
      entries.forEach((review) => recordExecution(steps, `${SYNTHETIC_STEP_PREFIX}${review.id}`, review));
      return;
    }
    // The step it gates is not on the graph, so there is nothing to fold it onto. It is reported
    // like any other unplaceable execution, with the step it named, and why.
    entries.forEach((review) => unmatched.push({ ...unmatchedEntry(review, 'the step this review gates is not in the model'), stepId }));
  });

  const historyGraph = !model && steps.size > 0 ? chainFromExecutions(steps) : null;
  let graphSource: InstanceGraph['graphSource'] = null;
  if (model) {
    graphSource = 'descriptor';
  } else if (historyGraph) {
    graphSource = 'history';
  }

  return {
    workflowType,
    status,
    graphKind,
    descriptorChecksum,
    graph: model ?? historyGraph,
    graphSource,
    // False only when steps ran and none could be placed, stamped or interpolated. A step that named
    // itself but found no node under that name counts as stamped: the run is placeable, this model
    // is simply not the one it ran against, which `unmatched` says in its own words.
    stepIdsAvailable: executedCount === 0 || steps.size > 0 || reviews.size > 0 || stampedUnplaced,
    steps: Object.fromEntries(steps),
    takenArms: Object.fromEntries(takenArms),
    unmatched,
  };
}
