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
import UserPortalPrompt from './UserPortalPrompt';
import { BffError } from '../../api/_client';
import * as api from '../../api/userPortal';
import { button, flush, reasonFor, renderWithScopes } from '../../test/renderWithScopes';
import { DEVELOPER, PLATFORM_ENGINEER } from '../../test/roles';
import type { UserPortal, UserPortalPublishability } from '../../types/userPortal';

vi.mock('../../api/userPortal', () => ({
  fetchUserPortal: vi.fn(),
  enableUserPortal: vi.fn(),
  fetchUserPortalPublishability: vi.fn(),
  publishToUserPortal: vi.fn(),
}));

const portal = vi.mocked(api.fetchUserPortal);
const enable = vi.mocked(api.enableUserPortal);
const publishability = vi.mocked(api.fetchUserPortalPublishability);
const publish = vi.mocked(api.publishToUserPortal);

const ACTIVE: UserPortal = { environment: 'production', state: 'active', url: 'https://portal.example/acme' };
const PUBLISHABLE: UserPortalPublishability = { environment: 'production', published: false, publishable: true, reasons: [], redeploys: true };
const NOT_ENABLED: UserPortalPublishability = {
  ...PUBLISHABLE,
  publishable: false,
  reasons: [{ code: 'USER_PORTAL_NOT_ENABLED', message: 'the user portal is not enabled in this environment' }],
};

let unmount = () => {};
afterEach(() => unmount());
beforeEach(() => vi.clearAllMocks());

async function prompt(scopes: string[]) {
  const r = await renderWithScopes(
    <MemoryRouter>
      <UserPortalPrompt orgHandler="acme" componentId="orders" environment={{ id: 'production', name: 'Production', critical: true }} />
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
    publish.mockResolvedValue({ environment: 'production', published: true, rejectedScopes: [] });
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
