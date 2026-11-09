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
import UserPortalAction from './UserPortalAction';
import { BffError } from '../../api/_client';
import * as api from '../../api/userPortal';
import { button, flush, reasonFor, renderWithScopes } from '../../test/renderWithScopes';
import { DEVELOPER, PLATFORM_ENGINEER, VIEWER } from '../../test/roles';
import type { UserPortalPublishability } from '../../types/userPortal';

vi.mock('../../api/userPortal', () => ({
  fetchUserPortal: vi.fn(),
  fetchUserPortalPublishability: vi.fn(),
  publishToUserPortal: vi.fn(),
  unpublishFromUserPortal: vi.fn(),
}));

// Whether the card's environment is where the project's API security is edited.
const entry = vi.hoisted(() => ({ value: { isEntry: true, loading: false, entryEnvironmentName: 'Development' } }));
vi.mock('../../hooks/useEntryEnvironment', () => ({ useEntryEnvironment: () => entry.value }));

const publishability = vi.mocked(api.fetchUserPortalPublishability);
const portal = vi.mocked(api.fetchUserPortal);
const publish = vi.mocked(api.publishToUserPortal);
const unpublish = vi.mocked(api.unpublishFromUserPortal);
const onNotify = vi.fn();

const refused: UserPortalPublishability = {
  environment: 'production',
  published: false,
  publishable: false,
  redeploys: false,
  reasons: [{ code: 'USER_PORTAL_PIPELINE', message: 'only integrations of projects on the "default" deployment pipeline can be published to the User Portal' }],
};

const portalOff: UserPortalPublishability = {
  ...refused,
  reasons: [...refused.reasons, { code: 'USER_PORTAL_NOT_ENABLED', message: 'the user portal is not enabled in this environment' }],
};

const publishable: UserPortalPublishability = { environment: 'production', published: false, publishable: true, reasons: [], redeploys: false };

let unmount = () => {};
afterEach(() => unmount());
beforeEach(() => {
  vi.clearAllMocks();
  entry.value = { isEntry: true, loading: false, entryEnvironmentName: 'Development' };
});

async function action(scopes: string[], isWorkflow = false) {
  const r = await renderWithScopes(
    <MemoryRouter>
      <UserPortalAction orgHandler="acme" projectId="shop" componentId="orders" environment="production" envName="Production" onNotify={onNotify} isWorkflow={isWorkflow} />
    </MemoryRouter>,
    scopes,
  );
  unmount = r.unmount;
  await flush();
  return r.container;
}

const dialog = (container: HTMLElement) => container.ownerDocument.querySelector('[role="dialog"]');
const toggle = (container: HTMLElement) => container.querySelector<HTMLInputElement>('input[type="checkbox"]') ?? undefined;
const dialogButton = (container: HTMLElement, name: string) => [...(dialog(container)?.querySelectorAll('button') ?? [])].find((b) => b.textContent === name);

describe("the env card's User Portal action", () => {
  it('says the portal is off, and explains it with a way to turn it on', async () => {
    publishability.mockResolvedValue(portalOff);
    const container = await action(PLATFORM_ENGINEER);
    expect(toggle(container)).toBeUndefined();
    await act(async () => button(container, 'User Portal off')?.click());
    expect(dialog(container)?.textContent).toContain('Turn it on in Production to publish this integration there.');
    const link = dialog(container)?.querySelector('a');
    expect(link?.textContent).toBe('Enable User Portal');
    expect(link?.getAttribute('href')).toBe('/organizations/acme/settings/user-portal');
  });

  it('asks a role that cannot enable the portal to ask an admin', async () => {
    publishability.mockResolvedValue(portalOff);
    const container = await action(DEVELOPER);
    await act(async () => button(container, 'User Portal off')?.click());
    expect(dialog(container)?.textContent).toContain('Ask an admin to turn it on.');
    expect(dialog(container)?.querySelector('a')).toBeNull();
  });

  it('lists what to fix when the rules refuse, without publishing', async () => {
    publishability.mockResolvedValue(refused);
    const container = await action(DEVELOPER);
    await act(async () => toggle(container)?.click());
    expect(dialog(container)?.textContent).toContain('Only integrations of projects on the default deployment pipeline can be published to the User Portal.');
    expect(publish).not.toHaveBeenCalled();
  });

  it('confirms a publish the rules allow, then reports scopes the portal could not take on the card', async () => {
    publishability.mockResolvedValue(publishable);
    publish.mockResolvedValue({ environment: 'production', published: true, rejectedScopes: ['bad scope'] });
    const container = await action(DEVELOPER);
    await act(async () => toggle(container)?.click());
    expect(dialog(container)?.textContent).toContain('Publish to the User Portal in Production?');
    expect(publish).not.toHaveBeenCalled();
    await act(async () => dialogButton(container, 'Publish')?.click());
    await flush();
    expect(publish).toHaveBeenCalledWith('orders', 'production');
    expect(dialog(container)).toBeNull();
    expect(onNotify).toHaveBeenCalledWith(expect.objectContaining({ text: 'Published to the User Portal in Production.', severity: 'success', detail: expect.stringContaining('bad scope') }));
  });

  // Publishing redeploys the workflow to take only User Portal sign-ins, which turns the console's workflow views off.
  it('warns of the redeploy in the confirmation of a publish that redeploys a workflow', async () => {
    publishability.mockResolvedValue({ ...publishable, redeploys: true });
    publish.mockResolvedValue({ environment: 'production', published: true, rejectedScopes: [] });
    const container = await action(DEVELOPER, true);
    await act(async () => toggle(container)?.click());
    expect(dialog(container)?.textContent).toContain('will be redeployed in Production');
    await act(async () => dialogButton(container, 'Publish')?.click());
    await flush();
    expect(publish).toHaveBeenCalledWith('orders', 'production');
  });

  it('keeps the confirm dialog open on a refused publish, worded from its code', async () => {
    publishability.mockResolvedValue(publishable);
    publish.mockRejectedValue(new BffError(409, '{"code":"USER_PORTAL_NOT_DEPLOYED","message":"the integration is not deployed in this environment; deploy it first"}'));
    const container = await action(DEVELOPER);
    await act(async () => toggle(container)?.click());
    await act(async () => dialogButton(container, 'Publish')?.click());
    await flush();
    expect(dialog(container)?.textContent).toContain('Deploy it to Production first. The User Portal lists only what runs there.');
    expect(onNotify).not.toHaveBeenCalled();
  });

  // The integration got published but its scopes didn't sync: the read after the publish says it is published.
  it('keeps the error in the confirm dialog when a partial publish changes the state, and not in the next one', async () => {
    publishability.mockResolvedValueOnce(publishable).mockResolvedValue({ ...publishable, published: true });
    publish.mockRejectedValue(new BffError(500, '{"code":"USER_PORTAL_SCOPES_NOT_SYNCED","message":"the user portal scopes could not be updated"}'));
    const container = await action(DEVELOPER);
    await act(async () => toggle(container)?.click());
    await act(async () => dialogButton(container, 'Publish')?.click());
    await flush();
    await flush();
    expect(toggle(container)?.checked).toBe(true);
    expect(dialog(container)?.textContent).toContain("The User Portal's scopes could not be updated. Try again.");
    await act(async () => dialogButton(container, 'Cancel')?.click());
    await flush();
    await act(async () => toggle(container)?.click());
    expect(dialog(container)?.textContent).not.toContain('could not be updated');
  });

  it("tells a role that can't deploy why it can't publish", async () => {
    publishability.mockResolvedValue(publishable);
    const container = await action(VIEWER);
    const b = toggle(container);
    expect(b?.disabled).toBe(true);
    expect(reasonFor(b)).toBe("Your role can't publish integrations to the User Portal.");
  });

  it('shows a published integration with its switch on and a link to the running portal', async () => {
    publishability.mockResolvedValue({ ...publishable, published: true });
    portal.mockResolvedValue({ environment: 'production', state: 'active', url: 'https://acme-up.example.com' });
    const container = await action(DEVELOPER);
    await flush();
    expect(container.textContent).toContain('Published to User Portal');
    expect(toggle(container)?.checked).toBe(true);
    expect(toggle(container)?.disabled).toBe(false);
    const link = container.querySelector('a');
    expect(link?.textContent).toBe('Open User Portal');
    expect(link?.getAttribute('href')).toBe('https://acme-up.example.com');
    expect(link?.getAttribute('target')).toBe('_blank');
  });

  it('offers no link while the portal has no address to open', async () => {
    publishability.mockResolvedValue({ ...publishable, published: true });
    portal.mockResolvedValue({ environment: 'production', state: 'setting-up' });
    const container = await action(DEVELOPER);
    await flush();
    expect(container.textContent).toContain('Published to User Portal');
    expect(container.querySelector('a')).toBeNull();
  });

  it('confirms an unpublish, from switching it off, before unpublishing', async () => {
    publishability.mockResolvedValue({ ...publishable, published: true });
    unpublish.mockResolvedValue({ environment: 'production', published: false, rejectedScopes: [] });
    const container = await action(DEVELOPER);
    await act(async () => toggle(container)?.click());
    expect(unpublish).not.toHaveBeenCalled();
    await act(async () => dialogButton(container, 'Unpublish')?.click());
    await flush();
    expect(unpublish).toHaveBeenCalledWith('orders', 'production');
  });

  it('says unpublishing a workflow redeploys it, and where its security comes by promotion that the console stays off', async () => {
    publishability.mockResolvedValue({ ...publishable, published: true });
    for (const [isEntry, says] of [
      [true, "The console's workflow views work there again."],
      [false, 'Production takes its API security from Development by promotion'],
    ] as const) {
      entry.value = { isEntry, loading: false, entryEnvironmentName: 'Development' };
      const container = await action(DEVELOPER, true);
      await act(async () => toggle(container)?.click());
      expect(dialog(container)?.textContent).toContain('The workflow is redeployed in Production');
      expect(dialog(container)?.textContent).toContain(says);
      expect(dialog(container)?.textContent).not.toContain('keeps running');
      unmount();
    }
  });

  it('shows nothing where the BFF serves no User Portal', async () => {
    publishability.mockRejectedValue(new BffError(404, '404 page not found'));
    const container = await action(DEVELOPER);
    expect(container.textContent).toBe('');
  });
});
