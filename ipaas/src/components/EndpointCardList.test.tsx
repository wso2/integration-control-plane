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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnvEndpoint } from '../types/component';

const entry = vi.hoisted(() => ({ isEntry: true, entryEnvironmentName: 'Development' }));
vi.mock('../hooks/useEntryEnvironment', () => ({ useEntryEnvironment: () => entry }));

import { EndpointCardList } from './EndpointCardList';

const endpoint = { id: 'http', releaseId: 'r1', environmentId: 'e', displayName: 'HTTP', type: 'HTTP', visibility: 'Public', networkVisibilities: ['Project', 'Public'] } as EnvEndpoint;

let container: HTMLDivElement;
let root: Root;

async function render(aiGatewayUrls?: Record<string, string>, aiGatewayPending = false): Promise<void> {
  await act(async () =>
    root.render(<EndpointCardList endpoints={[{ ...endpoint, publicUrl: 'https://raw-route.example.com/orders' }]} projectId="p" envId="e" onEdit={() => {}} onSettings={() => {}} aiGatewayUrls={aiGatewayUrls} aiGatewayPending={aiGatewayPending} />),
  );
}

const button = (label: string) => container.querySelector(`[aria-label="${label}"]`);

describe('EndpointCardList', () => {
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it('offers visibility and API settings in the entry environment', async () => {
    entry.isEntry = true;
    await render();
    expect(button('Edit endpoint')).not.toBeNull();
    expect(button('API settings')).not.toBeNull();
    expect(container.textContent).not.toContain('Promote to apply them here');
  });

  it('offers neither elsewhere and names the entry environment', async () => {
    entry.isEntry = false;
    await render();
    expect(button('Edit endpoint')).toBeNull();
    expect(button('API settings')).toBeNull();
    expect(container.textContent).toContain('managed in Development. Promote to apply them here.');
  });

  it('offers neither for an endpoint on the AI gateway, and shows its proxy as the only Public URL', async () => {
    entry.isEntry = true;
    await render({ http: 'https://gw.example.com/default/orders-mcp/mcp' });
    expect(button('Edit endpoint')).toBeNull();
    expect(button('API settings')).toBeNull();
    expect(container.textContent).toContain('https://gw.example.com/default/orders-mcp/mcp');
    expect(container.textContent).toContain('Served publicly through the AI gateway.');
    expect(container.textContent).not.toContain('raw-route.example.com');
    expect(container.textContent).not.toContain('Visibility');
  });

  it('names no entry environment for AI gateway endpoints, which no environment edits', async () => {
    entry.isEntry = false;
    await render({ http: '' });
    expect(container.textContent).not.toContain('Promote to apply them here');
    expect(container.textContent).toContain('Not published on the AI gateway yet.');
  });

  it('offers neither, and shows no URL, while it is not yet known whether the AI gateway fronts the endpoint', async () => {
    entry.isEntry = true;
    await render({}, true);
    expect(button('Edit endpoint')).toBeNull();
    expect(button('API settings')).toBeNull();
    expect(container.textContent).not.toContain('raw-route.example.com');
  });

  it("shows the endpoint's own URLs once the AI gateway is known not to front it", async () => {
    entry.isEntry = true;
    await render({}, false);
    expect(container.textContent).toContain('raw-route.example.com');
  });

  it('names no entry environment while it is not yet known whether the AI gateway fronts the endpoint', async () => {
    entry.isEntry = false;
    await render({}, true);
    expect(container.textContent).not.toContain('Promote to apply them here');
  });
});
