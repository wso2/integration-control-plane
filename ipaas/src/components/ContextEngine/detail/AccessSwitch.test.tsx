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

const mutate = vi.fn();
vi.mock('../../../hooks/useContextEngine', () => ({ useSetContextEngineAccess: () => ({ mutate, isPending: false, isError: false }) }));

import AccessSwitch from './AccessSwitch';

let root: Root;
let host: HTMLDivElement;

const toggle = () => host.querySelector<HTMLInputElement>('input[aria-label="MCP access"]');
const button = (name: string) => [...document.querySelectorAll('button')].find((b) => b.textContent === name) ?? null;

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  mutate.mockReset();
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('AccessSwitch', () => {
  it('turns a surface on without asking', () => {
    act(() => root.render(<AccessSwitch engineId="e" access={{ api: true, mcp: false }} surface="mcp" />));
    act(() => toggle()?.click());
    expect(mutate).toHaveBeenCalledWith({ mcp: true });
  });

  it('asks before turning a surface off', () => {
    act(() => root.render(<AccessSwitch engineId="e" access={{ api: true, mcp: true }} surface="mcp" />));
    act(() => toggle()?.click());
    expect(mutate).not.toHaveBeenCalled();
    act(() => button('Turn off')?.click());
    expect(mutate).toHaveBeenCalledWith({ mcp: false });
  });

  it('cannot be used without permission', () => {
    act(() => root.render(<AccessSwitch engineId="e" access={{ api: true, mcp: true }} surface="mcp" disabledReason="No" />));
    expect(toggle()?.disabled).toBe(true);
  });
});
