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
import { BffError } from '../api/_client';
import * as api from '../api/userPortal';
import { typeInto } from '../components/Workflows/tasks/testDom';
import { button, flush, reasonFor, renderWithScopes } from '../test/renderWithScopes';
import { DEVELOPER, PLATFORM_ENGINEER } from '../test/roles';
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

  // With no portal enabled, a failed read used to skip the empty state while the header still
  // waited for an enabled portal, so the page offered no way to enable one.
  it('still offers Enable when a read fails and no portal is enabled', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      vi.mocked(api.fetchUserPortalEnvironments).mockResolvedValue([env('dev'), env('prod')]);
      vi.mocked(api.fetchUserPortal).mockImplementation(async (environment) => {
        if (environment === 'dev') throw new BffError(500, '{"message":"get user portal failed"}');
        return { environment, state: 'not-enabled' };
      });

      const r = await renderWithScopes(<UserPortal level="organizations" org="acme" />, PLATFORM_ENGINEER);
      unmount = r.unmount;
      // The failed read retries twice before it gives up.
      for (let i = 0; i < 10 && !r.container.textContent?.includes('Could not load the User Portal in dev'); i++) {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(1_000);
        });
      }

      expect(r.container.textContent).toContain('Could not load the User Portal in dev');
      expect(button(r.container, 'Enable User Portal')?.disabled).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('asks for a retry, not "every environment has one", when the only unknown read failed', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      vi.mocked(api.fetchUserPortalEnvironments).mockResolvedValue([env('dev'), env('prod')]);
      vi.mocked(api.fetchUserPortal).mockImplementation(async (environment) => {
        if (environment === 'dev') throw new BffError(500, '{"message":"get user portal failed"}');
        return { environment, state: 'active', url: 'https://prod-up.example' };
      });

      const r = await renderWithScopes(<UserPortal level="organizations" org="acme" />, PLATFORM_ENGINEER);
      unmount = r.unmount;
      for (let i = 0; i < 10 && !r.container.textContent?.includes('Could not load the User Portal in dev'); i++) {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(1_000);
        });
      }

      const enable = button(r.container, 'Enable User Portal');
      expect(enable?.disabled).toBe(true);
      expect(reasonFor(enable)).toBe('Some User Portals could not be read. Retry first.');
    } finally {
      vi.useRealTimers();
    }
  });

  // A deployment of ipaas-service without the User Portal answers its routes with 404.
  it('says the User Portal is coming where the BFF serves none', async () => {
    vi.mocked(api.fetchUserPortalEnvironments).mockResolvedValue([env('dev'), env('prod')]);
    vi.mocked(api.fetchUserPortal).mockRejectedValue(new BffError(404, '404 page not found'));
    const r = await renderWithScopes(<UserPortal level="organizations" org="acme" />, PLATFORM_ENGINEER);
    unmount = r.unmount;
    for (let i = 0; i < 5 && !r.container.textContent?.includes('Coming soon'); i++) await flush();
    expect(r.container.textContent).toContain('Coming soon');
    expect(button(r.container, 'Enable User Portal')).toBeUndefined();
  });

  it('offers Deprovision on every portal but one setting up or being removed', async () => {
    const portals: Record<string, Portal> = {
      dev: { environment: 'dev', state: 'active', url: 'https://dev-up.example' },
      qa: { environment: 'qa', state: 'failed', error: 'portal: readiness timed out' },
      uat: { environment: 'uat', state: 'unhealthy' },
      stage: { environment: 'stage', state: 'setting-up' },
      perf: { environment: 'perf', state: 'starting' },
      prod: { environment: 'prod', state: 'removing' },
    };
    vi.mocked(api.fetchUserPortalEnvironments).mockResolvedValue(Object.keys(portals).map(env));
    vi.mocked(api.fetchUserPortal).mockImplementation(async (environment) => portals[environment]);
    const r = await renderWithScopes(<UserPortal level="organizations" org="acme" />, PLATFORM_ENGINEER);
    unmount = r.unmount;
    const busy = ['Setting up portal…', 'Starting portal…', 'Removing portal…'];
    for (let i = 0; i < 5 && !busy.every((name) => button(r.container, name)); i++) await flush();

    const deprovisions = [...r.container.querySelectorAll('button')].filter((b) => b.textContent?.trim() === 'Deprovision');
    expect(deprovisions).toHaveLength(4);
    expect(deprovisions.every((b) => !b.disabled)).toBe(true);
  });
});

// The page with one environment, dev, whose portal reads as `first`, then as active.
async function renderPage(first: Portal, scopes = PLATFORM_ENGINEER) {
  vi.mocked(api.fetchUserPortalEnvironments).mockResolvedValue([env('dev')]);
  vi.mocked(api.fetchUserPortal).mockResolvedValueOnce(first).mockResolvedValue({ environment: 'dev', state: 'active', url: 'https://dev-up.example' });
  const r = await renderWithScopes(<UserPortal level="organizations" org="acme" />, scopes);
  unmount = r.unmount;
  // The portals are read once the environments are.
  for (let i = 0; i < 5 && !r.container.textContent?.includes('Status'); i++) await flush();
  return r.container;
}

describe("a User Portal card while the portal isn't ready", () => {
  // Only the polling interval is faked: the tests' own settling waits on real timers.
  beforeEach(() => vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] }));
  afterEach(() => vi.useRealTimers());
  const wait = (ms: number) => act(async () => vi.advanceTimersByTimeAsync(ms));
  const openLink = (container: HTMLElement) => [...container.querySelectorAll('a')].find((a) => a.textContent?.trim() === 'Open portal');

  it('says it is starting, with no link, and opens it once a re-read finds it ready', async () => {
    const container = await renderPage({ environment: 'dev', state: 'starting' });
    expect(container.textContent).toContain('Starting');
    expect(button(container, 'Starting portal…')?.disabled).toBe(true);
    expect(openLink(container)).toBeUndefined();

    await wait(3_000);
    await flush();
    expect(openLink(container)?.getAttribute('href')).toBe('https://dev-up.example');
  });

  // It can stay so for hours, so it is read again every 30 seconds, not every 3.
  it("says it isn't ready, with OpenChoreo's reason only on hover, offers no retry, and reads it again less often", async () => {
    const container = await renderPage({ environment: 'dev', state: 'unhealthy', readinessMessage: 'pods are crash-looping' });
    expect(container.textContent).toContain('Not ready');
    const notReady = button(container, 'Portal not ready');
    expect(notReady?.disabled).toBe(true);
    expect(reasonFor(notReady)).toBe('pods are crash-looping');
    expect(container.textContent).not.toContain('pods are crash-looping');
    expect(button(container, 'Retry setup')).toBeUndefined();
    expect(openLink(container)).toBeUndefined();

    await wait(3_000);
    await flush();
    expect(api.fetchUserPortal).toHaveBeenCalledTimes(1);
    await wait(27_000);
    await flush();
    expect(openLink(container)?.getAttribute('href')).toBe('https://dev-up.example');
  });
});

describe('deprovisioning a User Portal', () => {
  // The card's button and the dialog's confirm share their label.
  const dialogButton = (name: string) => [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find((b) => b.textContent?.trim() === name);
  const dialogText = () => document.querySelector('[role="dialog"]')?.textContent ?? '';
  const nameField = (): HTMLInputElement => {
    const field = document.querySelector<HTMLInputElement>('input[aria-label="Environment name"]');
    if (!field) throw new Error('The dialog asks for no environment name.');
    return field;
  };

  async function confirm(container: HTMLElement) {
    await act(async () => button(container, 'Deprovision')?.click());
    await typeInto(nameField(), 'dev');
    await act(async () => dialogButton('Deprovision')?.click());
    await flush();
  }

  it('asks for the environment name first, then shows the portal being removed', async () => {
    vi.mocked(api.disableUserPortal).mockResolvedValue({ environment: 'dev', state: 'removing' });
    const container = await renderPage({ environment: 'dev', state: 'unhealthy' });
    vi.mocked(api.fetchUserPortal).mockResolvedValue({ environment: 'dev', state: 'removing' });

    await act(async () => button(container, 'Deprovision')?.click());
    expect(dialogText()).toContain('This unpublishes every integration published to the User Portal in dev');
    expect(dialogButton('Deprovision')?.disabled).toBe(true);
    await typeInto(nameField(), 'dev');
    expect(dialogButton('Deprovision')?.disabled).toBe(false);
    await act(async () => dialogButton('Deprovision')?.click());
    await flush();

    expect(vi.mocked(api.disableUserPortal).mock.calls[0]?.[0]).toBe('dev');
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(button(container, 'Removing portal…')?.disabled).toBe(true);
    expect(document.body.textContent).toContain('Deprovisioning the User Portal in dev.');
  });

  // A later environment's portal still needs it, so ipaas-service suspends it rather than remove it.
  it('says a suspended portal is deprovisioned, and drops its card', async () => {
    vi.mocked(api.disableUserPortal).mockResolvedValue({ environment: 'dev', state: 'not-enabled' });
    const container = await renderPage({ environment: 'dev', state: 'active', url: 'https://dev-up.example' });
    await confirm(container);

    expect(container.textContent).not.toContain('Status');
    expect(container.textContent).toContain('Enable the User Portal');
    expect(document.body.textContent).toContain('Deprovisioned the User Portal in dev.');
  });

  it('keeps the dialog open on a refusal, saying why, and reads the portal again', async () => {
    vi.mocked(api.disableUserPortal).mockRejectedValue(new BffError(409, '{"code":"USER_PORTAL_COOLING_DOWN","message":"the user portal changed a moment ago; try again in a minute"}'));
    const container = await renderPage({ environment: 'dev', state: 'unhealthy' });
    await confirm(container);

    expect(dialogText()).toContain('the user portal changed a moment ago; try again in a minute');
    expect(api.fetchUserPortal).toHaveBeenCalledTimes(2);
  });

  it('offers no deprovision while a retry of its setup runs', async () => {
    vi.mocked(api.enableUserPortal).mockImplementation(() => new Promise<Portal>(() => {}));
    const container = await renderPage({ environment: 'dev', state: 'failed', error: 'portal: readiness timed out' });
    expect(button(container, 'Deprovision')?.disabled).toBe(false);

    await act(async () => button(container, 'Retry setup')?.click());
    await flush();
    expect(button(container, 'Retrying…')).toBeDefined();
    expect(button(container, 'Deprovision')?.disabled).toBe(true);
  });

  it("tells a role that can't deprovision the User Portal why", async () => {
    const container = await renderPage({ environment: 'dev', state: 'unhealthy' }, DEVELOPER);
    const deprovision = button(container, 'Deprovision');
    expect(deprovision?.disabled).toBe(true);
    expect(reasonFor(deprovision)).toBe("Your role can't deprovision the User Portal.");
  });
});
