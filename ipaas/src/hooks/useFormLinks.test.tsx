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
import { useCreateResourceLink, useDeleteResourceLink, useFormLinks } from './useConfiguration';
import type { ResourceLink, ResourceLinkWrite } from '../types/configuration';

// What ipaas-service answers: the stored link, and what development's release carries, which OpenChoreo changes after the write.
const server = vi.hoisted(() => ({ linked: false, inRelease: false, workload: 'updated' as ResourceLinkWrite['workload'], reads: 0 }));
const links = (): ResourceLink[] =>
  server.linked || server.inRelease
    ? [
        {
          resourceType: 'salesforce-sales',
          connection: 'acme.sfdemo.sfSales',
          linked: server.linked,
          environments: [
            {
              name: 'development',
              inRelease: server.inRelease,
              hasValues: true,
              connectionInBuild: true,
              configurables: server.inRelease ? { 'acme.sfdemo.sfSalesBaseUrl': 'BASE_URL' } : {},
              ...(server.inRelease && { connection: 'acme.sfdemo.sfSales' }),
            },
          ],
        },
      ]
    : [];
vi.mock('../api/configuration', () => ({
  fetchResourceLinks: async () => {
    server.reads++;
    return JSON.parse(JSON.stringify(links()));
  },
  createResourceLink: async () => {
    server.linked = true;
    return { resourceType: 'salesforce-sales', connection: 'acme.sfdemo.sfSales', workload: server.workload, environmentsWithoutValues: [] };
  },
  deleteResourceLink: async () => {
    server.linked = false;
    return { resourceType: 'salesforce-sales', workload: server.workload, environmentsWithoutValues: [] };
  },
}));

let container: HTMLDivElement;
let root: Root;
let link: ReturnType<typeof useCreateResourceLink>;
let unlink: ReturnType<typeof useDeleteResourceLink>;

function Form() {
  const { linkedFrom } = useFormLinks('default', 'sfdemo', 'development', true);
  link = useCreateResourceLink();
  unlink = useDeleteResourceLink();
  return <span>{[...linkedFrom.keys()].join()}</span>;
}

const wait = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));
const linkedFields = () => container.textContent;

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  focusManager.setFocused(true);
  Object.assign(server, { linked: false, inRelease: false, workload: 'updated', reads: 0 });
  container = document.createElement('div');
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
});

const open = async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () =>
    root.render(
      <QueryClientProvider client={qc}>
        <Form />
      </QueryClientProvider>,
    ),
  );
  await wait(0);
};

describe('an open Configure form', () => {
  it('shows a linked field read-only once development runs the release that carries the link', async () => {
    await open();
    await act(() => link.mutateAsync({ projectId: 'default', componentId: 'sfdemo', resourceType: 'salesforce-sales', connection: 'acme.sfdemo.sfSales' }));
    await wait(0);
    expect(linkedFields()).toBe('');

    server.inRelease = true;
    await wait(4000);
    expect(linkedFields()).toBe('acme.sfdemo.sfSalesBaseUrl');

    const reads = server.reads;
    await wait(30_000);
    expect(server.reads).toBe(reads);
  });

  it('frees an unlinked field once development runs a release without the link', async () => {
    Object.assign(server, { linked: true, inRelease: true });
    await open();
    expect(linkedFields()).toBe('acme.sfdemo.sfSalesBaseUrl');
    await act(() => unlink.mutateAsync({ projectId: 'default', componentId: 'sfdemo', resourceType: 'salesforce-sales' }));
    await wait(0);
    expect(linkedFields()).toBe('acme.sfdemo.sfSalesBaseUrl');

    server.inRelease = false;
    await wait(4000);
    expect(linkedFields()).toBe('');
  });

  it('follows a write minutes after an earlier one', async () => {
    await open();
    await act(() => link.mutateAsync({ projectId: 'default', componentId: 'sfdemo', resourceType: 'salesforce-sales', connection: 'acme.sfdemo.sfSales' }));
    server.inRelease = true;
    await wait(4000);
    await wait(240_000);
    await act(() => unlink.mutateAsync({ projectId: 'default', componentId: 'sfdemo', resourceType: 'salesforce-sales' }));
    await wait(90_000);
    expect(linkedFields()).toBe('acme.sfdemo.sfSalesBaseUrl');

    server.inRelease = false;
    await wait(4000);
    expect(linkedFields()).toBe('');
  });

  it("doesn't wait for a release when the write leaves development's build as it is", async () => {
    server.workload = 'next_build';
    await open();
    await act(() => link.mutateAsync({ projectId: 'default', componentId: 'sfdemo', resourceType: 'salesforce-sales', connection: 'acme.sfdemo.sfSales' }));
    const reads = server.reads;
    await wait(30_000);
    expect(server.reads).toBe(reads);
  });

  it('stops waiting when development never gets the release', async () => {
    await open();
    await act(() => link.mutateAsync({ projectId: 'default', componentId: 'sfdemo', resourceType: 'salesforce-sales', connection: 'acme.sfdemo.sfSales' }));
    await wait(120_000);
    const reads = server.reads;
    await wait(30_000);
    expect(server.reads).toBe(reads);
  });
});
