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
import AutoRefreshToggle from './AutoRefreshToggle';
import { autoRefreshEnabled } from './autoRefresh';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLDivElement;

async function mountToggle(client: QueryClient, props: { updatedAt?: number; scopeId?: string } = { updatedAt: Date.now() }) {
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <AutoRefreshToggle {...props} />
      </QueryClientProvider>,
    ),
  );
  const toggle = container.querySelector<HTMLInputElement>('input[type="checkbox"]');
  if (!toggle) throw new Error('expected the switch');
  return toggle;
}

beforeEach(() => {
  localStorage.clear();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe('AutoRefreshToggle', () => {
  it('starts on, and switching it off is remembered', async () => {
    const toggle = await mountToggle(new QueryClient());
    expect(toggle.checked).toBe(true);
    await act(async () => toggle.click());
    expect(toggle.checked).toBe(false);
    expect(autoRefreshEnabled()).toBe(false);
  });

  it('refetches workflow data at once when switched back on', async () => {
    localStorage.setItem('icp:wf.autoRefresh', 'off');
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const toggle = await mountToggle(client);
    expect(toggle.checked).toBe(false);

    await act(async () => toggle.click());
    expect(autoRefreshEnabled()).toBe(true);
    expect(invalidate).toHaveBeenCalledTimes(1);
    const { predicate } = invalidate.mock.calls[0][0] as unknown as { predicate: (q: { queryKey: unknown[] }) => boolean };
    expect(predicate({ queryKey: ['wf', 's', 'instances'] })).toBe(true);
    expect(predicate({ queryKey: ['endpoint-security', 'c'] })).toBe(false);
  });

  it('says when the view was last updated', async () => {
    await mountToggle(new QueryClient());
    expect(container.textContent).toMatch(/Updated /);
  });

  it('follows the latest read of the connection when the view names no time of its own', async () => {
    const client = new QueryClient();
    await mountToggle(client, { scopeId: 'scope-1' });
    expect(container.textContent).not.toMatch(/Updated /);

    await act(async () => {
      client.setQueryData(['wf', 'other-scope', 'definitions'], []);
    });
    expect(container.textContent).not.toMatch(/Updated /);

    await act(async () => {
      client.setQueryData(['wf', 'scope-1', 'instances', {}], { pages: [] });
    });
    expect(container.textContent).toMatch(/Updated /);
  });
});
