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
import type { ActivityTreeNode } from '../api/types';
import type { ModelGraph } from '../model/workflowFlow';
import { flowUnavailable } from './flowAvailability';
import { composeInstanceGraph, SYNTHETIC_STEP_PREFIX } from './instanceGraph';

function node(patch: Partial<ActivityTreeNode>): ActivityTreeNode {
  return {
    id: '1',
    name: 'step',
    type: 'ACTIVITY',
    status: 'COMPLETED',
    startTime: '2026-09-28T10:00:00Z',
    endTime: '2026-09-28T10:00:01Z',
    input: null,
    output: null,
    failure: null,
    attempt: 1,
    stepId: null,
    reviewStepId: null,
    children: null,
    ...patch,
  };
}

const NODES = [
  node({ id: '5', name: 'reserveStock', stepId: 'reserveStock#1' }),
  node({
    id: '9',
    name: 'approve',
    type: 'HUMAN_TASK',
    stepId: 'approve#1',
    status: 'RUNNING',
  }),
  // Unstamped: no step id to place it by.
  node({ id: '13', name: 'notify' }),
  // A retry of the first step.
  node({ id: '15', name: 'reserveStock', stepId: 'reserveStock#1' }),
];

describe('composeInstanceGraph without a descriptor', () => {
  const graph = composeInstanceGraph({
    workflowType: 'orderWorkflow',
    status: 'RUNNING',
    nodes: NODES,
    model: null,
  });

  it('draws the executed steps in the order each first ran', () => {
    expect(graph.graphSource).toBe('history');
    expect(graph.graph?.nodes).toEqual([
      { stepId: 'reserveStock#1', kind: 'ACTIVITY', target: 'reserveStock' },
      { stepId: 'approve#1', kind: 'HUMAN_TASK', target: 'approve' },
      {
        stepId: `${SYNTHETIC_STEP_PREFIX}13`,
        kind: 'ACTIVITY',
        target: 'notify',
      },
    ]);
    expect(graph.graph?.edges).toEqual([
      { from: 'reserveStock#1', to: 'approve#1' },
      { from: 'approve#1', to: `${SYNTHETIC_STEP_PREFIX}13` },
    ]);
  });

  it('counts a repeated step once on the graph, with every execution on the step', () => {
    expect(graph.steps['reserveStock#1']).toMatchObject({
      count: 2,
      eventIds: ['5', '15'],
    });
  });

  it('is drawable', () => {
    expect(flowUnavailable(graph)).toBeNull();
  });

  it('has nothing to draw before any step has run', () => {
    const empty = composeInstanceGraph({
      workflowType: 'orderWorkflow',
      status: 'RUNNING',
      nodes: [],
      model: null,
    });
    expect(empty.graph).toBeNull();
    expect(empty.graphSource).toBeNull();
    expect(flowUnavailable(empty)).toContain('No step');
  });
});

describe('composeInstanceGraph with a descriptor', () => {
  it('keeps the descriptor as the graph', () => {
    const model: ModelGraph = {
      nodes: [
        { stepId: 'reserveStock#1', kind: 'ACTIVITY', target: 'reserveStock' },
        { stepId: 'ship#1', kind: 'ACTIVITY', target: 'ship' },
      ],
      edges: [{ from: 'reserveStock#1', to: 'ship#1' }],
    };
    const graph = composeInstanceGraph({
      workflowType: 'orderWorkflow',
      status: 'COMPLETED',
      nodes: [NODES[0]],
      model,
    });
    expect(graph.graph).toBe(model);
    expect(graph.graphSource).toBe('descriptor');
    expect(Object.keys(graph.steps)).toEqual(['reserveStock#1']);
  });
});

// Ported from ICP's `workflow_instance_graph_tests.bal`: the placement rules against a published
// model, which the composition must get right whatever the engine serves.
describe('composeInstanceGraph placement against a published model', () => {
  const MODEL: ModelGraph = {
    nodes: [
      { stepId: 'reserveInventory#1', kind: 'ACTIVITY', target: 'reserve' },
      { stepId: 'wait#1', kind: 'EVENT_WAIT', target: 'paymentInfo' },
    ],
    edges: [{ from: 'reserveInventory#1', to: 'wait#1' }],
  };
  const compose = (nodes: ActivityTreeNode[], model: ModelGraph = MODEL) =>
    composeInstanceGraph({
      workflowType: 'orderWorkflow',
      status: 'RUNNING',
      nodes,
      model,
    });

  it('places stamped steps by id and an unstamped data event by order', () => {
    const graph = compose([node({ id: '1', name: 'reserve', stepId: 'reserveInventory#1' }), node({ id: '2', name: 'paymentInfo', type: 'DATA' })]);
    expect(Object.keys(graph.steps)).toEqual(['reserveInventory#1', 'wait#1']);
    expect(graph.unmatched).toEqual([]);
    expect(graph.stepIdsAvailable).toBe(true);
  });

  it('places a loop’s later waits on the loop’s own step, not on a later one', () => {
    // while { poll; wait dataEvents.tick } notify; wait dataEvents.done
    const loopModel: ModelGraph = {
      nodes: [
        { stepId: 'poll#1', kind: 'ACTIVITY', target: 'poll' },
        { stepId: 'wait#1', kind: 'EVENT_WAIT', target: 'tick' },
        { stepId: 'notify#1', kind: 'ACTIVITY', target: 'notify' },
        { stepId: 'wait#2', kind: 'EVENT_WAIT', target: 'done' },
      ],
      edges: [],
    };
    const graph = compose([node({ id: '1', name: 'poll', stepId: 'poll#1' }), node({ id: '2', name: 'tick', type: 'DATA' }), node({ id: '3', name: 'poll', stepId: 'poll#1' }), node({ id: '4', name: 'tick', type: 'DATA' })], loopModel);
    expect(Object.keys(graph.steps)).toEqual(['poll#1', 'wait#1']);
    expect(graph.steps['wait#1'].count).toBe(2);
    expect(graph.unmatched).toEqual([]);
  });

  it('reports a step the model does not have, rather than drawing it as never run', () => {
    const graph = compose([node({ id: '1', name: 'reserve', stepId: 'reserveInventory#1' }), node({ id: '2', name: 'sendEmail', stepId: 'sendConfirmationEmail#1' })]);
    expect(Object.keys(graph.steps)).toEqual(['reserveInventory#1']);
    expect(graph.unmatched).toHaveLength(1);
    expect(graph.unmatched[0]).toMatchObject({
      label: 'sendEmail',
      stepId: 'sendConfirmationEmail#1',
      status: 'COMPLETED',
    });
    expect(graph.unmatched[0].reason).toMatch(/different versions/);
  });

  it('keeps a run from another version placeable, though none of it lands', () => {
    const graph = compose([node({ id: '1', name: 'a', stepId: 'gone#1' }), node({ id: '2', name: 'b', stepId: 'alsoGone#1' })]);
    expect(graph.steps).toEqual({});
    expect(graph.unmatched.map((u) => u.label)).toEqual(['a', 'b']);
    // The run named its steps; this model is just not the one it ran against.
    expect(graph.stepIdsAvailable).toBe(true);
  });

  it('says a run that named no steps cannot be placed', () => {
    const graph = compose([node({ id: '1', name: 'reserve' }), node({ id: '2', name: 'sendEmail' })]);
    expect(graph.steps).toEqual({});
    expect(graph.stepIdsAvailable).toBe(false);
  });

  it('treats a published model with no nodes as a model, not as no model', () => {
    const graph = compose([node({ id: '1', name: 'paymentInfo', type: 'DATA' }), node({ id: '2', name: 'reserve', stepId: 'reserveInventory#1' })], { nodes: [], edges: [] });
    expect(graph.steps).toEqual({});
    expect(graph.graphSource).toBe('descriptor');
    expect(graph.unmatched.map((u) => u.label)).toEqual(['paymentInfo', 'reserve']);
    expect(graph.stepIdsAvailable).toBe(true);
  });

  it('reports a review whose step is not on the graph, with the step it named', () => {
    const graph = compose([
      node({
        id: '1',
        name: 'approveCharge',
        type: 'REVIEW_ACTIVITY',
        stepId: 'goneFromTheModel#1',
      }),
    ]);
    expect(graph.unmatched).toHaveLength(1);
    expect(graph.unmatched[0].stepId).toBe('goneFromTheModel#1');
    expect(graph.unmatched[0].reason).toBeTruthy();
  });

  it('folds a review onto the step it gates, whichever ran first', () => {
    const graph = compose([
      node({
        id: '1',
        name: 'approveReserve',
        type: 'REVIEW_ACTIVITY',
        stepId: 'reserveInventory#1',
      }),
      node({ id: '2', name: 'reserve', stepId: 'reserveInventory#1' }),
    ]);
    expect(Object.keys(graph.steps)).toEqual(['reserveInventory#1']);
    // The review is not an execution of the step it gates.
    expect(graph.steps['reserveInventory#1'].count).toBe(1);
    expect(graph.steps['reserveInventory#1'].reviews).toEqual([expect.objectContaining({ label: 'approveReserve' })]);
    expect(graph.unmatched).toEqual([]);
  });
});

describe('composeInstanceGraph reviews without a descriptor', () => {
  it('keeps a waiting approval gate on the chain, as a step of its own', () => {
    const graph = composeInstanceGraph({
      workflowType: 'orderWorkflow',
      status: 'RUNNING',
      nodes: [
        node({ id: '1', name: 'reserve', stepId: 'reserveInventory#1' }),
        node({
          id: '2',
          name: 'approveCharge',
          type: 'REVIEW_ACTIVITY',
          status: 'RUNNING',
          stepId: 'chargeCard#1',
        }),
      ],
      model: null,
    });
    expect(Object.keys(graph.steps)).toEqual(['reserveInventory#1', `${SYNTHETIC_STEP_PREFIX}2`]);
    expect(graph.graph?.nodes.map((n) => n.target)).toEqual(['reserve', 'approveCharge']);
    expect(graph.unmatched).toEqual([]);
  });
});
