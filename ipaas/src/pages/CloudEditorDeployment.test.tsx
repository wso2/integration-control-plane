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
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CloudEditorDeployment from './CloudEditorDeployment';
import { AccessControlProvider } from '../contexts/AccessControlContext';
import { flush, renderWithScopes } from '../test/renderWithScopes';
import { DEVELOPER, VIEWER } from '../test/roles';

const provision = vi.fn(() => new Promise(() => {}));
vi.mock('../hooks/useCloudEditor', () => ({
  useGetOrCreateSampleRegistry: () => ({ mutateAsync: provision }),
  useCreateCodeServer: () => ({ mutateAsync: vi.fn() }),
  useEditorReady: () => ({}),
  useEditorKeepAlive: () => {},
}));

const editorUrl = '/editor?userId=u&orgUuid=o&orgHandle=acme&projectId=p&componentId=c&codeServerSample=%7B%22image_url%22%3A%22img%22%7D';
const editor = (
  <MemoryRouter initialEntries={[editorUrl]}>
    <CloudEditorDeployment />
  </MemoryRouter>
);

let unmount = () => {};
afterEach(() => unmount());
beforeEach(() => {
  provision.mockClear();
});

async function open(ui: ReactNode, scopes: string[]) {
  const r = await renderWithScopes(ui, scopes);
  unmount = r.unmount;
  await flush();
  return r.container;
}

describe('the Cloud Editor page, opened by URL', () => {
  it('provisions nothing for a Viewer, and says why', async () => {
    const c = await open(editor, VIEWER);
    expect(provision).not.toHaveBeenCalled();
    expect(c.textContent).toContain("Your role can't open the Cloud Editor.");
  });

  it('provisions for a Developer', async () => {
    await open(editor, DEVELOPER);
    expect(provision).toHaveBeenCalledTimes(1);
  });

  it('waits for the permissions to load', async () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () =>
      root.render(
        <QueryClientProvider client={new QueryClient()}>
          <AccessControlProvider>{editor}</AccessControlProvider>
        </QueryClientProvider>,
      ),
    );
    unmount = () => act(() => root.unmount());
    expect(provision).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain("Your role can't");
  });
});
