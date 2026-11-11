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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OrganizationSwitchError, canSwitchOrganization, loadConsoleHome, switchOrganization } from './orgSwitch';

const CLOUD = '/_auth/cloud/switch';
const OWN = '/_auth/integration/switch';

beforeEach(() => {
  window.API_CONFIG = { authBffContext: '/_auth/integration', organizationSwitchUrls: [CLOUD, OWN] } as unknown as typeof window.API_CONFIG;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** A gateway that answers each switch path with the given status, recording `path ouId` per call. */
function gateway(statuses: Record<string, number> = {}): string[] {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init: RequestInit) => {
      const url = new URL(input, 'https://console.example');
      const { ouId } = JSON.parse(init.body as string) as { ouId: string };
      calls.push(`${url.pathname} ${url.searchParams.get('ouId') === ouId ? ouId : 'mismatch'}`);
      return new Response(null, { status: statuses[`${url.pathname} ${ouId}`] ?? 200 });
    }),
  );
  return calls;
}

describe('canSwitchOrganization', () => {
  it('is on with switch endpoints and gateway sign-in', () => {
    expect(canSwitchOrganization()).toBe(true);
  });

  it('is off without switch endpoints', () => {
    window.API_CONFIG.organizationSwitchUrls = [];
    expect(canSwitchOrganization()).toBe(false);
  });

  // Only the gateway can move a session in place; a browser-held token stays in its organization.
  it('is off when the browser signs in itself', () => {
    window.API_CONFIG.authBffContext = undefined;
    expect(canSwitchOrganization()).toBe(false);
  });
});

describe('switchOrganization', () => {
  it('moves the cloud session first, then this console’s, with the unit in the query and the body', async () => {
    const calls = gateway();
    await switchOrganization('org-b', 'org-a');
    expect(calls).toEqual([`${CLOUD} org-b`, `${OWN} org-b`]);
  });

  it('sends the CSRF header and the session cookies', async () => {
    gateway();
    await switchOrganization('org-b', 'org-a');
    const init = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    expect(init).toMatchObject({ method: 'POST', credentials: 'include' });
    expect(init.headers).toMatchObject({ 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json' });
  });

  it('stops at a refused first step without moving anything back', async () => {
    const calls = gateway({ [`${CLOUD} org-b`]: 403 });
    await expect(switchOrganization('org-b', 'org-a')).rejects.toMatchObject({ reason: 'forbidden' });
    expect(calls).toEqual([`${CLOUD} org-b`]);
  });

  it('moves the cloud session back when this console’s session cannot follow', async () => {
    const calls = gateway({ [`${OWN} org-b`]: 503 });
    const failure = switchOrganization('org-b', 'org-a');
    await expect(failure).rejects.toBeInstanceOf(OrganizationSwitchError);
    await expect(failure).rejects.toMatchObject({ reason: 'failed' });
    expect(calls).toEqual([`${CLOUD} org-b`, `${OWN} org-b`, `${CLOUD} org-a`]);
  });

  it('reports an incomplete switch when the cloud session cannot be moved back either', async () => {
    const calls = gateway({ [`${OWN} org-b`]: 403, [`${CLOUD} org-a`]: 503 });
    await expect(switchOrganization('org-b', 'org-a')).rejects.toMatchObject({ reason: 'incomplete' });
    expect(calls).toEqual([`${CLOUD} org-b`, `${OWN} org-b`, `${CLOUD} org-a`]);
  });

  it('reports a network failure as a failed switch', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('offline'))),
    );
    await expect(switchOrganization('org-b', 'org-a')).rejects.toMatchObject({ reason: 'failed' });
  });
});

describe('loadConsoleHome', () => {
  it('loads the console root in a full page load', () => {
    const assign = vi.spyOn(window.location, 'assign').mockImplementation(() => undefined);
    loadConsoleHome();
    expect(assign).toHaveBeenCalledWith('/');
  });
});
