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
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import ConnectionAlert, { relayErrorMessage } from './ConnectionAlert';

let container: HTMLDivElement;
let root: Root;

describe('ConnectionAlert', () => {
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

  it('puts a refusal down to the test key when one is used', async () => {
    await act(async () => root.render(<ConnectionAlert error="HTTP 403" errorKind="auth" onGetTestKey={() => {}} />));
    expect(container.textContent).toContain('test key was rejected');
    expect(container.textContent).toContain('New key');
  });

  it('never mentions a key when the connection takes none', async () => {
    await act(async () => root.render(<ConnectionAlert error="HTTP 403" errorKind="auth" keyless />));
    expect(container.textContent).toContain('Not permitted');
    expect(container.textContent).toContain('not be allowed to test endpoints');
    expect(container.textContent).not.toMatch(/key/i);
  });

  it('shows a key-free connection its other failures as they are', async () => {
    await act(async () => root.render(<ConnectionAlert error="the MCP server did not answer" errorKind="other" keyless />));
    expect(container.textContent).toContain('the MCP server did not answer');
  });
});

describe('relayErrorMessage', () => {
  it("reads ipaas-service's message out of the SDK's error", () => {
    const raw = 'Streamable HTTP error: Error POSTing to endpoint (HTTP 502): {"error":"Bad Gateway","code":"MCP_SERVER_REFUSED","message":"the MCP server refused the request"}';
    expect(relayErrorMessage(raw)).toBe('the MCP server refused the request');
  });

  it('keeps an error with no readable body as it is', () => {
    expect(relayErrorMessage('Failed to fetch')).toBe('Failed to fetch');
    expect(relayErrorMessage('HTTP 502: {not json')).toBe('HTTP 502: {not json');
  });
});
