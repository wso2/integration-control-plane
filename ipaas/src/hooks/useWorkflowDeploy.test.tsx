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
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkflowDeploy } from '../types/workflowRuntime';
import { trackWorkflowDeploy, useWorkflowDeploy } from './useWorkflowDeploy';

// What ipaas-service answers for the workflow's deploy to development, read by read.
// A read with no answer left fails, as when the BFF can't be reached.
const server = vi.hoisted(() => ({ answers: [] as WorkflowDeploy[], reads: 0, fail: false }));
vi.mock('../api/workflowRuntime', () => ({
  fetchWorkflowDeploy: async () => {
    if (server.fail) throw new Error('HTTP 503');
    return server.answers[Math.min(server.reads++, server.answers.length - 1)];
  },
}));

const running: WorkflowDeploy = { environment: 'development', state: 'deploying', operation: 'deploy', startedAt: '2026-11-10T11:33:09Z' };
const deployed: WorkflowDeploy = { ...running, state: 'deployed', releaseName: 'orders-20261110-3' };

let container: HTMLDivElement;
let root: Root;
let qc: QueryClient;
let seen: ReturnType<typeof useWorkflowDeploy>;

function Probe() {
  seen = useWorkflowDeploy('orders', 'development');
  return null;
}

const wait = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));
// One poll's interval, then the timers React Query hands its answer to the component on.
const poll = async () => {
  await wait(3_000);
  await wait(50);
};

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  // Polls run only while the page has focus.
  focusManager.setFocused(true);
  Object.assign(server, { answers: [], reads: 0, fail: false });
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  container = document.createElement('div');
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
});

const render = () =>
  act(async () =>
    root.render(
      <QueryClientProvider client={qc}>
        <Probe />
      </QueryClientProvider>,
    ),
  );

describe('useWorkflowDeploy', () => {
  it('polls a running deploy until it ends, then re-reads the environment’s deployment', async () => {
    server.answers = [running, running, deployed];
    const invalidate = vi.spyOn(qc, 'invalidateQueries');
    await render();
    await wait(0);
    expect(seen.isDeploying).toBe(true);
    expect(invalidate).not.toHaveBeenCalled();

    await poll();
    expect(seen.isDeploying).toBe(true);
    await poll();
    expect(seen.isDeploying).toBe(false);
    expect(seen.deploy?.releaseName).toBe('orders-20261110-3');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['componentDeployment'] });

    const reads = server.reads;
    await wait(30_000);
    expect(server.reads).toBe(reads);
  });

  it('shows a deploy a 202 answer started before its first read', async () => {
    server.answers = [deployed];
    trackWorkflowDeploy(qc, 'orders', running);
    qc.setQueryDefaults(['workflowDeploy'], { staleTime: Infinity });
    await render();
    expect(seen.isDeploying).toBe(true);
    expect(server.reads).toBe(0);
  });

  it('reports a failed deploy with its message', async () => {
    server.answers = [{ ...running, state: 'failed', message: 'the workflow runtime is unavailable; try again later' }];
    await render();
    await wait(0);
    expect(seen.isDeploying).toBe(false);
    expect(seen.failure?.message).toBe('the workflow runtime is unavailable; try again later');
  });

  it('holds actions until the first read lands', async () => {
    server.answers = [deployed];
    await render();
    expect(seen.isChecking).toBe(true);
    expect(seen.isDeploying).toBe(false);
    await wait(50);
    expect(seen.isChecking).toBe(false);
  });

  it('reports a read that failed, rather than nothing running', async () => {
    server.fail = true;
    await render();
    await wait(50);
    expect(seen.isError).toBe(true);
    expect(seen.isDeploying).toBe(false);
    expect(seen.isChecking).toBe(false);
  });

  it('re-reads the environment once when a deploy ends, however many cards show it', async () => {
    server.answers = [running, deployed];
    const invalidate = vi.spyOn(qc, 'invalidateQueries');
    await act(async () =>
      root.render(
        <QueryClientProvider client={qc}>
          <Probe />
          <Probe />
        </QueryClientProvider>,
      ),
    );
    await wait(50);
    await poll();
    expect(seen.isDeploying).toBe(false);
    expect(invalidate.mock.calls.filter(([filters]) => JSON.stringify(filters?.queryKey) === '["componentDeployment"]')).toHaveLength(1);
  });
});
