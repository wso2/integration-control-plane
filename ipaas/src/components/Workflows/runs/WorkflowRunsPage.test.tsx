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
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkflowClient } from '../api/client';
import type { Page, WorkflowInstanceSummary, WorkflowListFilters } from '../api/types';
import type { WorkflowPageSlotProps } from '../shared/WorkflowPageShell';
import WorkflowRunsPage from './WorkflowRunsPage';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../routing/useWorkflowRoutes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../routing/useWorkflowRoutes')>()),
  useWorkflowRoutes: () => ({ goToWorkflowRuns: vi.fn() }),
}));
// The execution view has its own reads; here only which run it is handed matters.
// Where the User Portal is served is read from its own route, which isn't under test here.
vi.mock('../../../hooks/useUserPortal', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../../hooks/useUserPortal')>()), useUserPortalServed: () => true }));
vi.mock('./WorkflowRunDetailDrawer', () => ({ default: ({ run }: { run: WorkflowInstanceSummary | null }) => <output>{run ? `drawer: ${run.runId} ${run.status}` : 'drawer closed'}</output> }));

const run = (runId: string, workflowType: string, startTime: string, patch: Partial<WorkflowInstanceSummary> = {}): WorkflowInstanceSummary => ({
  workflowId: `wf-${runId}`,
  runId,
  workflowType,
  status: 'COMPLETED',
  startTime,
  closeTime: null,
  kind: 'WORKFLOW',
  input: null,
  ...patch,
});

const FIRST_PAGE: Page<WorkflowInstanceSummary> = {
  items: [run('run-1', 'orderWorkflow', '2026-10-01T10:00:00Z'), run('run-2', 'refundWorkflow', '2026-10-01T11:00:00Z', { status: 'FAILED' })],
  nextPageToken: 'next',
  hasMore: true,
};
const SECOND_PAGE: Page<WorkflowInstanceSummary> = { items: [run('run-0', 'orderWorkflow', '2026-10-01T09:00:00Z')], nextPageToken: null, hasMore: false };

function fakeClient() {
  const list = vi.fn(async (filters: WorkflowListFilters = {}) => (filters.pageToken === 'next' ? SECOND_PAGE : FIRST_PAGE));
  const client = {
    definitions: {
      list: vi.fn(async () => [
        { workflowType: 'orderWorkflow', kind: 'WORKFLOW', inputSchema: null, isActive: true, workerCount: 1 },
        { workflowType: 'refundWorkflow', kind: 'WORKFLOW', inputSchema: null, isActive: true, workerCount: 1 },
      ]),
    },
    instances: { list },
  } as unknown as WorkflowClient;
  return { client, list };
}

let root: Root;
let container: HTMLDivElement;
let queryClient: QueryClient;

async function flush() {
  for (let i = 0; i < 4; i += 1) {
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
  }
}

async function renderPage(url: string, client: WorkflowClient) {
  const slot = {
    scope: { org: 'acme', project: 'shop', component: 'orders' },
    component: { id: 'orders' },
    environment: { id: 'development', name: 'Development' },
    api: { client, connection: { status: 'ready', scopeId: 'scope', runtime: { taskQueue: 'orders' } } },
  } as unknown as WorkflowPageSlotProps;
  const page = <WorkflowRunsPage {...slot} />;
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () =>
    root.render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/workflows" element={page} />
            <Route path="/workflows/:runId" element={page} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  );
  await flush();
}

/** The run id of each row, top to bottom. */
const rowRunIds = () => [...container.querySelectorAll('tbody tr')].map((row) => row.querySelectorAll('td')[1]?.textContent);

beforeEach(() => {
  localStorage.clear();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('WorkflowRunsPage', () => {
  it('lists the runs newest first', async () => {
    const { client, list } = fakeClient();
    await renderPage('/workflows', client);
    expect(rowRunIds()).toEqual(['run-2', 'run-1']);
    expect(container.textContent).toContain('Failed');
    expect(list).toHaveBeenCalledWith({ status: undefined, startTimeFrom: undefined, limit: 20, pageToken: undefined });
  });

  it('sends the status a link names, and ignores one the filter does not offer', async () => {
    const { client, list } = fakeClient();
    await renderPage('/workflows?status=FAILED', client);
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'FAILED' }));

    await act(async () => root.unmount());
    root = createRoot(container);
    const other = fakeClient();
    await renderPage('/workflows?status=CONTINUED_AS_NEW', other.client);
    expect(other.list).toHaveBeenLastCalledWith(expect.objectContaining({ status: undefined }));
  });

  it('lists the runs closed within the window a figure of closed runs links, as it counts them', async () => {
    const before = Date.now();
    const { client, list } = fakeClient();
    await renderPage('/workflows?status=FAILED&closed=24h', client);
    const filters = list.mock.calls.at(-1)?.[0];
    expect(filters).toMatchObject({ status: 'FAILED', startTimeFrom: undefined });
    const windowMs = before - Date.parse(filters?.closeTimeFrom ?? '');
    expect(windowMs).toBeGreaterThan(24 * 3600_000 - 60_000);
    expect(windowMs).toBeLessThan(24 * 3600_000 + 60_000);
    expect(container.textContent).toContain('Closed in the past 24 hours');
  });

  it('filters to the definition a link names, reading the engine’s largest page', async () => {
    const { client, list } = fakeClient();
    await renderPage('/workflows?type=refundWorkflow', client);
    expect(rowRunIds()).toEqual(['run-2']);
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ limit: 100 }));
  });

  it('narrows the runs loaded by workflow ID', async () => {
    const { client } = fakeClient();
    await renderPage('/workflows', client);
    const searchBox = container.querySelector<HTMLInputElement>('input[aria-label="Search by workflow ID"]');
    if (!searchBox) throw new Error('expected the search box');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(searchBox, 'wf-run-1');
      searchBox.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(rowRunIds()).toEqual(['run-1']);
  });

  it('loads older runs with the page token, and keeps the ones already loaded', async () => {
    const { client, list } = fakeClient();
    await renderPage('/workflows', client);
    const loadMore = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Load more');
    await act(async () => loadMore?.click());
    await flush();
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ pageToken: 'next' }));
    expect(rowRunIds()).toEqual(['run-2', 'run-1', 'run-0']);
    expect([...container.querySelectorAll('button')].some((b) => b.textContent === 'Load more')).toBe(false);
  });

  it('opens the run a link names by its run id', async () => {
    const { client } = fakeClient();
    await renderPage('/workflows/run-1', client);
    expect(container.textContent).toContain('drawer: run-1');
  });

  it('opens a row’s run when it is clicked', async () => {
    const { client } = fakeClient();
    await renderPage('/workflows', client);
    expect(container.textContent).toContain('drawer closed');
    await act(async () => container.querySelector<HTMLElement>('tbody tr')?.click());
    expect(container.textContent).toContain('drawer: run-2');
  });

  it('gives the open run’s drawer the run as the list reads it now, so its status follows a close', async () => {
    const { client, list } = fakeClient();
    const withRun2 =
      (status: WorkflowInstanceSummary['status']) =>
      async (filters: WorkflowListFilters = {}) =>
        filters.pageToken === 'next' ? SECOND_PAGE : { ...FIRST_PAGE, items: [FIRST_PAGE.items[0], run('run-2', 'refundWorkflow', '2026-10-01T11:00:00Z', { status })] };
    list.mockImplementation(withRun2('RUNNING'));
    await renderPage('/workflows', client);
    await act(async () => container.querySelector<HTMLElement>('tbody tr')?.click());
    expect(container.textContent).toContain('drawer: run-2 RUNNING');

    list.mockImplementation(withRun2('COMPLETED'));
    await act(async () => queryClient.invalidateQueries());
    await flush();
    expect(container.textContent).toContain('drawer: run-2 COMPLETED');
  });
});
