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

import { act, useState } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import UserPortalPrompt from './UserPortalPrompt';
import { BffError } from '../../api/_client';
import * as api from '../../api/userPortal';
import { button, flush, reasonFor, renderWithScopes } from '../../test/renderWithScopes';
import { DEVELOPER, PLATFORM_ENGINEER } from '../../test/roles';
import type { UserPortal, UserPortalPublishability } from '../../types/userPortal';

vi.mock('../../api/userPortal', () => ({
  fetchUserPortalEnvironments: vi.fn(),
  fetchUserPortal: vi.fn(),
  enableUserPortal: vi.fn(),
  fetchUserPortalPublishability: vi.fn(),
  publishToUserPortal: vi.fn(),
}));

const portalEnvironments = vi.mocked(api.fetchUserPortalEnvironments);
const portal = vi.mocked(api.fetchUserPortal);
const enable = vi.mocked(api.enableUserPortal);
const publishability = vi.mocked(api.fetchUserPortalPublishability);
const publish = vi.mocked(api.publishToUserPortal);

const ACTIVE: UserPortal = { environment: 'production', state: 'active', url: 'https://portal.example/acme' };
const PUBLISHABLE: UserPortalPublishability = { environment: 'production', published: false, publishable: true, reasons: [], redeploys: true, publishing: false, unpublishing: false, rejectedScopes: [] };
const NOT_ENABLED: UserPortalPublishability = {
  ...PUBLISHABLE,
  publishable: false,
  reasons: [{ code: 'USER_PORTAL_NOT_ENABLED', message: 'the user portal is not enabled in this environment' }],
};

let unmount = () => {};
afterEach(() => unmount());
beforeEach(() => {
  vi.clearAllMocks();
  portalEnvironments.mockResolvedValue([
    { id: 'development', name: 'Development', critical: false },
    { id: 'production', name: 'Production', critical: true },
  ]);
});

async function prompt(scopes: string[]) {
  const r = await renderWithScopes(
    <MemoryRouter>
      <UserPortalPrompt componentId="orders" environment={{ id: 'production', name: 'Production', critical: true }} />
    </MemoryRouter>,
    scopes,
  );
  unmount = r.unmount;
  await flush();
  return r.container;
}

const dialogText = (container: HTMLElement) => container.ownerDocument.querySelector('[role="dialog"]')?.textContent ?? '';

describe('the way to a workflow in the User Portal', () => {
  it('offers to enable the User Portal where it is not enabled, in that environment', async () => {
    portal.mockResolvedValue({ environment: 'production', state: 'not-enabled' });
    publishability.mockResolvedValue(NOT_ENABLED);
    enable.mockResolvedValue({ environment: 'production', state: 'setting-up' });
    const container = await prompt(PLATFORM_ENGINEER);

    await act(async () => button(container, 'Enable User Portal')?.click());
    await flush();
    expect(dialogText(container)).toContain('Enable User Portal');
    await act(async () => button(container, 'Enable')?.click());
    await flush();
    expect(enable.mock.calls[0]?.[0]).toBe('production');
    expect(button(container, 'Setting up User Portal…')?.disabled).toBe(true);
  });

  it('offers no Enable where the User Portal cannot run, and says so', async () => {
    portalEnvironments.mockResolvedValue([{ id: 'development', name: 'Development', critical: false }]);
    portal.mockResolvedValue({ environment: 'production', state: 'not-enabled' });
    publishability.mockResolvedValue(NOT_ENABLED);
    const container = await prompt(PLATFORM_ENGINEER);
    expect(button(container, 'Enable User Portal')).toBeUndefined();
    expect(container.textContent).toContain("The User Portal can't use Production.");
  });

  it('shows the scopes the portal could not hold once a publish from here goes through', async () => {
    portal.mockResolvedValue(ACTIVE);
    publishability.mockResolvedValueOnce({ ...PUBLISHABLE, redeploys: false }).mockResolvedValue({ ...PUBLISHABLE, published: true, redeploys: false });
    publish.mockResolvedValue({ environment: 'production', published: true, publishing: false, unpublishing: false, rejectedScopes: ['bad scope'] });
    const container = await prompt(DEVELOPER);
    await act(async () => button(container, 'Publish to User Portal')?.click());
    await flush();
    expect(container.textContent).toContain('bad scope');
  });

  it("leaves the last environment's failed publish behind when another is shown", async () => {
    portal.mockImplementation(async (environment) => ({ ...ACTIVE, environment }));
    publishability.mockImplementation(async (_component, environment) => ({ ...PUBLISHABLE, environment, redeploys: false }));
    publish.mockRejectedValue(new BffError(409, '{"code":"USER_PORTAL_NOT_DEPLOYED","message":"not deployed"}'));
    let show: (id: string) => void = () => {};
    function Switching() {
      const [env, setEnv] = useState('production');
      show = setEnv;
      return <UserPortalPrompt componentId="orders" environment={{ id: env, name: env === 'production' ? 'Production' : 'Development', critical: false }} />;
    }
    const r = await renderWithScopes(
      <MemoryRouter>
        <Switching />
      </MemoryRouter>,
      DEVELOPER,
    );
    unmount = r.unmount;
    await flush();
    await act(async () => button(r.container, 'Publish to User Portal')?.click());
    await flush();
    expect(r.container.textContent).toContain('Deploy it to Production first.');

    await act(async () => show('development'));
    await flush();
    expect(r.container.textContent).not.toContain('Deploy it to Production first.');
    expect(button(r.container, 'Publish to User Portal')?.disabled).toBe(false);
  });

  it("tells a role that can't enable the User Portal why", async () => {
    portal.mockResolvedValue({ environment: 'production', state: 'not-enabled' });
    publishability.mockResolvedValue(NOT_ENABLED);
    const container = await prompt(DEVELOPER);
    const b = button(container, 'Enable User Portal');
    expect(b?.disabled).toBe(true);
    expect(reasonFor(b)).toBe("Your role can't enable the User Portal.");
  });

  it('offers to publish where the User Portal runs, warning first of the redeploy', async () => {
    portal.mockResolvedValue(ACTIVE);
    publishability.mockResolvedValue(PUBLISHABLE);
    publish.mockResolvedValue({ environment: 'production', published: true, publishing: false, unpublishing: false, rejectedScopes: [] });
    const container = await prompt(DEVELOPER);

    await act(async () => button(container, 'Publish to User Portal')?.click());
    await flush();
    expect(publish).not.toHaveBeenCalled();
    expect(dialogText(container)).toContain('will be redeployed in Production');
    await act(async () => button(container, 'Publish')?.click());
    await flush();
    expect(publish).toHaveBeenCalledWith('orders', 'production');
  });

  it('lists what keeps it from being published', async () => {
    portal.mockResolvedValue(ACTIVE);
    publishability.mockResolvedValue({
      ...PUBLISHABLE,
      publishable: false,
      reasons: [{ code: 'USER_PORTAL_NOT_DEPLOYED', message: 'the integration is not deployed in this environment; deploy it first' }],
    });
    const container = await prompt(DEVELOPER);
    expect(button(container, 'Publish to User Portal')?.disabled).toBe(true);
    expect(container.textContent).toContain('Deploy it to Production first.');
  });

  it('opens the User Portal a workflow is published to', async () => {
    portal.mockResolvedValue(ACTIVE);
    publishability.mockResolvedValue({ ...PUBLISHABLE, published: true, redeploys: false });
    const container = await prompt(DEVELOPER);
    const link = [...container.querySelectorAll('a')].find((a) => a.textContent?.trim() === 'Open User Portal');
    expect(link?.getAttribute('href')).toBe('https://portal.example/acme');
    expect(link?.getAttribute('target')).toBe('_blank');
  });

  it('reads the report again once the portal it waited for is up', async () => {
    portal.mockResolvedValue(ACTIVE);
    publishability.mockResolvedValueOnce(NOT_ENABLED).mockResolvedValue(PUBLISHABLE);
    const container = await prompt(DEVELOPER);
    await flush();
    expect(publishability).toHaveBeenCalledTimes(2);
    expect(button(container, 'Publish to User Portal')?.disabled).toBe(false);
  });

  it('keeps reading it every few seconds while it still says the portal is not enabled', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      portal.mockResolvedValue(ACTIVE);
      publishability.mockResolvedValueOnce(NOT_ENABLED).mockResolvedValueOnce(NOT_ENABLED).mockResolvedValue(PUBLISHABLE);
      const container = await prompt(DEVELOPER);
      await flush();
      expect(button(container, 'Publish to User Portal')?.disabled).toBe(true);
      await act(async () => void (await vi.advanceTimersByTimeAsync(3_000)));
      await flush();
      expect(publishability).toHaveBeenCalledTimes(3);
      expect(button(container, 'Publish to User Portal')?.disabled).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('opens the User Portal a workflow is published to even when it now breaks a rule the portal could not settle', async () => {
    portal.mockResolvedValue(ACTIVE);
    publishability.mockResolvedValue({
      ...PUBLISHABLE,
      published: true,
      publishable: false,
      redeploys: false,
      reasons: [{ code: 'USER_PORTAL_PIPELINE', message: 'only integrations of projects on the default pipeline' }],
    });
    const container = await prompt(DEVELOPER);
    expect([...container.querySelectorAll('a')].some((a) => a.textContent?.trim() === 'Open User Portal')).toBe(true);
    expect(container.textContent).not.toContain('default deployment pipeline');
  });

  it('offers nothing the User Portal could not settle', async () => {
    portal.mockResolvedValue({ environment: 'production', state: 'not-enabled' });
    publishability.mockResolvedValue({
      ...NOT_ENABLED,
      reasons: [{ code: 'USER_PORTAL_PIPELINE', message: 'only integrations of projects on the default pipeline' }, ...NOT_ENABLED.reasons],
    });
    const container = await prompt(PLATFORM_ENGINEER);
    expect(button(container, 'Enable User Portal')).toBeUndefined();
    expect(container.textContent).toContain('Only integrations of projects on the default deployment pipeline can be published to the User Portal.');
  });

  it('shows nothing where the BFF serves no User Portal', async () => {
    portal.mockRejectedValue(new BffError(404, '404 page not found'));
    publishability.mockRejectedValue(new BffError(404, '404 page not found'));
    const container = await prompt(DEVELOPER);
    expect(container.textContent).toBe('');
  });
});

describe('a publish that finishes in the background, from the prompt', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] }));
  afterEach(() => vi.useRealTimers());
  const poll = () => act(async () => vi.advanceTimersByTimeAsync(3_000));

  it('shows Publishing… after the 202 and offers to open the portal once published', async () => {
    portal.mockResolvedValue(ACTIVE);
    publishability.mockResolvedValueOnce(PUBLISHABLE).mockResolvedValue({ ...PUBLISHABLE, publishing: true });
    publish.mockResolvedValue({ environment: 'production', published: false, publishing: true, unpublishing: false, rejectedScopes: [] });
    const container = await prompt(DEVELOPER);
    await act(async () => button(container, 'Publish to User Portal')?.click());
    await flush();
    const confirm = [...container.ownerDocument.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find((b) => b.textContent === 'Publish');
    await act(async () => confirm?.click());
    await flush();
    expect(dialogText(container)).toBe('');
    expect(button(container, 'Publishing…')?.disabled).toBe(true);
    expect(container.textContent).toContain('this takes a minute or two');

    publishability.mockResolvedValue({ ...PUBLISHABLE, published: true, publishing: false, unpublishing: false, rejectedScopes: ['bad scope'] });
    await poll();
    await flush();
    expect(container.textContent).toContain('Open User Portal');
    expect(container.textContent).toContain('bad scope');
  });

  it('follows a publish running at load, and words the failure it ends with', async () => {
    portal.mockResolvedValue(ACTIVE);
    publishability.mockResolvedValue({ ...PUBLISHABLE, publishing: true });
    const container = await prompt(DEVELOPER);
    expect(button(container, 'Publishing…')?.disabled).toBe(true);

    publishability.mockResolvedValue({ ...PUBLISHABLE, publishError: { code: 'USER_PORTAL_PUBLISH_INTERRUPTED', message: 'interrupted' } });
    await poll();
    await flush();
    expect(container.textContent).toContain("Publishing didn't finish. Publish again.");
    expect(button(container, 'Publish to User Portal')?.disabled).toBe(false);
  });
});

describe("a User Portal that isn't ready yet", () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] }));
  afterEach(() => vi.useRealTimers());
  const wait = (ms: number) => act(async () => vi.advanceTimersByTimeAsync(ms));
  const openLink = (container: HTMLElement) => [...container.querySelectorAll('a')].find((a) => a.textContent?.trim() === 'Open User Portal');
  const PUBLISHED: UserPortalPublishability = { ...PUBLISHABLE, published: true, redeploys: false };

  // ipaas-service publishes to a provisioned portal whether or not its pods are ready, as the env card's switch does.
  it('offers to publish while it starts or is not ready', async () => {
    publishability.mockResolvedValue(PUBLISHABLE);
    for (const state of ['starting', 'unhealthy'] as const) {
      portal.mockResolvedValue({ environment: 'production', state });
      const container = await prompt(DEVELOPER);
      expect(button(container, 'Publish to User Portal')?.disabled).toBe(false);
      unmount();
    }
  });

  it('says it is starting in place of the link, and offers to open it once a re-read finds it ready', async () => {
    portal.mockResolvedValueOnce({ environment: 'production', state: 'starting' }).mockResolvedValue(ACTIVE);
    publishability.mockResolvedValue(PUBLISHED);
    const container = await prompt(DEVELOPER);
    expect(button(container, 'Starting User Portal…')?.disabled).toBe(true);
    expect(openLink(container)).toBeUndefined();

    await wait(3_000);
    await flush();
    expect(openLink(container)?.getAttribute('href')).toBe('https://portal.example/acme');
  });

  it("says it isn't ready in place of the link, with OpenChoreo's reason only as a detail, offers no Enable, and reads it again", async () => {
    portal.mockResolvedValueOnce({ environment: 'production', state: 'unhealthy', readinessMessage: 'pods are crash-looping' }).mockResolvedValue(ACTIVE);
    publishability.mockResolvedValue(PUBLISHED);
    const container = await prompt(PLATFORM_ENGINEER);
    const notReady = button(container, 'User Portal not ready');
    expect(notReady?.disabled).toBe(true);
    expect(reasonFor(notReady)).toBe('pods are crash-looping');
    expect(container.textContent).not.toContain('pods are crash-looping');
    expect(button(container, 'Enable User Portal')).toBeUndefined();
    expect(openLink(container)).toBeUndefined();

    await wait(30_000);
    await flush();
    expect(openLink(container)?.getAttribute('href')).toBe('https://portal.example/acme');
  });
});
