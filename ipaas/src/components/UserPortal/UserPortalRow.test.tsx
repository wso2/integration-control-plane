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
import UserPortalRow from './UserPortalRow';
import { BffError } from '../../api/_client';
import * as api from '../../api/userPortal';
import { button, flush, reasonFor, renderWithScopes } from '../../test/renderWithScopes';
import { DEVELOPER, PLATFORM_ENGINEER, VIEWER } from '../../test/roles';
import type { UserPortalPublishability } from '../../types/userPortal';

vi.mock('../../api/userPortal', () => ({
  fetchUserPortalPublishability: vi.fn(),
  publishToUserPortal: vi.fn(),
  unpublishFromUserPortal: vi.fn(),
}));

const publishability = vi.mocked(api.fetchUserPortalPublishability);
const publish = vi.mocked(api.publishToUserPortal);

const refused: UserPortalPublishability = {
  environment: 'production',
  published: false,
  publishable: false,
  reasons: [
    { code: 'USER_PORTAL_PIPELINE', message: 'only integrations of projects on the "default" deployment pipeline can be published to the User Portal' },
    { code: 'USER_PORTAL_AGENT_OAUTH_REQUIRED', message: 'turn on OAuth security for the agent' },
  ],
};

const portalOff: UserPortalPublishability = {
  ...refused,
  reasons: [...refused.reasons, { code: 'USER_PORTAL_NOT_ENABLED', message: 'the user portal is not enabled in this environment' }],
};

let unmount = () => {};
afterEach(() => unmount());
beforeEach(() => vi.clearAllMocks());

async function row(scopes: string[]) {
  const r = await renderWithScopes(
    <MemoryRouter>
      <UserPortalRow orgHandler="acme" componentId="orders" environment="production" envName="Production" />
    </MemoryRouter>,
    scopes,
  );
  unmount = r.unmount;
  await flush();
  return r.container;
}

describe("the deploy card's User Portal row", () => {
  it('blocks a publish the rules refuse, saying every reason', async () => {
    publishability.mockResolvedValue(refused);
    const container = await row(DEVELOPER);
    expect(button(container, 'Publish')?.disabled).toBe(true);
    // Each is worded from its code, not ipaas-service's sentence.
    expect(container.textContent).toContain('Only integrations of projects on the default deployment pipeline can be published to the User Portal.');
    expect(container.textContent).toContain('Turn on OAuth security for the agent.');
    for (const reason of refused.reasons) expect(container.textContent).not.toContain(reason.message);
    expect(publish).not.toHaveBeenCalled();
  });

  // No other rule can be met before the portal runs, so the row doesn't list them.
  it('says only that the portal is off, with a link to turn it on', async () => {
    publishability.mockResolvedValue(portalOff);
    const container = await row(PLATFORM_ENGINEER);
    expect(container.textContent).toContain('User Portal is off here');
    expect(container.textContent).not.toContain('default deployment pipeline');
    expect(container.textContent).not.toContain('Not published');
    expect(button(container, 'Publish')).toBeUndefined();
    const link = container.querySelector('a');
    expect(link?.textContent).toBe('Enable');
    expect(link?.getAttribute('href')).toBe('/organizations/acme/settings/user-portal');
  });

  it('explains the User Portal from the (i), and asks a role that cannot enable it to ask an admin', async () => {
    publishability.mockResolvedValue(portalOff);
    const container = await row(DEVELOPER);
    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).toContain('Ask an admin to turn it on.');
    await act(async () => button(container, 'About the User Portal')?.click());
    const dialog = container.ownerDocument.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain('Turn it on in Production to publish this integration there.');
    expect(dialog?.textContent).toContain('Ask an admin to turn it on.');
    expect(button(container, 'Enable User Portal')).toBeUndefined();
  });

  it('publishes when the rules pass, and reports scopes the portal could not take', async () => {
    publishability.mockResolvedValue({ environment: 'production', published: false, publishable: true, reasons: [] });
    publish.mockResolvedValue({ environment: 'production', published: true, rejectedScopes: ['bad scope'] });
    const container = await row(DEVELOPER);
    const b = button(container, 'Publish');
    expect(b?.disabled).toBe(false);
    await act(async () => b?.click());
    await flush();
    expect(publish).toHaveBeenCalledWith('orders', 'production');
    expect(container.textContent).toContain('bad scope');
  });

  it("tells a role that can't deploy why it can't publish", async () => {
    publishability.mockResolvedValue({ environment: 'production', published: false, publishable: true, reasons: [] });
    const container = await row(VIEWER);
    const b = button(container, 'Publish');
    expect(b?.disabled).toBe(true);
    expect(reasonFor(b)).toBe("Your role can't publish integrations to the User Portal.");
  });

  it('offers Unpublish for a published integration, with no reasons', async () => {
    publishability.mockResolvedValue({ ...refused, published: true });
    const container = await row(DEVELOPER);
    expect(container.textContent).toContain('Published');
    expect(button(container, 'Unpublish')?.disabled).toBe(false);
    expect(container.textContent).not.toContain('default deployment pipeline');
  });

  // With nothing deployed, every rule about what runs there fails too; deploying is the one fix.
  it('asks for a deployment first, not for what follows from one', async () => {
    publishability.mockResolvedValue({
      environment: 'production',
      published: false,
      publishable: false,
      reasons: [
        { code: 'USER_PORTAL_NOT_DEPLOYED', message: 'the integration is not deployed in this environment; deploy it first' },
        { code: 'USER_PORTAL_NO_MANAGEMENT_API', message: 'the workflow has no Workflow Management API endpoint deployed in this environment' },
        { code: 'USER_PORTAL_NO_PUBLIC_ENDPOINT', message: 'the endpoint the User Portal calls is not exposed publicly in this environment; expose it first' },
      ],
    });
    const container = await row(DEVELOPER);
    expect(button(container, 'Publish')?.disabled).toBe(true);
    const reasons = container.querySelector('[role="group"]');
    expect(reasons?.textContent).toBe('Deploy it to Production first. The User Portal lists only what runs there.');
  });

  it('words a refused publish from its code', async () => {
    publishability.mockResolvedValue({ environment: 'production', published: false, publishable: true, reasons: [] });
    publish.mockRejectedValue(new BffError(409, '{"code":"USER_PORTAL_NOT_DEPLOYED","message":"the integration is not deployed in this environment; deploy it first"}'));
    const container = await row(DEVELOPER);
    await act(async () => button(container, 'Publish')?.click());
    await flush();
    expect(container.textContent).toContain('Deploy it to Production first.');
    expect(container.textContent).not.toContain('deploy it first');
  });

  it('shows nothing where the BFF serves no User Portal', async () => {
    publishability.mockRejectedValue(new BffError(404, '404 page not found'));
    const container = await row(DEVELOPER);
    expect(container.textContent).toBe('');
  });
});
