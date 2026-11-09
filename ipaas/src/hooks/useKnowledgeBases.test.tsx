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
import type { EndpointTestAccess } from './useEndpointTestAccess';
import { useRetrieveFromKnowledgeBase } from './useKnowledgeBases';

// The gateway, answering each key it is sent; renewKey hands out the next key.
const gateway = vi.hoisted(() => ({ accepted: new Set<string>(), sent: [] as (string | null)[], renewed: [] as (string | null)[], next: 'k2', options: [] as unknown[] }));
const access = vi.hoisted(() => ({ current: {} as Partial<EndpointTestAccess> }));
vi.mock('../api/knowledgeBases', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/knowledgeBases')>()),
  retrieveFromKnowledgeBase: async (_url: string, credential: { apiKey: string | null }) => {
    gateway.sent.push(credential.apiKey);
    if (!credential.apiKey || !gateway.accepted.has(credential.apiKey)) throw Object.assign(new Error('HTTP 401'), { status: 401 });
    return [{ text: 'chunk', source: 's' }];
  },
}));
vi.mock('./useEndpointTestAccess', () => ({
  useEndpointTestAccess: (_ref: unknown, options: unknown) => {
    gateway.options.push(options);
    return access.current;
  },
}));

let root: Root;
let client: QueryClient;
let hook: ReturnType<typeof useRetrieveFromKnowledgeBase>;
function Chat() {
  hook = useRetrieveFromKnowledgeBase({ name: 'docs-kb', environment: 'development' }, 'docs-kb', true);
  return null;
}
const query = { userQuery: 'leave', maxChunks: 3, minSimilarity: 0.1 };
const send = () => act(() => hook.retrieve.mutateAsync(query));
const renewTo = (key: string | null) => (refused: string | null) => {
  gateway.renewed.push(refused);
  return Promise.resolve(key);
};

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  Object.assign(gateway, { accepted: new Set(['k1']), sent: [], renewed: [], options: [] });
  access.current = { gatewayUrl: 'https://gw/docs-kb', authHeader: 'X-API-Key', apiKey: 'k1', mode: 'api-key', securityError: null, renewKey: renewTo('k2') };
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  root = createRoot(document.createElement('div'));
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <Chat />
      </QueryClientProvider>,
    ),
  );
});
afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
});

describe('useRetrieveFromKnowledgeBase', () => {
  it('sends a key only to the URL the security read names', () => {
    expect(gateway.options.every((o) => !(o as { gatewayUrlFallback?: string }).gatewayUrlFallback)).toBe(true);
  });

  it('renews the key each query is refused with, and sends the query again', async () => {
    gateway.accepted = new Set(['k2']);
    await expect(send()).resolves.toEqual([{ text: 'chunk', source: 's' }]);
    expect(gateway.sent).toEqual(['k1', 'k2']);

    // Another view's mint revokes k2: the next refusal renews again, not only the first.
    access.current = { ...access.current, apiKey: 'k2', renewKey: renewTo('k3') };
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <Chat />
        </QueryClientProvider>,
      ),
    );
    gateway.accepted = new Set(['k3']);
    await expect(send()).resolves.toHaveLength(1);
    expect(gateway.renewed).toEqual(['k1', 'k2']);
    expect(gateway.sent).toEqual(['k1', 'k2', 'k2', 'k3']);
  });

  it('gives up when no other key can be had', async () => {
    gateway.accepted = new Set();
    access.current = { ...access.current, renewKey: renewTo('k1') };
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <Chat />
        </QueryClientProvider>,
      ),
    );
    await expect(send()).rejects.toMatchObject({ status: 401 });
    expect(gateway.sent).toEqual(['k1']);
  });

  it('reads the API on the gateway again while it is not there', async () => {
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    access.current = { ...access.current, apiKey: null, mode: null, gatewayUrl: '', securityError: Object.assign(new Error('HTTP 502'), { status: 502 }) };
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <Chat />
        </QueryClientProvider>,
      ),
    );
    await act(() => vi.advanceTimersByTimeAsync(15_000));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['endpoint-security', 'docs-kb', 'development', 'knowledge-base', ''] });

    invalidate.mockClear();
    access.current = { ...access.current, apiKey: 'k1', mode: 'api-key', gatewayUrl: 'https://gw/docs-kb', securityError: null };
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <Chat />
        </QueryClientProvider>,
      ),
    );
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(invalidate).not.toHaveBeenCalled();
  });
});
