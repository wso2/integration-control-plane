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

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentScope } from '../../../nav';
import type { WorkflowClient } from '../api/client';
import { WorkflowApiError } from '../api/http';
import type { WorkflowDefinition } from '../api/types';
import type { WorkflowApi } from '../api/useWorkflowApi';
import type { WorkflowTarget } from '../connection/useWorkflowConnection';
import WorkflowEnvCardContent from './WorkflowEnvCardContent';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SCOPE: ComponentScope = { level: 'components', org: 'acme', project: 'default', component: 'orders' };
const BASE = '/organizations/acme/projects/default/components/orders';

const state = vi.hoisted(() => ({
  api: { client: null, connection: { status: 'loading' } } as unknown as WorkflowApi,
  targets: [] as unknown[],
  navigate: vi.fn(),
  dialog: null as null | { open: boolean; scopeId: string; definitions: unknown[]; initialWorkflowType?: string; onClose: () => void; onViewRun?: (run: { workflowType: string; runId: string }) => void },
}));

vi.mock('../../../nav', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../../nav')>()), useScope: () => SCOPE }));
vi.mock('../../../hooks/useAppNavigate', () => ({ useAppNavigate: () => state.navigate }));
// Where the User Portal is served is read from its own route, which isn't under test here.
vi.mock('../../../hooks/useUserPortal', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../../hooks/useUserPortal')>()), useUserPortalServed: () => true }));
// The card's task figures link to Human Tasks only once calls carry roles, which these tests are of.
vi.mock('../connection/workflowCredential', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../connection/workflowCredential')>()),
  CALLS_CARRY_ROLES: true,
}));
// The dialog is the Workflows page's own; here only how the card opens it and follows its run.
vi.mock('../runs/StartWorkflowDialog', () => ({
  default: (props: NonNullable<typeof state.dialog>) => {
    state.dialog = props;
    return null;
  },
}));
vi.mock('../api/useWorkflowApi', () => ({
  useWorkflowApi: (target: unknown) => {
    state.targets.push(target);
    return state.api;
  },
}));

const TARGET: WorkflowTarget = { componentId: 'orders', environmentId: 'production', trackId: 'track-2', deployment: { releaseId: 'release-1', deploymentStatusV2: 'ACTIVE' }, isDeploymentLoading: false };

const definition = (workflowType: string, extra: Partial<WorkflowDefinition> = {}): WorkflowDefinition => ({ workflowType, kind: 'WORKFLOW', inputSchema: null, isActive: true, workerCount: 2, ...extra });
const emptyPage = { items: [], nextPageToken: null, hasMore: false };

function ready(definitions: () => Promise<WorkflowDefinition[]>) {
  const client = {
    definitions: { list: vi.fn(definitions) },
    instances: { list: vi.fn().mockResolvedValue(emptyPage) },
    reviews: { list: vi.fn().mockResolvedValue(emptyPage) },
    humanTasks: { list: vi.fn().mockResolvedValue(emptyPage) },
  };
  state.api = {
    client: client as unknown as WorkflowClient,
    connection: { status: 'ready', client: client as unknown as WorkflowClient, baseUrl: 'https://gw/workflow', scopeId: 'scope-1', runtime: { taskQueue: 'orders' }, endpointName: 'workflow-ma', renewCredential: vi.fn() },
  } as WorkflowApi;
  return client;
}

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  state.targets = [];
  state.navigate = vi.fn();
  state.dialog = null;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function renderContent() {
  await act(async () =>
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={[`${BASE}?track=track-2`]}>
          <WorkflowEnvCardContent target={TARGET} />
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  );
  await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
}

const hrefOf = (testId: string) => container.querySelector(`[data-testid="${testId}"]`)?.getAttribute('href');
const linkNamed = (name: string) => Array.from(container.querySelectorAll('a')).find((a) => a.textContent === name);
const buttonNamed = (name: string) => Array.from(container.querySelectorAll('button')).find((b) => b.textContent === name);

describe('WorkflowEnvCardContent', () => {
  it('connects once, to the card’s own environment and track', async () => {
    state.api = { client: null, connection: { status: 'loading' } } as unknown as WorkflowApi;
    await renderContent();
    expect(state.targets.every((target) => target === TARGET)).toBe(true);
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it('adds nothing while the environment has no active deployment', async () => {
    state.api = { client: null, connection: { status: 'not-deployed', deploymentStatus: 'SUSPENDED' } } as unknown as WorkflowApi;
    await renderContent();
    expect(container.textContent).toBe('');
  });

  it('says why it cannot reach the management API, with what can be done about it', async () => {
    const run = vi.fn();
    state.api = { client: null, connection: { status: 'unavailable', reason: 'needs-api-key', notice: { severity: 'info', text: 'This endpoint is secured with OAuth.' }, action: { label: 'Switch to API key', run, pending: false } } } as unknown as WorkflowApi;
    await renderContent();
    expect(container.querySelector('[role="alert"]')?.textContent).toMatch(/secured with OAuth/);
    await act(async () => buttonNamed('Switch to API key')?.click());
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('offers to try a refused or failed connection again', async () => {
    const retry = vi.fn();
    state.api = { client: null, connection: { status: 'refused', message: 'The gateway refused the key.', retry } } as unknown as WorkflowApi;
    await renderContent();
    expect(container.textContent).toMatch(/Credentials refused/);
    await act(async () => buttonNamed('Retry')?.click());
    expect(retry).toHaveBeenCalledTimes(1);

    state.api = { client: null, connection: { status: 'error', message: 'Could not load this integration’s endpoints.', retry } } as unknown as WorkflowApi;
    await renderContent();
    expect(container.textContent).toMatch(/Could not load this integration’s endpoints/);
    await act(async () => buttonNamed('Retry')?.click());
    expect(retry).toHaveBeenCalledTimes(2);
  });

  it('opens on the first definition, and links its runs and figures in this environment and track', async () => {
    ready(async () => [definition('orderWorkflow'), definition('refundWorkflow')]);
    await renderContent();
    expect(container.querySelector('[role="combobox"]')?.textContent).toBe('orderWorkflow');
    expect(linkNamed('View Workflows')?.getAttribute('href')).toBe(`${BASE}/workflows?type=orderWorkflow&env=production&track=track-2`);
    expect(hrefOf('workflow-stat-Failed (24h)')).toBe(`${BASE}/workflows?type=orderWorkflow&status=FAILED&closed=24h&env=production&track=track-2`);
    expect(hrefOf('workflow-stat-Pending Reviews')).toBe(`${BASE}/human-tasks?type=review&workflowType=orderWorkflow&env=production&track=track-2`);
    expect(hrefOf('workflow-stat-Pending Tasks')).toBe(`${BASE}/human-tasks?type=task&workflowType=orderWorkflow&env=production&track=track-2`);
    expect(container.textContent).not.toMatch(/currently inactive/);
  });

  it('lists each definition with its worker count, and follows the one picked', async () => {
    ready(async () => [definition('orderWorkflow'), definition('refundWorkflow', { workerCount: 0, isActive: false })]);
    await renderContent();
    const select = container.querySelector('[role="combobox"]');
    await act(async () => select?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })));
    const options = Array.from(document.querySelectorAll('[role="option"]'));
    expect(options.map((option) => option.textContent)).toEqual(['orderWorkflowWorker count: 2', 'refundWorkflowWorker count: 0']);

    await act(async () => (options[1] as HTMLElement).click());
    expect(select?.textContent).toBe('refundWorkflow');
    expect(container.textContent).toMatch(/This workflow definition is currently inactive\./);
    expect(hrefOf('workflow-stat-Running')).toBe(`${BASE}/workflows?type=refundWorkflow&status=RUNNING&env=production&track=track-2`);
  });

  it('starts a workflow of the selected definition, and opens the run in this environment and track', async () => {
    ready(async () => [definition('orderWorkflow'), definition('refundWorkflow')]);
    await renderContent();
    expect(state.dialog?.open).toBe(false);

    await act(async () => buttonNamed('Start New Workflow')?.click());
    expect(state.dialog).toMatchObject({ open: true, scopeId: 'scope-1', initialWorkflowType: 'orderWorkflow' });
    expect(state.dialog?.definitions).toHaveLength(2);

    await act(async () => state.dialog?.onViewRun?.({ workflowType: 'orderWorkflow', runId: 'run-1' }));
    expect(state.navigate).toHaveBeenCalledWith(`${BASE}/workflows/run-1?type=orderWorkflow&env=production&track=track-2`);

    await act(async () => state.dialog?.onClose());
    expect(state.dialog?.open).toBe(false);
  });

  it('counts the whole integration when no definition is registered', async () => {
    ready(async () => []);
    await renderContent();
    expect(container.textContent).toMatch(/No workflow definitions are registered yet\./);
    expect(buttonNamed('Start New Workflow')?.disabled).toBe(true);
    expect(linkNamed('View Workflows')?.getAttribute('href')).toBe(`${BASE}/workflows?env=production&track=track-2`);
    expect(hrefOf('workflow-stat-Pending Tasks')).toBe(`${BASE}/human-tasks?type=task&env=production&track=track-2`);
  });

  it('offers to read the definitions again when they could not be read', async () => {
    const client = ready(async () => {
      throw new WorkflowApiError('ACCESS_DENIED', 403, null, '/definitions');
    });
    await renderContent();
    expect(container.textContent).toMatch(/Could not load the workflow definitions\./);
    client.definitions.list.mockResolvedValue([definition('orderWorkflow')]);
    await act(async () => buttonNamed('Retry')?.click());
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(container.querySelector('[role="combobox"]')?.textContent).toBe('orderWorkflow');
  });
});
