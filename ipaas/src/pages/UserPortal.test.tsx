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
import UserPortal from './UserPortal';
import * as api from '../api/userPortal';
import { button, flush, renderWithScopes } from '../test/renderWithScopes';
import { PLATFORM_ENGINEER } from '../test/roles';
import type { Environment } from '../types/environment';
import type { UserPortal as Portal } from '../types/userPortal';

vi.mock('../api/userPortal', () => ({
  fetchUserPortalEnvironments: vi.fn(),
  fetchUserPortal: vi.fn(),
  enableUserPortal: vi.fn(),
  disableUserPortal: vi.fn(),
}));
// The Configure tabs read the route; this page's behaviour doesn't depend on them.
vi.mock('../components/Settings/OrgConfigureTabs', () => ({ default: () => null }));

const env = (id: string): Environment => ({ id, name: id, critical: false });

let unmount = () => {};
afterEach(() => unmount());
beforeEach(() => vi.clearAllMocks());

describe('the User Portal page', () => {
  // Opening the dialog resets its enable; a retry sharing that enable lost its callbacks and
  // stayed on "Retrying…" with no notice.
  it('finishes a retry while the Enable dialog opens', async () => {
    vi.mocked(api.fetchUserPortalEnvironments).mockResolvedValue([env('dev'), env('prod')]);
    vi.mocked(api.fetchUserPortal).mockImplementation(async (environment) => (environment === 'dev' ? { environment, state: 'failed', error: 'portal: readiness timed out' } : { environment, state: 'not-enabled' }));
    let finishRetry: (portal: Portal) => void = () => {};
    vi.mocked(api.enableUserPortal).mockImplementation(() => new Promise<Portal>((resolve) => (finishRetry = resolve)));

    const r = await renderWithScopes(<UserPortal level="organizations" org="acme" />, PLATFORM_ENGINEER);
    unmount = r.unmount;
    // The portals are read once the environments are.
    for (let i = 0; i < 5 && !button(r.container, 'Retry setup'); i++) await flush();

    await act(async () => button(r.container, 'Retry setup')?.click());
    await flush();
    expect(button(r.container, 'Retrying…')).toBeDefined();
    await act(async () => button(r.container, 'Enable User Portal')?.click());
    await flush();
    // The dialog's own Enable isn't the one running.
    expect(button(r.container, 'Enable')?.disabled).toBe(false);

    await act(async () => finishRetry({ environment: 'dev', state: 'setting-up' }));
    await flush();
    expect(button(r.container, 'Retrying…')).toBeUndefined();
    expect(document.body.textContent).toContain('Retrying the User Portal setup.');
  });
});
