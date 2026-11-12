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
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchEnvironmentIdentityProvider } from '../../../api/environments';
import { button, flush, renderWithScopes } from '../../../test/renderWithScopes';
import type { SecurityConfig } from '../../../types/consumers';
import OAuthClientsPanel from './OAuthClientsPanel';

vi.mock('../../../api/environments', () => ({ fetchEnvironmentIdentityProvider: vi.fn() }));
vi.mock('../../../api/projects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../api/projects')>()),
  fetchProject: vi.fn(async () => ({ id: 'orders', name: 'Orders Team', handler: 'orders' })),
}));

const security = { mode: 'jwt', jwt: {}, editable: true } as SecurityConfig;
const NOT_READY = 'isn’t ready in this environment yet';

let unmount = () => {};
afterEach(() => unmount());

async function openGuide(config: SecurityConfig = security) {
  const view = await renderWithScopes(<OAuthClientsPanel envName="development" envLabel="Development" projectId="orders" security={config} />, []);
  unmount = view.unmount;
  await act(async () => button(view.container, 'How to call this API')!.click());
  return view.container;
}

/** The guide's own text: the drawer renders in a portal, outside the panel. */
const guideText = (container: HTMLElement) =>
  [...document.body.querySelectorAll('[role="presentation"]')]
    .filter((el) => !container.contains(el))
    .map((el) => el.textContent)
    .join(' ');

describe('OAuthGuideDrawer', () => {
  it('does not report a platform still being read as not ready', async () => {
    vi.mocked(fetchEnvironmentIdentityProvider).mockReturnValue(new Promise(() => {}));
    const container = await openGuide();
    expect(guideText(container)).not.toContain(NOT_READY);
  });

  it('reports a failed read as one, with a retry', async () => {
    vi.mocked(fetchEnvironmentIdentityProvider).mockRejectedValue(new Error('boom'));
    const container = await openGuide();
    await flush();
    const text = guideText(container);
    expect(text).not.toContain(NOT_READY);
    expect(text).toContain('Retry');
  });

  it('says the platform is not ready only when the read says so', async () => {
    vi.mocked(fetchEnvironmentIdentityProvider).mockResolvedValue({ available: false });
    const container = await openGuide();
    await flush();
    expect(guideText(container)).toContain(NOT_READY);
  });

  it('creates the client in the integration’s project and deploys it to the environment', async () => {
    vi.mocked(fetchEnvironmentIdentityProvider).mockResolvedValue({ available: false });
    const container = await openGuide();
    await flush();
    const text = guideText(container);
    expect(text).toContain('select the Orders Team project in the header');
    expect(text).toContain('Backend service');
    expect(text).toContain('Deploy it to Development');
    expect(text).toContain('Variables & secrets');
    expect(text).not.toContain('select the Development environment');
  });

  it('asks for a token for the API its scopes belong to', async () => {
    vi.mocked(fetchEnvironmentIdentityProvider).mockResolvedValue({ available: false });
    const scoped = { ...security, jwt: { audiences: ['https://orders.example'], operations: { 'GET /orders': { allOf: ['orders:read'] } } } } as SecurityConfig;
    const container = await openGuide(scoped);
    await flush();
    const text = guideText(container);
    expect(text).toContain("-d 'resource=https://orders.example'");
    expect(text).toContain('Roles');
  });

  it('shows the endpoints of a ready platform', async () => {
    vi.mocked(fetchEnvironmentIdentityProvider).mockResolvedValue({ available: true, issuer: 'https://idp.example', tokenEndpoint: 'https://idp.example/oauth2/token' });
    const container = await openGuide();
    await flush();
    expect(guideText(container)).toContain('https://idp.example/oauth2/token');
  });
});
