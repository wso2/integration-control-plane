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
  publishing: false,
  unpublishing: false,
  rejectedScopes: [],
  reasons: [
    { code: 'USER_PORTAL_PIPELINE', message: 'only integrations of projects on the "default" deployment pipeline can be published to the User Portal' },
    { code: 'USER_PORTAL_AGENT_OAUTH_REQUIRED', message: 'turn on OAuth security for the agent' },
  ],
};

// The dialog's own button: the row behind it has one of the same name.
const dialogButton = (container: HTMLElement, name: string): HTMLButtonElement | undefined => [...(container.ownerDocument.querySelector('[role="dialog"]')?.querySelectorAll('button') ?? [])].find((b) => b.textContent?.trim() === name);

const portalOff: UserPortalPublishability = {
  ...refused,
  reasons: [...refused.reasons, { code: 'USER_PORTAL_NOT_ENABLED', message: 'the user portal is not enabled in this environment' }],
};

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
    publishability.mockResolvedValue({ environment: 'production', published: false, publishable: true, reasons: [], redeploys: false, publishing: false, unpublishing: false, rejectedScopes: [] });
    publish.mockResolvedValue({ environment: 'production', published: true, publishing: false, unpublishing: false, rejectedScopes: ['bad scope'] });
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
    publishability.mockResolvedValue({ environment: 'production', published: false, publishable: true, reasons: [], redeploys: true, publishing: false, unpublishing: false, rejectedScopes: [] });
    publish.mockResolvedValue({ environment: 'production', published: true, publishing: false, unpublishing: false, rejectedScopes: [] });
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

  it('clears what the last publish left on screen as soon as another is asked for', async () => {
    const notPublished = { environment: 'production', published: false, publishable: true, reasons: [], publishing: false, unpublishing: false, rejectedScopes: [] };
    publishability.mockResolvedValueOnce({ ...notPublished, redeploys: false, publishing: false, unpublishing: false, rejectedScopes: [] }).mockResolvedValue({ ...notPublished, redeploys: true, publishing: false, unpublishing: false, rejectedScopes: [] });
    publish.mockResolvedValue({ environment: 'production', published: true, publishing: false, unpublishing: false, rejectedScopes: ['bad scope'] });
    const container = await row(DEVELOPER);
    await act(async () => button(container, 'Publish')?.click());
    await flush();
    expect(container.textContent).toContain('bad scope');

    await act(async () => button(container, 'Publish')?.click());
    await flush();
    expect(container.ownerDocument.querySelector('[role="dialog"]')).not.toBeNull();
    expect(container.textContent).not.toContain('bad scope');
  });

  it('publishes nothing when the redeploy warning is cancelled', async () => {
    publishability.mockResolvedValue({ environment: 'production', published: false, publishable: true, reasons: [], redeploys: true, publishing: false, unpublishing: false, rejectedScopes: [] });
    const container = await row(DEVELOPER);
    await act(async () => button(container, 'Publish')?.click());
    await flush();
    await act(async () => button(container, 'Cancel')?.click());
    await flush();
    expect(publish).not.toHaveBeenCalled();
  });

  it('keeps the redeploy warning open on a failed publish, saying why', async () => {
    publishability.mockResolvedValue({ environment: 'production', published: false, publishable: true, reasons: [], redeploys: true, publishing: false, unpublishing: false, rejectedScopes: [] });
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
    publishability.mockResolvedValue({ environment: 'production', published: false, publishable: true, reasons: [], redeploys: false, publishing: false, unpublishing: false, rejectedScopes: [] });
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

  // Unpublishing a workflow redeploys it to take the console's API key again; where its API security comes by promotion
  // the gateway keeps the portal's sign-in, and the console stays off.
  it('says what unpublishing does to the integration and the console', async () => {
    publishability.mockResolvedValue({ ...refused, published: true });
    for (const { isWorkflow, isEntry, says, not } of [
      { isWorkflow: true, isEntry: true, says: ['redeployed in Production', "The console's workflow views work there again."], not: ['keeps running', 'by promotion'] },
      { isWorkflow: true, isEntry: false, says: ['redeployed in Production', 'Production takes its API security from Development by promotion'], not: ['keeps running', 'work there again'] },
      { isWorkflow: false, isEntry: false, says: ['The integration keeps running.'], not: ['redeployed', 'by promotion'] },
    ]) {
      entry.value = { isEntry, loading: false, entryEnvironmentName: 'Development' };
      const container = await row(DEVELOPER, isWorkflow);
      await act(async () => button(container, 'Unpublish')?.click());
      await flush();
      const dialog = container.ownerDocument.querySelector('[role="dialog"]')?.textContent ?? '';
      for (const text of says) expect(dialog).toContain(text);
      for (const text of not) expect(dialog).not.toContain(text);
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
      publishing: false,
      unpublishing: false,
      rejectedScopes: [],
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
    publishability.mockResolvedValue({ environment: 'production', published: false, publishable: true, reasons: [], redeploys: false, publishing: false, unpublishing: false, rejectedScopes: [] });
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

describe('a publish that finishes in the background, in the row', () => {
  const workflow = { environment: 'production', published: false, publishable: true, reasons: [], redeploys: true, publishing: false, unpublishing: false, rejectedScopes: [] };

  beforeEach(() => vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] }));
  afterEach(() => vi.useRealTimers());
  const poll = () => act(async () => vi.advanceTimersByTimeAsync(3_000));

  it('shows Publishing… from the 202 on, then Published with the scopes the portal could not hold', async () => {
    publishability.mockResolvedValueOnce(workflow).mockResolvedValue({ ...workflow, publishing: true });
    publish.mockResolvedValue({ environment: 'production', published: false, publishing: true, unpublishing: false, rejectedScopes: [] });
    const container = await row(DEVELOPER, true);
    await act(async () => button(container, 'Publish')?.click());
    await act(async () => dialogButton(container, 'Publish')?.click());
    await flush();
    expect(container.ownerDocument.querySelector('[role="dialog"]')).toBeNull();
    const b = button(container, 'Publishing…');
    expect(b?.disabled).toBe(true);
    expect(container.textContent).toContain('this takes a minute or two');

    publishability.mockResolvedValue({ ...workflow, published: true, rejectedScopes: ['bad scope'] });
    await poll();
    await flush();
    expect(container.textContent).toContain('Published');
    expect(container.textContent).toContain('bad scope');
    expect(container.textContent).not.toContain('this takes a minute or two');
  });

  it('shows a failed background publish inline, with its wording', async () => {
    publishability.mockResolvedValue({ ...workflow, publishError: { code: 'USER_PORTAL_SIGN_IN_NOT_READY', message: 'not ready' } });
    const container = await row(DEVELOPER, true);
    expect(container.textContent).toContain("The User Portal's sign-in isn't ready in Production yet. Publish again once it is.");
    expect(button(container, 'Publish')?.disabled).toBe(false);
  });

  it('follows a publish that was running when the page loaded', async () => {
    publishability.mockResolvedValue({ ...workflow, publishing: true });
    const container = await row(DEVELOPER, true);
    expect(button(container, 'Publishing…')?.disabled).toBe(true);
    publishability.mockResolvedValue({ ...workflow, publishError: { code: 'USER_PORTAL_PUBLISH_INTERRUPTED', message: 'interrupted' } });
    await poll();
    await flush();
    expect(container.textContent).toContain("Publishing didn't finish. Publish again.");
    expect(button(container, 'Publish')?.disabled).toBe(false);
  });

  it("lists a background publish's rejected scopes only while the integration is published", async () => {
    publishability.mockResolvedValue({ ...workflow, published: false, rejectedScopes: ['stale scope'] });
    expect((await row(DEVELOPER, true)).textContent).not.toContain('stale scope');
    unmount();

    publishability.mockResolvedValue({ ...workflow, published: true, rejectedScopes: ['bad scope'] });
    expect((await row(DEVELOPER, true)).textContent).toContain('bad scope');
  });

  it('lists no refusals while a publish is switching the workflow', async () => {
    publishability.mockResolvedValue({ ...refused, publishing: true });
    const container = await row(DEVELOPER, true);
    expect(container.textContent).not.toContain('Turn on OAuth security for the agent.');
  });
});

describe("the deploy card's row after an unpublish that gives a workflow back in the background", () => {
  const unpublished: UserPortalPublishability = { environment: 'production', published: false, publishable: true, reasons: [], redeploys: true, publishing: false, unpublishing: false, rejectedScopes: [] };
  const unpublish = vi.mocked(api.unpublishFromUserPortal);

  it('says the workflow is being given back, with nothing to publish meanwhile, and why in the button’s tooltip', async () => {
    publishability.mockResolvedValue({ ...unpublished, publishable: false, unpublishing: true });
    const container = await row(DEVELOPER, true);
    expect(container.textContent).toContain("Unpublished from the User Portal in Production. The workflow is redeployed to take the console's API key again");
    expect(button(container, 'Publish')?.disabled).toBe(true);
    // The rules aren't listed while it runs, so the tooltip doesn't point at them.
    expect(reasonFor(button(container, 'Publish'))).toContain("redeployed to take the console's API key again");
  });

  it('drops a refused finish once a run starts, and never offers one on a published workflow', async () => {
    const failed = { ...unpublished, unpublishError: { code: 'USER_PORTAL_CONSOLE_ACCESS_NOT_RESTORED', message: 'x' } };
    publishability.mockResolvedValue(failed);
    unpublish.mockRejectedValue(new BffError(500, '{"message":"boom"}'));
    const container = await row(DEVELOPER, true);
    await act(async () => button(container, 'Finish unpublishing')?.click());
    await flush();
    expect(container.textContent).toContain('boom');
    expect(button(container, 'Finish unpublishing')).toBeDefined();

    // Meanwhile it is published again from elsewhere, which the re-read after the next refused finish finds.
    publishability.mockResolvedValue({ ...unpublished, published: true });
    await act(async () => button(container, 'Finish unpublishing')?.click());
    await flush();
    expect(container.textContent).not.toContain('boom');
    expect(button(container, 'Finish unpublishing')).toBeUndefined();
    expect(button(container, 'Unpublish')).toBeDefined();
  });

  it('says why giving it back failed, and finishes it without asking again', async () => {
    publishability.mockResolvedValue({ ...unpublished, unpublishError: { code: 'USER_PORTAL_CONSOLE_ACCESS_NOT_RESTORED', message: 'x' } });
    unpublish.mockResolvedValue({ environment: 'production', published: false, publishing: false, unpublishing: true, rejectedScopes: [] });
    const container = await row(DEVELOPER, true);
    expect(container.textContent).toContain('The workflow is unpublished, but switching it back to the console failed. Unpublish again to finish.');
    await act(async () => button(container, 'Finish unpublishing')?.click());
    await flush();
    expect(container.ownerDocument.querySelector('[role="dialog"]')).toBeNull();
    expect(unpublish).toHaveBeenCalledWith('orders', 'production');
  });
});
