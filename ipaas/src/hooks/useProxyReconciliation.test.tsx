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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useProxyReconciliation } from './useDeployments';
import { flush } from '../test/renderWithScopes';
import type { ProxyReconciliationStatus } from '../types/deployment';

// What ipaas-service answers for development: the gateway state of the release bound there, and each release it was read for.
const server = vi.hoisted(() => ({ bound: 'r1', reads: [] as string[] }));
vi.mock('../api/deployments', () => ({
  fetchProxyReconciliation: async (): Promise<ProxyReconciliationStatus> => {
    server.reads.push(server.bound);
    return { status: server.bound === 'r1' ? 'SUCCEEDED' : 'RUNNING', component: 'orders', environment: 'development', endpoints: [] };
  },
}));

let root: Root;
let client: QueryClient;
let shown: string | undefined;

// The Integration-as-API card's read, for the release the deployment it polls runs.
function Card({ releaseId }: { releaseId: string }) {
  shown = useProxyReconciliation('acme', 'org-1', 'orders', 'v1', 'development', 'project-a', releaseId).data?.status;
  return null;
}

async function render(releaseId: string) {
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <Card releaseId={releaseId} />
      </QueryClientProvider>,
    ),
  );
  await flush();
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.assign(server, { bound: 'r1', reads: [] });
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  root = createRoot(document.createElement('div'));
});
afterEach(() => act(() => root.unmount()));

describe('useProxyReconciliation', () => {
  it('reads the new release’s state once the deployment runs a new release', async () => {
    await render('r1');
    expect(shown).toBe('SUCCEEDED');

    server.bound = 'r2';
    await render('r2');

    expect(server.reads).toEqual(['r1', 'r2']);
    expect(shown).toBe('RUNNING');
  });

  it('reads it again whenever the deployment is read again', async () => {
    await render('r1');
    await act(() => client.invalidateQueries({ queryKey: ['componentDeployment'] }));
    await flush();

    expect(server.reads).toEqual(['r1', 'r1']);
  });
});
