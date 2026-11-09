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
import { composeInstanceGraph } from '../flow/instanceGraph';
import type { ModelGraph } from '../model/workflowFlow';
import { descriptorChecksum, workflowGraphFor, type WorkflowMetadataState } from './workflowMetadataApi';

// Trimmed from the workflow module's own fixture
// (compiler-plugin-tests/src/test/resources/descriptors/descriptor_generation.json): what
// `GET /metadata` carries under `descriptor`.
const EXPENSE_GRAPH: ModelGraph = {
  nodes: [
    { stepId: 'managerApproval#1', kind: 'HUMAN_TASK', target: 'managerApproval' },
    { stepId: 'if#1', kind: 'BRANCH', label: 'decision.approved' },
    { stepId: 'postToLedger#1', kind: 'ACTIVITY', target: 'postToLedger', parent: 'if#1', branch: 'then' },
  ],
  edges: [
    { from: 'managerApproval#1', to: 'if#1' },
    { from: 'if#1', to: 'postToLedger#1', when: 'then' },
  ],
};
const AGENT_GRAPH: ModelGraph = { nodes: [{ stepId: 'model', kind: 'MODEL' }], edges: [] };

const available: WorkflowMetadataState = {
  status: 'available',
  metadata: {
    descriptor: {
      checksum: 'sha256:b630d2808d271',
      workflows: [{ name: 'expenseApproval', graph: EXPENSE_GRAPH }],
      agents: [{ name: 'supportAgent', graph: AGENT_GRAPH }],
    },
  },
};

describe('workflowGraphFor', () => {
  it('finds a workflow by the name it registers under', () => {
    expect(workflowGraphFor(available, 'expenseApproval')).toEqual({ graph: EXPENSE_GRAPH, graphKind: 'workflow' });
  });

  it('finds an agent among the agents, as an agent', () => {
    expect(workflowGraphFor(available, 'supportAgent')).toEqual({ graph: AGENT_GRAPH, graphKind: 'agent' });
  });

  it('has nothing for a type the descriptor does not describe, or no descriptor', () => {
    expect(workflowGraphFor(available, 'otherWorkflow')).toBeNull();
    expect(workflowGraphFor({ status: 'unsupported' }, 'expenseApproval')).toBeNull();
  });

  it('lets a run show the steps it has not reached yet', () => {
    const published = workflowGraphFor(available, 'expenseApproval');
    const graph = composeInstanceGraph({
      workflowType: 'expenseApproval',
      status: 'RUNNING',
      nodes: [
        {
          id: '5',
          name: 'managerApproval',
          type: 'HUMAN_TASK',
          status: 'RUNNING',
          startTime: '2026-10-02T10:00:00Z',
          endTime: null,
          input: null,
          output: null,
          failure: null,
          attempt: 1,
          stepId: 'managerApproval#1',
          children: null,
        },
      ],
      model: published?.graph ?? null,
      graphKind: published?.graphKind,
    });
    expect(graph.graphSource).toBe('descriptor');
    // Every step of the workflow is drawn; only the one that ran carries an execution.
    expect(graph.graph?.nodes.map((n) => n.stepId)).toEqual(['managerApproval#1', 'if#1', 'postToLedger#1']);
    expect(Object.keys(graph.steps)).toEqual(['managerApproval#1']);
  });
});

describe('descriptorChecksum', () => {
  it('is the descriptor’s checksum, and null without one', () => {
    expect(descriptorChecksum(available)).toBe('sha256:b630d2808d271');
    expect(descriptorChecksum({ status: 'loading' })).toBeNull();
  });
});
