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
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Scopes } from '../../../../constants/permissions';
import { UnsavedChangesProvider } from '../../../../contexts/UnsavedChangesContext';
import { button, renderWithScopes } from '../../../../test/renderWithScopes';
import MockTokensPanel from './MockTokensPanel';

type Callbacks<T> = { onSuccess?: (result: T) => void };

const create = vi.hoisted(() => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false, error: null }));
const revoke = vi.hoisted(() => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false, error: null }));
vi.mock('../../../../hooks/useContextEngine', () => ({
  useContextApiKeys: () => ({ data: [{ name: 'key-old', displayName: 'support-bot', maskedKey: '****', status: 'active' }], isLoading: false, isError: false }),
  useCreateContextApiKey: () => create,
  useRevokeContextApiKey: () => revoke,
}));

let unmount = () => {};

async function render(): Promise<void> {
  const r = await renderWithScopes(
    <MemoryRouter>
      <UnsavedChangesProvider>
        <MockTokensPanel engineId="docs" />
      </UnsavedChangesProvider>
    </MemoryRouter>,
    [Scopes.INTEGRATION_READ, Scopes.CONFIG_MANAGE],
  );
  unmount = r.unmount;
}

const click = (name: string) => act(() => button(document.body, name)?.click());

beforeEach(() => {
  create.mutate.mockReset();
  revoke.mutate.mockReset();
});
afterEach(() => unmount());

describe('MockTokensPanel', () => {
  it('after a failed revoke, retries only the revoke of the old token and issues no second key', async () => {
    await render();
    click('Manage');
    click('Regenerate');
    click('Regenerate token');
    expect(create.mutate).toHaveBeenCalledTimes(1);
    const [, created] = create.mutate.mock.calls[0] as [unknown, Callbacks<{ keyId: string; apiKey: string }>];
    // The new key is issued; revoking the old one then fails, so its onSuccess never runs.
    act(() => created.onSuccess?.({ keyId: 'key-new', apiKey: 'secret' }));
    expect(revoke.mutate).toHaveBeenLastCalledWith('key-old', expect.anything());

    expect(button(document.body, 'Cancel')?.disabled).toBe(true);
    click('Revoke old token');
    expect(create.mutate).toHaveBeenCalledTimes(1);
    expect(revoke.mutate).toHaveBeenCalledTimes(2);
    expect(revoke.mutate).toHaveBeenLastCalledWith('key-old', expect.anything());

    const [, revoked] = revoke.mutate.mock.calls[1] as [string, Callbacks<void>];
    act(() => revoked.onSuccess?.());
    expect(button(document.body, 'Revoke old token')).toBeUndefined();
  });

  it('asks before closing the create form with a name typed, and keeps the name on Stay', async () => {
    await render();
    click('New token');
    const field = document.body.querySelector<HTMLInputElement>('input[required]');
    expect(field).not.toBeNull();
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(field, 'billing-agent');
      field?.dispatchEvent(new Event('input', { bubbles: true }));
    });
    click('Cancel');
    expect(document.body.textContent).toContain('Leave this page?');
    click('Stay on page');
    expect(document.body.querySelector<HTMLInputElement>('input[required]')?.value).toBe('billing-agent');
  });
});
