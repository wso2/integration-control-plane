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

import { describe, expect, it } from 'vitest';
import type { ModelGraph, StepReview } from '../../api/workflows';
import { layoutFloorPlan, sequenceNodes, SIDE_GAP, SIDE_R, sideNodesOf, STEP_W } from './floorPlan';
import { gateTooltip, reviewsByTrigger, reviewToOpen, stepText } from './helpers';

// A gated activity inside a do block, its review, and the step after it — the shape the compiler emits.
const GRAPH: ModelGraph = {
  nodes: [
    { stepId: 'do#1', kind: 'TRY' },
    { stepId: 'chargeCard#1', kind: 'ACTIVITY', target: 'chargeCard', parent: 'do#1', branch: 'do' },
    { stepId: 'chargeCard#1#review', kind: 'REVIEW', target: 'chargeCard', parent: 'do#1', branch: 'do' },
    { stepId: 'shipOrder#1', kind: 'ACTIVITY', target: 'shipOrder', parent: 'do#1', branch: 'do' },
  ],
  edges: [
    { from: 'do#1', to: 'chargeCard#1', when: 'do' },
    { from: 'chargeCard#1', to: 'shipOrder#1' },
    { from: 'chargeCard#1', to: 'chargeCard#1#review', when: 'on failure' },
  ],
};

// One call with both an approval policy and a review on failure.
const GATED_TWICE: ModelGraph = {
  nodes: [
    { stepId: 'refund#1', kind: 'ACTIVITY', target: 'refund' },
    { stepId: 'refund#1#approval', kind: 'APPROVAL', target: 'refund' },
    { stepId: 'refund#1#review', kind: 'REVIEW', target: 'refund' },
  ],
  edges: [
    { from: 'refund#1', to: 'refund#1#approval', when: 'before run' },
    { from: 'refund#1', to: 'refund#1#review', when: 'on failure' },
  ],
};

describe('sequenceNodes', () => {
  it('leaves a review out of the sequence, so its activity is not drawn twice', () => {
    expect(sequenceNodes(GRAPH).map((n) => n.stepId)).toEqual(['do#1', 'chargeCard#1', 'shipOrder#1']);
  });

  it('leaves out an approval and a review on the same step, whatever their kind', () => {
    expect(sequenceNodes(GATED_TWICE).map((n) => n.stepId)).toEqual(['refund#1']);
  });
});

describe('sideNodesOf', () => {
  it('never takes a step the sequence reaches for a gate, whichever way a side edge points', () => {
    const graph: ModelGraph = {
      nodes: [
        { stepId: 'quote#1', kind: 'ACTIVITY', target: 'quote' },
        { stepId: 'refund#1', kind: 'ACTIVITY', target: 'refund' },
      ],
      edges: [
        { from: 'quote#1', to: 'refund#1' },
        { from: 'quote#1', to: 'refund#1', when: 'before run' },
      ],
    };
    expect(sideNodesOf(graph).size).toBe(0);
    expect(sequenceNodes(graph).map((n) => n.stepId)).toEqual(['quote#1', 'refund#1']);
  });

  it('files an approval and a review on the same step under their own sides', () => {
    const gates = sideNodesOf(GATED_TWICE).get('refund#1');
    expect(gates?.approval?.stepId).toBe('refund#1#approval');
    expect(gates?.review?.stepId).toBe('refund#1#review');
  });
});

describe('layoutFloorPlan', () => {
  it('places only the activities in the do arm, one box each', () => {
    const plan = layoutFloorPlan(GRAPH);
    expect(plan.nodes).toHaveLength(1);
    expect(plan.nodes[0].arms[0].children.map((c) => c.node.stepId)).toEqual(['chargeCard#1', 'shipOrder#1']);
  });
});

describe('side nodes', () => {
  it('keeps a review beside its activity, with room for it on both sides so the flow stays centred', () => {
    const arm = layoutFloorPlan(GRAPH).nodes[0].arms[0];
    const [gated, plain] = arm.children;
    expect(gated.sides?.review?.stepId).toBe('chargeCard#1#review');
    expect(plain.sides).toBeUndefined();
    expect(gated.w).toBe(STEP_W + (SIDE_GAP + SIDE_R * 2) * 2);
    expect(gated.x + gated.w / 2).toBe(plain.x + plain.w / 2);
  });
});

describe('stepText', () => {
  it('shows the display name over the called function', () => {
    expect(stepText({ stepId: 'chargeCard#1', kind: 'ACTIVITY', target: 'chargeCard', label: 'Charge card' })).toBe('Charge card');
    expect(stepText({ stepId: 'chargeCard#1', kind: 'ACTIVITY', target: 'chargeCard' })).toBe('chargeCard');
  });

  it('reads a step that calls nothing as what it does, not its id', () => {
    expect(stepText({ stepId: 'sleep#1', kind: 'SLEEP' })).toBe('sleep');
    expect(stepText({ stepId: 'wait#1', kind: 'EVENT_WAIT', target: 'approved|rejected' })).toBe('wait approved | rejected');
    expect(stepText({ stepId: 'awaitResult#1', kind: 'AWAIT_RESULT' })).toBe('await result');
  });
});

describe('reviewToOpen', () => {
  const decided: StepReview = { taskId: 'review-1', status: 'COMPLETED' };
  const pending: StepReview = { taskId: 'review-2', status: 'RUNNING' };

  it('opens the pending review, since that is what someone has to act on', () => {
    expect(reviewToOpen([decided, pending, { taskId: 'review-3', status: 'COMPLETED' }])).toBe(pending);
  });

  it('opens the latest review when every one is decided', () => {
    const latest: StepReview = { taskId: 'review-3', status: 'COMPLETED' };
    expect(reviewToOpen([decided, latest])).toBe(latest);
  });

  it('opens nothing when no review carries a task id', () => {
    expect(reviewToOpen([{ status: 'RUNNING' }])).toBeUndefined();
  });
});

describe('reviewsByTrigger', () => {
  it('splits approvals from failure reviews, and reads a review with no trigger as a failure review', () => {
    const approval: StepReview = { taskId: 'a', trigger: 'PRE_RUN' };
    const failure: StepReview = { taskId: 'b', trigger: 'ON_FAILURE' };
    const legacy: StepReview = { taskId: 'c' };
    expect(reviewsByTrigger([approval, failure, legacy])).toEqual({ approvals: [approval], failures: [failure, legacy] });
  });
});

describe('gateTooltip', () => {
  it('tells a review that ended without a decision apart from a decided one', () => {
    expect(
      gateTooltip(
        'review',
        [
          { taskId: 'r1', status: 'COMPLETED' },
          { taskId: 'r2', status: 'FAILED' },
        ],
        true,
      ),
    ).toBe('Review — raised 2 times: 1 decided, 1 ended without a decision. Click to open.');
  });

  it('does not count a review with no status as decided', () => {
    expect(gateTooltip('review', [{ taskId: 'r1', status: 'COMPLETED' }, { taskId: 'r2' }], true)).toBe('Review — raised 2 times: 1 decided, 1 with no reported status. Click to open.');
  });

  it('offers a click only when the gate can open the review', () => {
    expect(gateTooltip('review', [{ taskId: 'r1', status: 'COMPLETED' }], false)).toBe('Review — raised once: 1 decided');
  });

  it('leads with what is still waiting', () => {
    expect(gateTooltip('approval', [{ taskId: 'a1', status: 'RUNNING' }], true)).toBe('Approval — raised once: 1 waiting for a decision. Click to open.');
  });
});
