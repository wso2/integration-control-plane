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
import TestKeyNotice from './TestKeyNotice';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

const NOT_EXPOSED = { severity: 'info' as const, text: 'The Workflow Management API isn’t exposed on the gateway yet.' };

describe('TestKeyNotice', () => {
  it('says why the view cannot be shown, at the notice’s severity', async () => {
    await act(async () => root.render(<TestKeyNotice notice={NOT_EXPOSED} />));
    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toBe(NOT_EXPOSED.text);
    expect(alert?.className).toMatch(/Info/);
    expect(container.querySelector('button')).toBeNull();
  });

  it('offers what can be done about it here', async () => {
    const run = vi.fn();
    await act(async () => root.render(<TestKeyNotice notice={{ severity: 'warning', text: 'Could not mint a test key.' }} action={{ label: 'Retry', run, pending: false }} />));
    const button = container.querySelector('button');
    expect(button?.textContent).toBe('Retry');
    await act(async () => button?.click());
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('opens a page it links to in a new tab, from a button under the text', async () => {
    await act(async () => root.render(<TestKeyNotice notice={NOT_EXPOSED} action={{ label: 'Open User Portal', href: 'https://portal.example/acme' }} />));
    const link = container.querySelector('a');
    expect(link?.textContent).toBe('Open User Portal');
    expect(link?.getAttribute('href')).toBe('https://portal.example/acme');
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link?.className).toMatch(/MuiButton-contained/);
    expect(container.querySelector('.MuiAlert-action')).toBeNull();
  });

  it('holds the action while it runs', async () => {
    await act(async () => root.render(<TestKeyNotice notice={NOT_EXPOSED} action={{ label: 'Get test key', run: vi.fn(), pending: true }} />));
    expect(container.querySelector('button')?.disabled).toBe(true);
  });
});
