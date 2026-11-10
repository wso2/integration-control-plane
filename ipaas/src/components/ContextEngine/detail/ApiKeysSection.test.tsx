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

import { afterEach, describe, expect, it, vi } from 'vitest';
import { Scopes } from '../../../constants/permissions';
import { button, renderWithScopes } from '../../../test/renderWithScopes';
import ApiKeysSection from './ApiKeysSection';

const key = { name: 'k1', displayName: 'Bot', maskedKey: 'ab…yz', status: 'active' };
vi.mock('../../../hooks/useContextEngine', () => ({
  useContextApiKeys: (_id: string, enabled: boolean) => ({ data: enabled ? [key] : undefined, isLoading: false, isError: false }),
  useCreateContextApiKey: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
  useRevokeContextApiKey: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
}));

let unmount = () => {};
afterEach(() => unmount());

describe('ApiKeysSection', () => {
  it('hides creating and revoking keys without the API key scope', async () => {
    const r = await renderWithScopes(<ApiKeysSection engineId="docs" />, [Scopes.ENDPOINT_READ]);
    unmount = r.unmount;
    expect(r.container.textContent).toContain('Bot');
    expect(button(r.container, 'Create key')).toBeUndefined();
    expect(button(r.container, 'Revoke Bot')).toBeUndefined();
  });

  it('shows them with the API key scope', async () => {
    const r = await renderWithScopes(<ApiKeysSection engineId="docs" />, [Scopes.ENDPOINT_READ, Scopes.ENDPOINT_API_KEY_MANAGE]);
    unmount = r.unmount;
    expect(button(r.container, 'Create key')).toBeDefined();
    expect(button(r.container, 'Revoke Bot')).toBeDefined();
  });
});
