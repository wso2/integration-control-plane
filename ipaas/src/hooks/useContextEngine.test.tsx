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
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import type { ContextEngineDetail } from '../types/contextEngine';

vi.mock('../api/contextEngine', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/contextEngine')>()),
  setContextEngineAccess: async () => ({ api: true, mcp: false }),
}));

import { useSetContextEngineAccess } from './useContextEngine';

describe('useSetContextEngineAccess', () => {
  it('puts the access the engine acknowledged into its cached detail', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const key = ['contextEngines', 'detail', 'e'];
    const client = new QueryClient();
    client.setQueryData(key, { id: 'e', access: { api: true, mcp: true }, exposure: { api: true, mcp: true, answers: true } } as ContextEngineDetail);
    let hook!: ReturnType<typeof useSetContextEngineAccess>;
    function Probe() {
      hook = useSetContextEngineAccess('e');
      return null;
    }
    const root = createRoot(document.createElement('div'));
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <Probe />
        </QueryClientProvider>,
      ),
    );
    await act(() => hook.mutateAsync({ mcp: false }));
    expect(client.getQueryData<ContextEngineDetail>(key)).toMatchObject({ access: { api: true, mcp: false }, exposure: { api: true, mcp: false, answers: true } });
    act(() => root.unmount());
  });
});
