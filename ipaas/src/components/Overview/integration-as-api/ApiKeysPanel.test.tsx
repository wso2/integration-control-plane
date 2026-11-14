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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEndpointApiKey, getEndpointSecurity, listEndpointApiKeys } from '../../../api/consumers';
import { API_KEY_NAME_REVOKED, API_KEY_NAME_TAKEN } from '../../../constants/apiConsumption';
import { Scopes } from '../../../constants/permissions';
import { button, flush, renderWithScopes } from '../../../test/renderWithScopes';
import type { ApiKeySummary, EndpointRef } from '../../../types/consumers';
import ApiKeysPanel from './ApiKeysPanel';

vi.mock('../../../api/consumers', () => ({
  listEndpointApiKeys: vi.fn(),
  createEndpointApiKey: vi.fn(),
  revokeEndpointApiKey: vi.fn(),
  getEndpointSecurity: vi.fn(),
}));
vi.mock('../../../contexts/UnsavedChangesContext', () => ({
  useUnsavedChanges: () => () => {},
  useLeaveGuard: () => (proceed: () => void) => proceed(),
}));

const ref: EndpointRef = { componentName: 'orders', environmentName: 'development', endpointName: 'http', deploymentTrackId: 'main' };
const key = (name: string, status: string): ApiKeySummary => ({ name, displayName: name, status, maskedApiKey: '****' }) as ApiKeySummary;

let unmount = () => {};
afterEach(() => unmount());
beforeEach(() => {
  vi.mocked(listEndpointApiKeys).mockResolvedValue([key('billing', 'active'), key('legacy', 'revoked'), key('old-batch', 'expired')]);
  vi.mocked(getEndpointSecurity).mockResolvedValue({ mode: 'api-key' } as never);
  vi.mocked(createEndpointApiKey).mockReset().mockResolvedValue({ keyId: 'k1', displayName: 'reports', apiKey: 'plaintext-secret' });
});

async function render() {
  const view = await renderWithScopes(<ApiKeysPanel endpointRef={ref} envLabel="Development" oauth={false} />, [Scopes.ENDPOINT_API_KEY_MANAGE]);
  unmount = view.unmount;
  await flush();
  return view.container;
}

const rowNames = (container: HTMLElement) => [...container.querySelectorAll('[role="list"][aria-label="API keys"] [role="listitem"]')].map((row) => row.querySelector('p')?.textContent);

const nameInput = () => document.querySelector<HTMLInputElement>('input[placeholder="e.g. billing-service"]')!;

async function typeName(value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(nameInput(), value);
    nameInput().dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function click(el: HTMLElement | undefined) {
  expect(el).toBeDefined();
  await act(async () => el!.click());
  await flush();
}

describe('ApiKeysPanel', () => {
  it('lists live keys and keeps revoked ones behind a toggle', async () => {
    const container = await render();
    expect(rowNames(container)).toEqual(['billing']);
    expect(container.textContent).toContain('(1)');

    await click(button(container, 'Show revoked keys (2)'));
    expect(rowNames(container)).toEqual(['billing', 'legacy', 'old-batch']);

    await click(button(container, 'Hide revoked keys'));
    expect(rowNames(container)).toEqual(['billing']);
  });

  it('refuses a name a live or a revoked key holds', async () => {
    const container = await render();
    await click(button(container, 'Generate API key'));

    await typeName('Billing');
    expect(document.body.textContent).toContain(API_KEY_NAME_TAKEN);
    expect(button(container, 'Generate')?.disabled).toBe(true);

    await typeName('legacy');
    expect(document.body.textContent).toContain(API_KEY_NAME_REVOKED);
    expect(button(container, 'Generate')?.disabled).toBe(true);

    await typeName('reports');
    expect(button(container, 'Generate')?.disabled).toBe(false);
  });

  it('opens empty after a key was issued', async () => {
    const container = await render();
    await click(button(container, 'Generate API key'));
    await typeName('reports');
    await click(button(container, 'Generate'));
    expect(createEndpointApiKey).toHaveBeenCalledWith(ref, { displayName: 'reports' });

    await click(button(container, 'Reveal API key'));
    expect(document.body.textContent).toContain('plaintext-secret');
    await click(button(container, 'Done'));

    await click(button(container, 'Generate API key'));
    expect(nameInput().value).toBe('');
    expect(button(container, 'Reveal API key')).toBeUndefined();
  });
});
