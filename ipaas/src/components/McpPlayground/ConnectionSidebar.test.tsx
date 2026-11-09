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
import ConnectionSidebar from './ConnectionSidebar';

let container: HTMLDivElement;
let root: Root;

const proxyUrl = 'https://gw.example.com/demo/orders-mcp/mcp';

async function render(props: Partial<Parameters<typeof ConnectionSidebar>[0]>): Promise<void> {
  await act(async () => root.render(<ConnectionSidebar url={proxyUrl} token="" status="disconnected" onConnect={() => {}} onDisconnect={() => {}} onReconnect={() => {}} {...props} />));
}

const connectButton = () => Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Connect')) as HTMLButtonElement | undefined;

describe('ConnectionSidebar', () => {
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

  it('waits for a token before connecting', async () => {
    await render({});
    expect(container.querySelector('[aria-label="Show token"]')).not.toBeNull();
    expect(connectButton()?.disabled).toBe(true);
  });

  it('connects without a token when keyless, and says the calls skip the AI gateway', async () => {
    const onConnect = vi.fn();
    await render({ keyless: true, visibility: 'Public', onConnect });
    expect(container.querySelector('[aria-label="Show token"]')).toBeNull();
    expect(container.textContent).toContain('not through the AI gateway');
    expect((container.querySelector('input[value="Public"]') as HTMLInputElement | null)?.readOnly).toBe(true);
    expect((container.querySelector(`input[value="${proxyUrl}"]`) as HTMLInputElement | null)?.readOnly).toBe(true);
    const button = connectButton();
    expect(button?.disabled).toBe(false);
    await act(async () => button?.click());
    expect(onConnect).toHaveBeenCalledOnce();
  });

  it('connects through the relay before the AI gateway has given the server a URL', async () => {
    await render({ keyless: true, url: '' });
    expect(connectButton()?.disabled).toBe(false);
    expect(container.querySelector('input[placeholder="Not published on the AI gateway yet"]')).not.toBeNull();
  });
});
