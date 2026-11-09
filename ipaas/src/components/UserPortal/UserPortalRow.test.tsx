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
import { DEVELOPER, VIEWER } from '../../test/roles';
import type { UserPortalPublishability } from '../../types/userPortal';

vi.mock('../../api/userPortal', () => ({
  fetchUserPortalPublishability: vi.fn(),
  publishToUserPortal: vi.fn(),
  unpublishFromUserPortal: vi.fn(),
}));

// Whether the row's environment is where the project's API security is edited.
const entry = vi.hoisted(() => ({ value: { isEntry: true, loading: false, entryEnvironmentName: 'Development' } }));
vi.mock('../../hooks/useEntryEnvironment', () => ({ useEntryEnvironment: () => entry.value }));

const publishability = vi.mocked(api.fetchUserPortalPublishability);
const publish = vi.mocked(api.publishToUserPortal);

const refused: UserPortalPublishability = {
  environment: 'production',
  published: false,
  publishable: false,
  redeploys: false,
  reasons: [
    { code: 'USER_PORTAL_PIPELINE', message: 'only integrations of projects on the "default" deployment pipeline can be published to the User Portal' },
    { code: 'USER_PORTAL_NOT_ENABLED', message: 'the user portal is not enabled in this environment' },
  ],
};

// The dialog's own button: the row behind it has one of the same name.
const dialogButton = (container: HTMLElement, name: string): HTMLButtonElement | undefined => [...(container.ownerDocument.querySelector('[role="dialog"]')?.querySelectorAll('button') ?? [])].find((b) => b.textContent?.trim() === name);

let unmount = () => {};
afterEach(() => unmount());
beforeEach(() => {
  vi.clearAllMocks();
  entry.value = { isEntry: true, loading: false, entryEnvironmentName: 'Development' };
});

async function row(scopes: string[], isWorkflow = false) {
  const r = await renderWithScopes(
    <MemoryRouter>
      <UserPortalRow orgHandler="acme" projectId="shop" componentId="orders" environment="production" envName="Production" isWorkflow={isWorkflow} />
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
    expect(container.textContent).toContain('The User Portal is not enabled in Production.');
    for (const reason of refused.reasons) expect(container.textContent).not.toContain(reason.message);
    // The portal itself is the fix for one of them, and that one links to it.
    const link = container.querySelector('a');
    expect(link?.textContent).toBe('Enable it');
    expect(link?.getAttribute('href')).toBe('/organizations/acme/settings/user-portal');
    expect(publish).not.toHaveBeenCalled();
  });

  it('publishes when the rules pass, and reports scopes the portal could not take', async () => {
    publishability.mockResolvedValue({ environment: 'production', published: false, publishable: true, reasons: [], redeploys: false });
    publish.mockResolvedValue({ environment: 'production', published: true, rejectedScopes: ['bad scope'] });
    const container = await row(DEVELOPER);
    const b = button(container, 'Publish');
    expect(b?.disabled).toBe(false);
    await act(async () => b?.click());
    await flush();
    expect(publish).toHaveBeenCalledWith('orders', 'production');
    expect(container.textContent).toContain('bad scope');
  });

  // Publishing redeploys the workflow to take only User Portal sign-ins, which turns the console's workflow views off.
  it('warns before a publish that redeploys a workflow, and publishes once confirmed', async () => {
    publishability.mockResolvedValue({ environment: 'production', published: false, publishable: true, reasons: [], redeploys: true });
    publish.mockResolvedValue({ environment: 'production', published: true, rejectedScopes: [] });
    const container = await row(DEVELOPER);
    await act(async () => button(container, 'Publish')?.click());
    await flush();
    expect(publish).not.toHaveBeenCalled();
    const dialog = container.ownerDocument.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain('Publish to the User Portal in Production?');
    expect(dialog?.textContent).toContain('will be redeployed in Production');
    expect(dialog?.textContent).toContain('Use the User Portal for all workflow management.');

    await act(async () => dialogButton(container, 'Publish')?.click());
    await flush();
    expect(publish).toHaveBeenCalledWith('orders', 'production');
    await vi.waitFor(() => expect(container.ownerDocument.querySelector('[role="dialog"]')).toBeNull());
  });

  it('publishes nothing when the redeploy warning is cancelled', async () => {
    publishability.mockResolvedValue({ environment: 'production', published: false, publishable: true, reasons: [], redeploys: true });
    const container = await row(DEVELOPER);
    await act(async () => button(container, 'Publish')?.click());
    await flush();
    await act(async () => button(container, 'Cancel')?.click());
    await flush();
    expect(publish).not.toHaveBeenCalled();
  });

  it('keeps the redeploy warning open on a failed publish, saying why', async () => {
    publishability.mockResolvedValue({ environment: 'production', published: false, publishable: true, reasons: [], redeploys: true });
    publish.mockRejectedValue(new BffError(503, '{"code":"USER_PORTAL_SIGN_IN_NOT_READY","message":"not ready"}'));
    const container = await row(DEVELOPER);
    await act(async () => button(container, 'Publish')?.click());
    await flush();
    await act(async () => dialogButton(container, 'Publish')?.click());
    await flush();
    const dialog = container.ownerDocument.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain("The User Portal's sign-in isn't ready in Production yet. Publish again once it is.");
  });

  it("tells a role that can't deploy why it can't publish", async () => {
    publishability.mockResolvedValue({ environment: 'production', published: false, publishable: true, reasons: [], redeploys: false });
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

  it('says unpublishing a workflow where its API security comes by promotion leaves the console off', async () => {
    publishability.mockResolvedValue({ ...refused, published: true });
    const kept = "Production takes this workflow's API security from Development by promotion";
    for (const [isWorkflow, isEntry, says] of [
      [true, false, true],
      [true, true, false],
      [false, false, false],
    ] as const) {
      entry.value = { isEntry, loading: false, entryEnvironmentName: 'Development' };
      const container = await row(DEVELOPER, isWorkflow);
      await act(async () => button(container, 'Unpublish')?.click());
      await flush();
      expect(container.ownerDocument.querySelector('[role="dialog"]')?.textContent?.includes(kept)).toBe(says);
      unmount();
    }
  });

  // With nothing deployed, every rule about what runs there fails too; deploying is the one fix.
  it('asks for a deployment first, not for what follows from one', async () => {
    publishability.mockResolvedValue({
      environment: 'production',
      published: false,
      publishable: false,
      redeploys: false,
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
    publishability.mockResolvedValue({ environment: 'production', published: false, publishable: true, reasons: [], redeploys: false });
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
