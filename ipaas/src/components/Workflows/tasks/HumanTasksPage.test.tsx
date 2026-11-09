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

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkflowClient } from '../api/client';
import { WorkflowApiError } from '../api/http';
import type { HumanTaskSummary, Page, ReviewActivitySummary } from '../api/types';
import type { WorkflowPageSlotProps } from '../shared/WorkflowPageShell';
import HumanTasksPage from './HumanTasksPage';
import { buttonOf, byText, click, dialogTitled, findByText, mount, queryByText, unmount } from './testDom';

// The links themselves are the routing module's; here they only need to be asked for.
const routes = vi.hoisted(() => ({ goToWorkflowRuns: vi.fn() }));
vi.mock('../routing/useWorkflowRoutes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../routing/useWorkflowRoutes')>()),
  useWorkflowRoutes: () => routes,
}));

const task = (patch: Partial<HumanTaskSummary>): HumanTaskSummary => ({
  taskId: 'task-1',
  taskName: 'OrderFlow.approve',
  title: 'Approve order',
  parentWorkflowId: 'order-1',
  parentWorkflowType: 'OrderFlow',
  status: 'PENDING',
  startTime: '2026-10-01T10:00:00Z',
  closeTime: null,
  userRoles: [],
  completedBy: null,
  completedAt: null,
  canComplete: true,
  ...patch,
});

const review = (patch: Partial<ReviewActivitySummary>): ReviewActivitySummary => ({
  taskId: 'review-1',
  taskName: 'OrderFlow.chargeCard',
  title: '',
  activityName: 'chargeCard',
  parentWorkflowId: 'order-2',
  parentWorkflowType: 'OrderFlow',
  status: 'PENDING',
  trigger: 'ON_FAILURE',
  startTime: '2026-10-02T10:00:00Z',
  closeTime: null,
  userRoles: [],
  ...patch,
});

const page = <T,>(items: T[], nextPageToken: string | null = null): Page<T> => ({ items, nextPageToken, hasMore: !!nextPageToken });

interface Sources {
  tasks?: () => Promise<Page<HumanTaskSummary>>;
  reviews?: () => Promise<Page<ReviewActivitySummary>>;
}

async function renderPage(url = '/', sources: Sources = {}) {
  const client = {
    definitions: { list: vi.fn().mockResolvedValue([{ workflowType: 'OrderFlow' }, { workflowType: 'RefundFlow' }]) },
    humanTasks: { list: vi.fn(sources.tasks ?? (() => Promise.resolve(page([task({})])))) },
    reviews: {
      list: vi.fn(sources.reviews ?? (() => Promise.resolve(page([review({}), review({ taskId: 'review-2', activityName: 'refund', parentWorkflowType: 'RefundFlow', startTime: '2026-09-30T10:00:00Z' })])))),
      bulkRetry: vi.fn().mockResolvedValue({ action: 'retry', requested: 1, applied: 1, skipped: 0, failed: 0, items: [{ taskId: 'review-1', outcome: 'APPLIED', reason: null }], decidedBy: 'me', decidedAt: '' }),
    },
  };
  const slot = {
    environment: { id: 'development', name: 'Development' },
    api: { client: client as unknown as WorkflowClient, connection: { status: 'ready', scopeId: 'scope', runtime: { taskQueue: null }, renewCredential: vi.fn() } },
  } as unknown as WorkflowPageSlotProps;
  await mount(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[url]}>
        <HumanTasksPage {...slot} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}

/** The titles of the rows on screen, top to bottom. */
const rowTitles = () => [...document.body.querySelectorAll('tbody tr')].map((row) => row.querySelector('td p')?.textContent);

afterEach(unmount);

describe('HumanTasksPage', () => {
  it('queues tasks and reviews together, newest first, pending by default', async () => {
    const client = await renderPage();
    await findByText('Approve order');
    expect(rowTitles()).toEqual(['chargeCard', 'Approve order', 'refund']);
    expect(client.humanTasks.list).toHaveBeenCalledWith(expect.objectContaining({ status: 'PENDING', limit: 50 }));
    expect(client.reviews.list).toHaveBeenCalledWith(expect.objectContaining({ status: 'PENDING', limit: 50 }));
  });

  it('opens on the kind of work item and the definition a link names', async () => {
    const client = await renderPage('/?type=review&workflowType=OrderFlow');
    await findByText('chargeCard');
    expect(rowTitles()).toEqual(['chargeCard']);
    // Tasks are listed by definition on the engine; reviews are narrowed here.
    expect(client.humanTasks.list).toHaveBeenCalledWith(expect.objectContaining({ parentWorkflowType: 'OrderFlow' }));
  });

  it('loads the next page of each source that has one', async () => {
    const client = await renderPage('/', { tasks: () => Promise.resolve(page([task({})], 'next-tasks')) });
    await click(buttonOf('Load more'));
    expect(client.humanTasks.list).toHaveBeenLastCalledWith(expect.objectContaining({ pageToken: 'next-tasks' }));
    expect(client.reviews.list).toHaveBeenCalledTimes(1);
  });

  it('keeps one source’s rows when the other cannot be read, and says why', async () => {
    await renderPage('/', { tasks: () => Promise.reject(new WorkflowApiError('ACCESS_DENIED', 403, 'Not allowed to list tasks.', 'GET x')) });
    expect(await findByText('Could not load human tasks. Not allowed to list tasks.')).toBeTruthy();
    expect(rowTitles()).toEqual(['chargeCard', 'refund']);
  });

  it('retries the chosen reviews in bulk and reports what the engine did', async () => {
    const client = await renderPage();
    await findByText('chargeCard');
    await click(buttonOf('Select reviews'));
    expect(byText(/^Choose the pending reviews to decide together; 2 can be selected\. /)).toBeTruthy();

    const reviewBox = document.body.querySelector<HTMLInputElement>('input[aria-label="Select chargeCard"]');
    if (!reviewBox) throw new Error('expected the review’s checkbox');
    await click(reviewBox);
    expect(byText(/^1 of 2 pending reviews selected\. /)).toBeTruthy();

    await click(buttonOf('Retry Selected'));
    await click(buttonOf('Retry 1', dialogTitled('Retry Selected Reviews')));
    expect(client.reviews.bulkRetry).toHaveBeenCalledWith({ action: 'retry', taskIds: ['review-1'] });
    expect(await findByText('1 review: 1 retried, 0 skipped.')).toBeTruthy();
    // All decided: the mode is left.
    expect(queryByText('Retry Selected')).toBeNull();
  });
});
