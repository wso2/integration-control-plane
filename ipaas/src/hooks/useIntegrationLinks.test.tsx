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
import { BffError } from '../api/_client';
import { useIntegrationLinks, useLinksFollowDeployment, useLinkWrite } from './useConfiguration';
import type { IntegrationLinks, LinkWrite } from '../types/configuration';

// What ipaas-service answers: the stored link, and what development's release uses, which OpenChoreo changes after the write.
// `cutAfter`: the gateway answers a write 504 while ipaas-service stores it this many ms later (never, when Infinity).
const server = vi.hoisted(() => ({ linked: false, inRelease: false, workload: 'updated' as LinkWrite['workload'], reads: 0, cutAfter: 0 }));
const target = 'acme/sfdemo:sfSalesBaseUrl';
const ref = { ref: 'salesforce-sales', key: 'SALESFORCE_BASE_URL' };
const links = (): IntegrationLinks => ({
  kind: 'ballerina',
  resources: [],
  used: {},
  usedByOrphaned: {},
  connections: [],
  fieldLinks: server.linked ? { [target]: ref } : {},
  orphaned: [],
  env: {},
  environments: [{ name: 'development', deployed: true, resources: [], valuesChanged: false, linksNeedDeploy: server.linked !== server.inRelease, connections: {}, configurables: server.inRelease ? { [target]: ref } : {}, env: {} }],
});
vi.mock('../api/configuration', () => ({
  fetchIntegrationLinks: async () => {
    server.reads++;
    return links();
  },
  writeLink: async ({ target: t }: { target: { ref?: string } }) => {
    if (server.cutAfter) {
      if (server.cutAfter !== Infinity) setTimeout(() => (server.linked = !!t.ref), server.cutAfter);
      throw new BffError(504, 'upstream request timeout');
    }
    server.linked = !!t.ref;
    return { workload: server.workload };
  },
}));

let container: HTMLDivElement;
let root: Root;
let write: ReturnType<typeof useLinkWrite>;

function Form({ deployment = 'sfdemo-1' }: { deployment?: string }) {
  const { data } = useIntegrationLinks('default', 'sfdemo', true);
  useLinksFollowDeployment('default', 'sfdemo', deployment);
  write = useLinkWrite();
  return <span>{Object.keys(data?.environments[0].configurables ?? {}).join()}</span>;
}

const link = () => act(() => write.mutateAsync({ projectId: 'default', componentId: 'sfdemo', target: { configurable: target, ...ref } }));
const unlink = () => act(() => write.mutateAsync({ projectId: 'default', componentId: 'sfdemo', target: { configurable: target } }));
const wait = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));
const linkedFields = () => container.textContent;

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  focusManager.setFocused(true);
  Object.assign(server, { linked: false, inRelease: false, workload: 'updated', reads: 0, cutAfter: 0 });
  container = document.createElement('div');
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
});

const qc = { current: new QueryClient() };
const render = async (deployment?: string) => {
  await act(async () =>
    root.render(
      <QueryClientProvider client={qc.current}>
        <Form deployment={deployment} />
      </QueryClientProvider>,
    ),
  );
  await wait(0);
};
const open = async () => {
  qc.current = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render();
};

describe('an open Configure form', () => {
  it('shows a linked field read-only once development runs the release that carries the link', async () => {
    await open();
    await link();
    await wait(0);
    expect(linkedFields()).toBe('');

    server.inRelease = true;
    await wait(4000);
    expect(linkedFields()).toBe(target);

    const reads = server.reads;
    await wait(30_000);
    expect(server.reads).toBe(reads);
  });

  it('frees an unlinked field once development runs a release without the link', async () => {
    Object.assign(server, { linked: true, inRelease: true });
    await open();
    expect(linkedFields()).toBe(target);
    await unlink();
    await wait(0);
    expect(linkedFields()).toBe(target);

    server.inRelease = false;
    await wait(4000);
    expect(linkedFields()).toBe('');
  });

  it('follows a write minutes after an earlier one', async () => {
    await open();
    await link();
    server.inRelease = true;
    await wait(4000);
    await wait(240_000);
    await unlink();
    await wait(90_000);
    expect(linkedFields()).toBe(target);

    server.inRelease = false;
    await wait(4000);
    expect(linkedFields()).toBe('');
  });

  it("doesn't wait for a release when the write leaves development's Workload as it is", async () => {
    server.workload = 'no_workload';
    await open();
    await link();
    const reads = server.reads;
    await wait(30_000);
    expect(server.reads).toBe(reads);
  });

  it('stops waiting when development never gets the release', async () => {
    await open();
    await link();
    await wait(120_000);
    const reads = server.reads;
    await wait(30_000);
    expect(server.reads).toBe(reads);
  });
});

describe('a link write the gateway cuts off', () => {
  const cutLink = () => act(() => write.mutateAsync({ projectId: 'default', componentId: 'sfdemo', target: { configurable: target, ...ref } }).catch(() => undefined));
  const stored = async () => {
    await act(async () =>
      root.render(
        <QueryClientProvider client={qc.current}>
          <Stored />
        </QueryClientProvider>,
      ),
    );
    return container.textContent;
  };
  function Stored() {
    const { data } = useIntegrationLinks('default', 'sfdemo', true);
    write = useLinkWrite();
    return <span>{Object.keys(data?.fieldLinks ?? {}).join()}</span>;
  }

  it('reads the links again until they show the write, saying it is still saving', async () => {
    server.cutAfter = 4000;
    qc.current = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await stored();
    await cutLink();
    await wait(0);
    expect([write.isError, write.saving]).toEqual([true, true]);

    await wait(2000);
    expect([await stored(), write.saving]).toEqual(['', true]);
    await wait(5000);
    expect([await stored(), write.saving, write.saved]).toEqual([target, false, true]);
    const reads = server.reads;
    await wait(60_000);
    expect(server.reads).toBe(reads);
  });

  it('gives up after a few reads, leaving the error', async () => {
    server.cutAfter = Infinity;
    qc.current = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await stored();
    const reads = server.reads;
    await cutLink();
    await wait(40_000);
    expect([write.isError, write.saving, write.saved, server.reads - reads]).toEqual([true, false, false, 4]);
  });

  it('stops reading once a later write to the same target replaces it', async () => {
    server.cutAfter = Infinity;
    qc.current = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await stored();
    await cutLink();
    server.cutAfter = 0;
    const reads = server.reads;
    await act(() => write.mutateAsync({ projectId: 'default', componentId: 'sfdemo', target: { configurable: target } }));
    await wait(40_000);
    // Only the read after the unlink.
    expect(server.reads - reads).toBe(1);
  });
});

describe('an environment card', () => {
  it("reads the links again once development's deployment runs another release", async () => {
    Object.assign(server, { linked: true, workload: 'next_deploy' });
    await open();
    expect(linkedFields()).toBe('');

    server.inRelease = true;
    await render('sfdemo-2');
    expect(linkedFields()).toBe(target);
  });
});
