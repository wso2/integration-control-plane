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
import { useMcpConnection, type UseMcpConnectionResult } from './useMcpConnection';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Each client the hook creates; `connect` resolves when the test says so. */
const clients = vi.hoisted(() => [] as { connect: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn>; getServerCapabilities: () => null; open: () => void }[]);

vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: class {},
}));
vi.mock('../utils/mcp', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../utils/mcp')>()),
  createMcpClient: () => {
    let open: () => void = () => undefined;
    const client = {
      connect: vi.fn(() => new Promise<void>((resolve) => (open = resolve))),
      close: vi.fn(() => Promise.resolve()),
      getServerCapabilities: () => null,
      open: () => open(),
    };
    clients.push(client);
    return client;
  },
}));

let root: Root;
let conn: UseMcpConnectionResult;

function Harness({ token }: { token: string | null }): null {
  conn = useMcpConnection({ url: 'https://gw.example/mcp', token, headerName: 'X-API-Key' });
  return null;
}

const show = (token: string | null) => act(() => root.render(<Harness token={token} />));

async function connectWith(token: string): Promise<void> {
  show(token);
  await act(async () => void conn.connect());
  await act(async () => clients[clients.length - 1].open());
}

beforeEach(() => {
  clients.length = 0;
  root = createRoot(document.createElement('div'));
});

afterEach(() => act(() => root.unmount()));

describe('useMcpConnection', () => {
  it('keeps the connection while the token stays the same', async () => {
    await connectWith('key-a');
    expect(conn.status).toBe('connected');
    show('key-a');
    expect(conn.status).toBe('connected');
    expect(clients[0].close).not.toHaveBeenCalled();
  });

  it('disconnects when the token changes, so the next connection carries the new one', async () => {
    await connectWith('key-a');
    await act(async () => show('key-b'));
    expect(conn.status).toBe('disconnected');
    expect(clients[0].close).toHaveBeenCalled();
  });

  it('drops an attempt still connecting with the old token', async () => {
    show('key-a');
    await act(async () => void conn.connect());
    expect(conn.status).toBe('connecting');
    await act(async () => show('key-b'));
    expect(conn.status).toBe('disconnected');
    // The old attempt finishes after the change: it is closed, not published.
    await act(async () => clients[0].open());
    expect(conn.status).toBe('disconnected');
    expect(clients[0].close).toHaveBeenCalled();
  });
});
