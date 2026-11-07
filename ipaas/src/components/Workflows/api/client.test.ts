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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorkflowClient } from './client';

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => new Response('{"items":[],"count":0}'));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const BASE = 'https://gw/orderprocessor/v1.0';
const QUEUE = 'e9f19752-598b-4637-9d1a-e6457d156df0';

/** The query of the one request made, as a plain object. */
function sentQuery(): Record<string, string> {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const url = new URL(String(fetchMock.mock.calls[0][0]));
  return Object.fromEntries(url.searchParams);
}

function client(taskQueue?: string | null) {
  return createWorkflowClient({ baseUrl: BASE, getHeaders: async () => ({}), taskQueue });
}

describe('createWorkflowClient task queue scope', () => {
  // Every integration in an environment shares one namespace; without a queue the API answers for all of them.
  const lists: [string, (c: ReturnType<typeof client>) => Promise<unknown>, string][] = [
    ['runs', (c) => c.instances.list({ status: 'RUNNING' }), '/workflows'],
    ['human tasks', (c) => c.humanTasks.list({ status: 'PENDING' }), '/human-tasks'],
    ['reviews', (c) => c.reviews.list({ status: 'PENDING' }), '/review-activities'],
    ['pending task count', (c) => c.humanTasks.pendingCount(), '/human-tasks/pending-count'],
  ];

  it.each(lists)('limits %s to the integration’s task queue', async (_name, call, path) => {
    await call(client(QUEUE));
    expect(new URL(String(fetchMock.mock.calls[0][0])).pathname).toBe(new URL(BASE + path).pathname);
    expect(sentQuery()).toMatchObject({ taskQueue: QUEUE });
  });

  it.each(lists)('leaves %s unlimited when no task queue is known', async (_name, call) => {
    await call(client(null));
    expect(sentQuery()).not.toHaveProperty('taskQueue');
  });

  it('keeps the caller’s other filters beside the queue', async () => {
    await client(QUEUE).instances.list({ status: 'FAILED', workflowType: 'InsuranceClaim', limit: 25 });
    expect(sentQuery()).toEqual({ status: 'FAILED', workflowType: 'InsuranceClaim', limit: '25', taskQueue: QUEUE });
  });

  it('does not let a caller list another integration’s queue', async () => {
    await client(QUEUE).reviews.list({ taskQueue: 'someone-else' });
    expect(sentQuery()).toMatchObject({ taskQueue: QUEUE });
    fetchMock.mockClear();
    await client(QUEUE).humanTasks.pendingCount('someone-else');
    expect(sentQuery()).toMatchObject({ taskQueue: QUEUE });
  });

  it('leaves single-run reads alone, which name their run', async () => {
    await client(QUEUE).instances.get('order-42');
    expect(sentQuery()).toEqual({});
  });
});
