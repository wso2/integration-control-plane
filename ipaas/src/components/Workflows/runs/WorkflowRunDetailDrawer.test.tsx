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

import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkflowClient } from '../api/client';
import { WorkflowApiError } from '../api/http';
import { clearSettling, isSettling } from '../api/settleRegistry';
import type { ActivityTreeNode, WorkflowInstanceSummary } from '../api/types';
import type { ReadyWorkflowApi } from '../api/useWorkflowApi';
import { formatDateTime } from '../../../utils/time';
import WorkflowRunDetailDrawer from './WorkflowRunDetailDrawer';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Whether calls carry roles, read as the drawer renders: most tests are of a run's full details,
// which the engine serves only to a caller with roles.
const roles = vi.hoisted(() => ({ carried: true }));
vi.mock('../connection/workflowCredential', async (importOriginal) => {
  const original = await importOriginal<typeof import('../connection/workflowCredential')>();
  return {
    ...original,
    get CALLS_CARRY_ROLES() {
      return roles.carried;
    },
  };
});

const RUN: WorkflowInstanceSummary = {
  workflowId: 'order-42',
  runId: 'run-7',
  workflowType: 'orderWorkflow',
  status: 'RUNNING',
  startTime: '2026-10-01T10:00:00Z',
  closeTime: null,
  kind: 'WORKFLOW',
  taskQueue: 'orders',
  input: null,
};

const STEP: ActivityTreeNode = {
  id: '5',
  name: 'reserveStock',
  type: 'ACTIVITY',
  status: 'COMPLETED',
  startTime: '2026-10-01T10:00:01Z',
  endTime: '2026-10-01T10:00:02Z',
  input: null,
  output: null,
  failure: null,
  attempt: 1,
  stepId: 'reserveStock#1',
  children: null,
};

function fakeApi() {
  const action = vi.fn().mockResolvedValue({ success: true });
  const client = {
    // A runtime that predates the descriptor route: the flow is drawn from the steps that ran.
    metadata: { get: vi.fn().mockRejectedValue(new WorkflowApiError('NOT_FOUND', 404, null, 'GET /metadata')) },
    instances: {
      get: vi.fn().mockResolvedValue({ workflowId: RUN.workflowId, workflowType: RUN.workflowType, status: 'RUNNING', kind: 'WORKFLOW', result: null, errorMessage: null, activityInvocations: [] }),
      history: vi.fn().mockResolvedValue([]),
      activityTree: vi.fn().mockResolvedValue([STEP]),
      resetPoints: vi.fn().mockResolvedValue([]),
      action,
    },
  } as unknown as WorkflowClient;
  const api = { client, connection: { status: 'ready', scopeId: 'scope', runtime: { taskQueue: 'orders' } } } as unknown as ReadyWorkflowApi;
  return { api, action };
}

let root: Root;
let container: HTMLDivElement;

async function flush() {
  for (let i = 0; i < 4; i += 1) {
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
  }
}

async function renderDrawer(api: ReadyWorkflowApi, run: WorkflowInstanceSummary = RUN, comingSoonAction?: ReactNode) {
  await act(async () =>
    root.render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <WorkflowRunDetailDrawer run={run} api={api} onClose={vi.fn()} comingSoonAction={comingSoonAction} />
      </QueryClientProvider>,
    ),
  );
  await flush();
}

/** The drawer and its dialogs render in portals, so everything is looked up in the document. */
const text = () => document.body.textContent ?? '';
const buttonLabels = () => [...document.querySelectorAll('button')].map((b) => b.textContent);
const click = async (label: string) => {
  const button = [...document.querySelectorAll('button')].find((b) => b.textContent === label);
  if (!button) throw new Error(`no ${label} button`);
  await act(async () => button.click());
  await flush();
};

beforeEach(() => {
  roles.carried = true;
  localStorage.clear();
  clearSettling();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('WorkflowRunDetailDrawer', () => {
  it('shows the run, and offers the actions a running workflow takes', async () => {
    const { api } = fakeApi();
    await renderDrawer(api);
    expect(text()).toContain('Execution Details');
    expect(text()).toContain('order-42');
    expect(buttonLabels()).toEqual(expect.arrayContaining(['Suspend', 'Cancel', 'Terminate', 'Reset…']));
    // Wake ends an agent's sleep; a workflow is not offered it.
    expect(buttonLabels()).not.toContain('Wake');
  });

  it('offers Wake for an agent run', async () => {
    const { api } = fakeApi();
    await renderDrawer(api, { ...RUN, kind: 'AGENT' });
    expect(buttonLabels()).toContain('Wake');
  });

  it('suspends at once, and keeps the run polling while the engine catches up', async () => {
    const { api, action } = fakeApi();
    await renderDrawer(api);
    await click('Suspend');
    expect(action).toHaveBeenCalledWith('order-42', 'suspend', { runId: 'run-7', reason: undefined });
    expect(isSettling('order-42')).toBe(true);
    expect(text()).toContain('Workflow suspend requested.');
  });

  it('asks before cancelling, and cancels only once confirmed', async () => {
    const { api, action } = fakeApi();
    await renderDrawer(api);
    await click('Cancel');
    expect(text()).toContain('The run is asked to stop, and the request cannot be undone.');
    expect(action).not.toHaveBeenCalled();

    await click('Keep Running');
    expect(action).not.toHaveBeenCalled();

    await click('Cancel');
    await click('Cancel Workflow');
    expect(action).toHaveBeenCalledWith('order-42', 'cancel', { runId: 'run-7', reason: undefined });
  });

  it('terminates with the reason given', async () => {
    const { api, action } = fakeApi();
    await renderDrawer(api);
    await click('Terminate');
    const reason = [...document.querySelectorAll<HTMLInputElement>('input')].find((input) => input.type === 'text');
    if (!reason) throw new Error('expected the reason field');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(reason, ' stuck on a lock ');
      reason.dispatchEvent(new Event('input', { bubbles: true }));
    });
    // The confirmation's own Terminate, which opens after the drawer's.
    const confirm = [...document.querySelectorAll('button')].filter((b) => b.textContent === 'Terminate').at(-1);
    await act(async () => confirm?.click());
    await flush();
    expect(action).toHaveBeenCalledWith('order-42', 'terminate', { runId: 'run-7', reason: 'stuck on a lock' });
  });

  it('draws the executed steps when the runtime serves no descriptor', async () => {
    const { api } = fakeApi();
    await renderDrawer(api);
    expect(text()).toContain('Drawn from the steps this run executed, in order.');
    expect(document.querySelector('svg[aria-label="Workflow activity diagram"]')?.textContent).toContain('reserveStock');
  });

  it('takes the close time of a run that closed after its row was read from its history', async () => {
    const { api } = fakeApi();
    const { instances } = api.client as unknown as { instances: Record<string, ReturnType<typeof vi.fn>> };
    instances.get.mockResolvedValue({ workflowId: RUN.workflowId, workflowType: RUN.workflowType, status: 'COMPLETED', kind: 'WORKFLOW', result: null, errorMessage: null, activityInvocations: [] });
    instances.history.mockResolvedValue([
      { eventId: 1, eventType: 'WORKFLOW_EXECUTION_STARTED', timestamp: '2026-10-01T10:00:00Z', attributes: { workflowType: { name: 'orderWorkflow' } } },
      { eventId: 2, eventType: 'WORKFLOW_EXECUTION_COMPLETED', timestamp: '2026-10-01T10:00:05Z', attributes: {} },
    ]);
    // The row still says running, with no close time.
    await renderDrawer(api, RUN);
    expect(text()).not.toContain('Still running');
    expect(text()).toContain(formatDateTime('2026-10-01T10:00:05Z'));
    expect(text()).toContain('5.0s');
  });

  it('says when the run’s history or steps cannot be read, and reads them again on Retry', async () => {
    const { api } = fakeApi();
    const { instances } = api.client as unknown as { instances: Record<string, ReturnType<typeof vi.fn>> };
    instances.history.mockRejectedValue(new WorkflowApiError('NOT_FOUND', 404, null, 'GET /history'));
    instances.activityTree.mockRejectedValue(new WorkflowApiError('NOT_FOUND', 404, null, 'GET /tree'));
    await renderDrawer(api);
    expect(text()).toContain('Could not load this run’s history.');
    expect(text()).toContain('Could not load this run’s steps.');
    expect(text()).not.toContain('No timeline data available.');

    const retries = [...document.querySelectorAll('button')].filter((b) => b.textContent === 'Retry');
    expect(retries).toHaveLength(2);
    const historyCalls = instances.history.mock.calls.length;
    const treeCalls = instances.activityTree.mock.calls.length;
    await act(async () => retries.forEach((button) => button.click()));
    await flush();
    expect(instances.history.mock.calls.length).toBeGreaterThan(historyCalls);
    expect(instances.activityTree.mock.calls.length).toBeGreaterThan(treeCalls);
  });
});

// The test key names no caller, so the engine refuses a run's own reads: the drawer sends none of
// them, says the flow is coming soon, and offers nothing that needs one.
describe('WorkflowRunDetailDrawer without caller roles', () => {
  it('shows the run from its row, marks the flow coming soon, and reads none of its details', async () => {
    roles.carried = false;
    const { api } = fakeApi();
    const instances = (api.client as unknown as { instances: Record<string, ReturnType<typeof vi.fn>> }).instances;
    await renderDrawer(api);
    expect(text()).toContain('order-42');
    expect(text()).toContain('Coming soon');
    // With no way to the User Portal offered, it isn't pointed to.
    expect(text()).toContain('The execution graph, activity tree and timeline are coming to the console.');
    expect(text()).not.toContain('User Portal');
    expect(instances.get).not.toHaveBeenCalled();
    expect(instances.history).not.toHaveBeenCalled();
    expect(instances.activityTree).not.toHaveBeenCalled();
  });

  it('offers the way to the views it lacks under the coming-soon flow', async () => {
    roles.carried = false;
    const { api } = fakeApi();
    await renderDrawer(api, RUN, <button>Publish to User Portal</button>);
    expect(buttonLabels()).toContain('Publish to User Portal');
    expect(text()).toContain('Until then, publish this workflow to the User Portal to see them there.');
  });

  it('does not say a completed run returned nothing, since its result is not read', async () => {
    roles.carried = false;
    const { api } = fakeApi();
    await renderDrawer(api, { ...RUN, status: 'COMPLETED', closeTime: '2026-10-01T10:00:05Z' });
    expect(text()).toContain('order-42');
    expect(text()).not.toContain('Completed with no return value.');
  });

  it('offers the lifecycle actions, but not Reset or the raw history', async () => {
    roles.carried = false;
    const { api } = fakeApi();
    await renderDrawer(api);
    expect(buttonLabels()).toEqual(expect.arrayContaining(['Suspend', 'Cancel', 'Terminate']));
    expect(buttonLabels()).not.toContain('Reset…');
    expect(document.querySelector('[aria-label="Show the raw event history"]')).toBeNull();
  });
});
