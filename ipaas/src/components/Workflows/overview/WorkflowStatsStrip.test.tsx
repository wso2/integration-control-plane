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
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { WorkflowClient } from '../api/client';
import { WorkflowApiError } from '../api/http';
import type { WorkflowListFilters } from '../api/types';
import WorkflowStatsStrip from './WorkflowStatsStrip';

// Whether calls carry roles, read as the strip renders: most tests are of the figures as they read
// with roles, which the engine needs to list any review or task.
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

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const page = <T,>(items: T[], hasMore = false) => ({ items, nextPageToken: hasMore ? 'next' : null, hasMore });

function fakeClient({ runs = [] as { workflowType: string }[], reviews = [] as { parentWorkflowType: string | null }[], tasks = 0 } = {}) {
  return {
    instances: { list: vi.fn().mockResolvedValue(page(runs)) },
    reviews: { list: vi.fn().mockResolvedValue(page(reviews)) },
    humanTasks: { list: vi.fn().mockResolvedValue(page(Array.from({ length: tasks }, () => ({})))) },
  };
}

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  roles.carried = true;
});

/** `null` renders the figures of the whole integration. */
async function renderStrip(client: ReturnType<typeof fakeClient>, workflowType: string | null = 'orderWorkflow') {
  await act(async () =>
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <WorkflowStatsStrip
            client={client as unknown as WorkflowClient}
            scopeId="scope"
            workflowType={workflowType ?? undefined}
            runsLink={(status, closedWithin) => `/runs/${status}${closedWithin ? `?closed=${closedWithin}` : ''}`}
            tasksLink={(kind) => `/tasks/${kind}`}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  );
  // Let every figure's read settle.
  await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
}

const tile = (key: string) => {
  const found = container.querySelector<HTMLAnchorElement>(`[data-testid="workflow-stat-${key}"]`);
  if (!found) throw new Error(`expected the ${key} figure`);
  return found;
};
const badge = (key: string) => container.querySelector(`[data-testid="workflow-stat-${key}-badge"]`);
const callWith = (list: Mock, status: string) => list.mock.calls.map(([filters]) => filters as WorkflowListFilters).find((filters) => filters.status === status);

describe('WorkflowStatsStrip', () => {
  it('counts the definition in the console, and never sends it to the engine', async () => {
    const client = fakeClient({ runs: [{ workflowType: 'orderWorkflow' }, { workflowType: 'refundWorkflow' }, { workflowType: 'orderWorkflow' }] });
    await renderStrip(client);
    expect(tile('Running').textContent).toMatch(/Running2$/);
    client.instances.list.mock.calls.forEach(([filters]) => expect(filters).not.toHaveProperty('workflowType'));
  });

  it('counts every run without a definition', async () => {
    await renderStrip(fakeClient({ runs: [{ workflowType: 'orderWorkflow' }, { workflowType: 'refundWorkflow' }] }), null);
    expect(tile('Running').textContent).toMatch(/Running2$/);
  });

  it('links each figure to its list, filtered to what it counts', async () => {
    await renderStrip(fakeClient());
    expect(['Running', 'Suspended', 'Failed (24h)', 'Completed (24h)'].map((key) => tile(key).getAttribute('href'))).toEqual(['/runs/RUNNING', '/runs/SUSPENDED', '/runs/FAILED?closed=24h', '/runs/COMPLETED?closed=24h']);
    expect(['Pending Reviews', 'Pending Tasks'].map((key) => tile(key).getAttribute('href'))).toEqual(['/tasks/review', '/tasks/task']);
  });

  it('counts closed runs over the 24 hours before each read', async () => {
    const client = fakeClient();
    await renderStrip(client);
    const failed = callWith(client.instances.list, 'FAILED');
    const completed = callWith(client.instances.list, 'COMPLETED');
    [failed, completed].forEach((filters) => {
      const windowMs = Date.now() - Date.parse(filters?.closeTimeFrom ?? '');
      expect(Math.abs(windowMs - 24 * 3600_000)).toBeLessThan(60_000);
    });
    expect(callWith(client.instances.list, 'RUNNING')?.closeTimeFrom).toBeUndefined();
    expect(callWith(client.instances.list, 'SUSPENDED')?.closeTimeFrom).toBeUndefined();
  });

  it('marks failures in the error tone while there are any', async () => {
    const client = fakeClient();
    client.instances.list.mockImplementation(async (filters: WorkflowListFilters) => page(filters.status === 'FAILED' ? [{ workflowType: 'orderWorkflow' }] : []));
    await renderStrip(client);
    expect(tile('Failed (24h)').textContent).toMatch(/1$/);
    expect(tile('Failed (24h)').querySelector('.MuiTypography-h6')?.className).not.toBe(tile('Completed (24h)').querySelector('.MuiTypography-h6')?.className);
  });

  it('asks for the definition’s pending tasks, and narrows pending reviews in the console', async () => {
    const client = fakeClient({ reviews: [{ parentWorkflowType: 'orderWorkflow' }, { parentWorkflowType: 'refundWorkflow' }, { parentWorkflowType: null }], tasks: 3 });
    await renderStrip(client);
    expect(client.humanTasks.list).toHaveBeenCalledWith(expect.objectContaining({ status: 'PENDING', parentWorkflowType: 'orderWorkflow' }));
    expect(client.reviews.list).toHaveBeenCalledWith(expect.objectContaining({ status: 'PENDING' }));
    // A runtime that names no parent type has its reviews counted rather than dropped.
    expect(badge('Pending Reviews')?.textContent).toBe('2');
    expect(badge('Pending Tasks')?.textContent).toBe('3');
  });

  it('neither reads nor counts reviews and tasks while calls carry no roles, and links to neither', async () => {
    roles.carried = false;
    const client = fakeClient({ reviews: [{ parentWorkflowType: 'orderWorkflow' }], tasks: 3 });
    await renderStrip(client);
    expect(client.reviews.list).not.toHaveBeenCalled();
    expect(client.humanTasks.list).not.toHaveBeenCalled();
    for (const key of ['Pending Reviews', 'Pending Tasks']) {
      // The engine would list none to an anonymous caller: a 0 would be a guess.
      expect(tile(key).textContent).toMatch(/–$/);
      expect(tile(key).getAttribute('href')).toBeNull();
      expect(badge(key)).toBeNull();
    }
    expect(tile('Running').getAttribute('href')).toBe('/runs/RUNNING');
  });

  it('leaves a zero plain', async () => {
    await renderStrip(fakeClient());
    expect(tile('Pending Reviews').textContent).toMatch(/0$/);
    expect(badge('Pending Reviews')).toBeNull();
    expect(badge('Pending Tasks')).toBeNull();
  });

  it('caps a figure whose page filled', async () => {
    const client = fakeClient();
    client.humanTasks.list.mockResolvedValue(
      page(
        Array.from({ length: 100 }, () => ({})),
        true,
      ),
    );
    await renderStrip(client);
    expect(badge('Pending Tasks')?.textContent).toBe('100+');
  });

  it('shows a figure it could not read as unknown, not as a zero', async () => {
    const client = fakeClient();
    client.reviews.list.mockRejectedValue(new WorkflowApiError('ACCESS_DENIED', 403, null, '/review-activities'));
    await renderStrip(client);
    expect(tile('Pending Reviews').textContent).toMatch(/–$/);
    expect(badge('Pending Reviews')).toBeNull();
  });

  it('holds each figure’s place while it loads', async () => {
    const client = fakeClient();
    client.instances.list.mockReturnValue(new Promise(() => undefined));
    await renderStrip(client);
    expect(tile('Running').querySelector('.MuiSkeleton-root')).not.toBeNull();
  });
});
