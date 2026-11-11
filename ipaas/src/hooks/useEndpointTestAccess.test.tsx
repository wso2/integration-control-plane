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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEndpointTestKey, getEndpointSecurity, setEndpointApiKeyAuth } from '../api/consumers';
import { keyRenewalTime, useEndpointTestAccess, type EndpointTestAccess } from './useEndpointTestAccess';
import { flush, renderWithScopes } from '../test/renderWithScopes';
import { DEVELOPER } from '../test/roles';
import type { EndpointRef } from '../types/consumers';

vi.mock('../api/consumers', () => ({ getEndpointSecurity: vi.fn(), createEndpointTestKey: vi.fn(), setEndpointApiKeyAuth: vi.fn() }));

const a: EndpointRef = { componentName: 'orders', environmentName: 'development', endpointName: 'http', deploymentTrackId: 'main' };
let select: (ref: EndpointRef) => void = () => {};
let switchToApiKey: () => Promise<string | null> = async () => null;
let currentAccess: ReturnType<typeof useEndpointTestAccess> | null = null;

function Selection() {
  const [ref, setRef] = useState(a);
  const access = useEndpointTestAccess(ref);
  currentAccess = access;
  select = setRef;
  switchToApiKey = access.switchToApiKey;
  return <output>{access.apiKey}</output>;
}

let unmount = () => {};
afterEach(() => unmount());
beforeEach(() => {
  vi.resetAllMocks();
  currentAccess = null;
  vi.mocked(getEndpointSecurity).mockResolvedValue({ mode: 'jwt', publicUrl: 'https://gw.example/orders' } as never);
  vi.mocked(createEndpointTestKey).mockImplementation(async (ref) => ({ keyId: 'k', apiKey: `key-for-${ref.endpointName}-${ref.environmentName}-${ref.deploymentTrackId}` }));
});

describe('useEndpointTestAccess', () => {
  it('fails closed without an AI gateway URL and never switches it through API Platform', async () => {
    vi.mocked(getEndpointSecurity).mockResolvedValue({ mode: 'none', aiGateway: { deploymentStatus: 'Deployed' } } as never);
    const r = await renderWithScopes(<Selection />, DEVELOPER);
    unmount = r.unmount;
    await flush();

    expect(currentAccess?.isUnavailable).toBe(true);
    expect(currentAccess?.canCreateKey).toBe(true);
    expect(currentAccess?.canSwitch).toBe(false);
    await act(async () => void (await currentAccess?.switchToApiKey()));
    await act(async () => void (await currentAccess?.mintKey()));
    expect(setEndpointApiKeyAuth).not.toHaveBeenCalled();
    expect(createEndpointTestKey).not.toHaveBeenCalled();
  });

  it('offers no switch where the security comes by promotion, and says where it is managed', async () => {
    vi.mocked(getEndpointSecurity).mockResolvedValue({ mode: 'jwt', publicUrl: 'https://gw.example/orders', editable: false, entryEnvironment: 'development' } as never);
    const r = await renderWithScopes(<Selection />, DEVELOPER);
    unmount = r.unmount;
    await flush();

    expect(currentAccess?.needsApiKeyAuth).toBe(true);
    expect(currentAccess?.canSwitch).toBe(false);
    expect(currentAccess?.managedIn).toBe('development');
    await act(async () => void (await currentAccess?.switchToApiKey()));
    expect(setEndpointApiKeyAuth).not.toHaveBeenCalled();
  });

  it('switches where the security is managed', async () => {
    const r = await renderWithScopes(<Selection />, DEVELOPER);
    unmount = r.unmount;
    await flush();
    expect(currentAccess?.canSwitch).toBe(true);
    expect(currentAccess?.managedIn).toBeNull();
  });

  it.each([
    ['endpoint', { ...a, endpointName: 'admin' }],
    ['environment', { ...a, environmentName: 'production' }],
    ['track', { ...a, deploymentTrackId: 'next' }],
  ])('switches and mints for the endpoint clicked, though the %s changes before the switch returns', async (_, b) => {
    let finishSwitch: (done: boolean) => void = () => {};
    vi.mocked(setEndpointApiKeyAuth).mockReturnValue(new Promise((resolve) => (finishSwitch = resolve)));
    const r = await renderWithScopes(<Selection />, DEVELOPER);
    unmount = r.unmount;
    await flush();

    let switching: Promise<string | null> = Promise.resolve(null);
    await act(async () => void (switching = switchToApiKey()));
    await act(async () => select(b));
    await act(async () => {
      finishSwitch(true);
      await switching;
    });

    expect(setEndpointApiKeyAuth).toHaveBeenCalledWith(a, true);
    expect(createEndpointTestKey).toHaveBeenCalledWith(a);
    expect(createEndpointTestKey).not.toHaveBeenCalledWith(b);
    expect(r.container.textContent).toBe('');
    await act(async () => select(a));
    expect(r.container.textContent).toBe('key-for-http-development-main');
  });
});

describe('the key held for an endpoint', () => {
  // One view of endpoint `a`, as the Overview card, the Test Console or a workflow page would be.
  const views: Record<string, EndpointTestAccess> = {};
  function View({ id }: { id: string }) {
    const access = useEndpointTestAccess(a);
    views[id] = access;
    return <output data-view={id}>{access.apiKey}</output>;
  }
  let showSecond: (show: boolean) => void = () => {};
  function Views() {
    const [second, setSecond] = useState(false);
    showSecond = setSecond;
    return (
      <>
        <View id="first" />
        {second && <View id="second" />}
      </>
    );
  }
  const shown = (container: HTMLElement, id: string) => container.querySelector(`[data-view="${id}"]`)?.textContent ?? null;

  let mints = 0;
  beforeEach(() => {
    mints = 0;
    vi.mocked(getEndpointSecurity).mockResolvedValue({ mode: 'api-key', publicUrl: 'https://gw.example/orders' } as never);
    // Each mint is a new key, valid for ten minutes.
    vi.mocked(createEndpointTestKey).mockImplementation(async () => {
      mints += 1;
      return { keyId: `k${mints}`, apiKey: `key-${mints}`, expiresAt: new Date(Date.now() + 10 * 60_000).toISOString() };
    });
  });
  afterEach(() => vi.useRealTimers());

  it('is minted once and shared by every view of the endpoint, including one that comes back', async () => {
    const r = await renderWithScopes(<Views />, DEVELOPER);
    unmount = r.unmount;
    await flush();
    await act(async () => showSecond(true));
    await flush();
    expect(shown(r.container, 'first')).toBe('key-1');
    expect(shown(r.container, 'second')).toBe('key-1');

    // Leaving a view and coming back to it, as navigating does, reuses the key too.
    await act(async () => showSecond(false));
    await act(async () => showSecond(true));
    await flush();
    expect(shown(r.container, 'second')).toBe('key-1');
    expect(mints).toBe(1);
  });

  it('is renewed a minute before it expires, once, for every view', async () => {
    vi.useFakeTimers();
    const settle = () => act(async () => void (await vi.advanceTimersByTimeAsync(0)));
    const r = await renderWithScopes(<Views />, DEVELOPER);
    unmount = r.unmount;
    await settle();
    await act(async () => showSecond(true));
    await settle();
    expect(mints).toBe(1);

    await act(async () => void (await vi.advanceTimersByTimeAsync(9 * 60_000 - 1_000)));
    expect(mints).toBe(1);
    await act(async () => void (await vi.advanceTimersByTimeAsync(2_000)));
    await settle();
    expect(mints).toBe(2);
    expect(shown(r.container, 'first')).toBe('key-2');
    expect(shown(r.container, 'second')).toBe('key-2');
  });

  it('is renewed again after a pause, not every second, when a renewal fails', async () => {
    vi.useFakeTimers();
    const settle = () => act(async () => void (await vi.advanceTimersByTimeAsync(0)));
    const r = await renderWithScopes(<Views />, DEVELOPER);
    unmount = r.unmount;
    await settle();
    expect(mints).toBe(1);

    let attempts = 0;
    vi.mocked(createEndpointTestKey).mockImplementation(async () => {
      attempts += 1;
      throw Object.assign(new Error('HTTP 503'), { status: 503 });
    });
    await act(async () => void (await vi.advanceTimersByTimeAsync(9 * 60_000 + 1_000)));
    expect(attempts).toBe(1);
    // The held key is still in use meanwhile.
    expect(shown(r.container, 'first')).toBe('key-1');
    await act(async () => void (await vi.advanceTimersByTimeAsync(20_000)));
    expect(attempts).toBe(1);
    await act(async () => void (await vi.advanceTimersByTimeAsync(11_000)));
    expect(attempts).toBe(2);
  });

  it('counts an answer without a key as a failed mint, which a view that mounts tries again', async () => {
    vi.mocked(createEndpointTestKey).mockImplementationOnce(async () => {
      mints += 1;
      return { keyId: 'k', apiKey: '' };
    });
    const r = await renderWithScopes(<Views />, DEVELOPER);
    unmount = r.unmount;
    // The mint starts once the security read has rendered, and its failure lands a tick later.
    await vi.waitFor(async () => {
      await flush();
      expect(views.first.keyError).toBe('Could not mint a test key.');
    });
    expect(shown(r.container, 'first')).toBe('');

    await act(async () => showSecond(true));
    await flush();
    expect(mints).toBe(2);
    expect(shown(r.container, 'second')).toBe('key-2');
    expect(views.first.keyError).toBeNull();
  });

  it('is minted again on an explicit request, and every view moves to the new key', async () => {
    const r = await renderWithScopes(<Views />, DEVELOPER);
    unmount = r.unmount;
    await flush();
    await act(async () => showSecond(true));
    await flush();

    await act(async () => void (await views.second.mintKey()));
    await flush();
    expect(mints).toBe(2);
    expect(shown(r.container, 'first')).toBe('key-2');
  });

  it('shows a mint while a view has no key or asked for one, not while a held key renews', async () => {
    vi.useFakeTimers();
    const settle = () => act(async () => void (await vi.advanceTimersByTimeAsync(0)));
    let release = () => {};
    vi.mocked(createEndpointTestKey).mockImplementation(async () => {
      mints += 1;
      const n = mints;
      await new Promise<void>((resolve) => (release = resolve));
      return { keyId: `k${n}`, apiKey: `key-${n}`, expiresAt: new Date(Date.now() + 10 * 60_000).toISOString() };
    });
    const r = await renderWithScopes(<Views />, DEVELOPER);
    unmount = r.unmount;
    await settle();
    expect(mints).toBe(1);
    expect(views.first.isMinting).toBe(true);
    await act(async () => release());
    await settle();
    expect(views.first.apiKey).toBe('key-1');
    expect(views.first.isMinting).toBe(false);

    // The renewal before expiry: the view keeps using key-1 meanwhile.
    await act(async () => void (await vi.advanceTimersByTimeAsync(9 * 60_000 + 1_000)));
    expect(mints).toBe(2);
    expect(views.first.isMinting).toBe(false);
    await act(async () => release());
    await settle();
    expect(views.first.apiKey).toBe('key-2');

    // A new key the view asks for, while it holds one.
    let minted: Promise<string | null> = Promise.resolve(null);
    await act(async () => void (minted = views.first.mintKey()));
    expect(mints).toBe(3);
    expect(views.first.isMinting).toBe(true);
    await act(async () => {
      release();
      await minted;
    });
    await settle();
    expect(views.first.apiKey).toBe('key-3');
    expect(views.first.isMinting).toBe(false);
  });

  it('is renewed only while the refused key is still held, so views that hear one refusal mint once', async () => {
    const r = await renderWithScopes(<Views />, DEVELOPER);
    unmount = r.unmount;
    await flush();
    await act(async () => showSecond(true));
    await flush();

    // Both views hear key-1 refused at once: one mint answers both.
    let renewed: (string | null)[] = [];
    await act(async () => void (renewed = await Promise.all([views.first.renewKey('key-1'), views.second.renewKey('key-1')])));
    expect(renewed).toEqual(['key-2', 'key-2']);
    expect(mints).toBe(2);

    // A refusal of key-1 that arrives late finds key-2 held and reuses it.
    await act(async () => void (renewed = [await views.first.renewKey('key-1')]));
    expect(renewed).toEqual(['key-2']);
    expect(mints).toBe(2);
    await flush();
    expect(shown(r.container, 'first')).toBe('key-2');
  });
});

describe('a key for an MCP server on the AI gateway', () => {
  // The Test page relays through ipaas-service, which holds a key of its own: a key here is for another MCP client.
  const views: Record<string, EndpointTestAccess> = {};
  function View({ id, target = a }: { id: string; target?: EndpointRef }) {
    const access = useEndpointTestAccess(target);
    views[id] = access;
    return <output data-view={id}>{access.apiKey}</output>;
  }
  let showLater: (show: boolean) => void = () => {};
  function Views() {
    const [later, setLater] = useState(false);
    showLater = setLater;
    return (
      <>
        <View id="first" />
        {later && <View id="later" />}
      </>
    );
  }
  const shown = (container: HTMLElement, id: string) => container.querySelector(`[data-view="${id}"]`)?.textContent ?? null;
  const onGateway = (mode: string) => ({ mode, publicUrl: 'https://ai-gw.example/demo/orders/mcp', aiGateway: { deploymentStatus: 'Deployed' } }) as never;
  const coded = (status: number, code?: string) => Object.assign(new Error(`HTTP ${status}`), { status, code });

  let mints = 0;
  beforeEach(() => {
    mints = 0;
    vi.mocked(getEndpointSecurity).mockResolvedValue(onGateway('api-key'));
    vi.mocked(createEndpointTestKey).mockImplementation(async (ref) => {
      mints += 1;
      return { keyId: `k${mints}`, apiKey: `key-${mints}-${ref.environmentName}`, expiresAt: new Date(Date.now() + 60 * 60_000).toISOString() };
    });
  });
  afterEach(() => vi.useRealTimers());

  it('is minted only when asked for, and held for the endpoint across views', async () => {
    const r = await renderWithScopes(<Views />, DEVELOPER);
    unmount = r.unmount;
    await flush();
    expect(createEndpointTestKey).not.toHaveBeenCalled();
    expect(views.first.needsApiKeyAuth).toBe(false);

    await act(async () => void (await views.first.mintKey()));
    await flush();
    expect(shown(r.container, 'first')).toBe('key-1-development');

    // A view that mounts later, as the page after navigating back, shows the same key without minting.
    await act(async () => showLater(true));
    await flush();
    expect(shown(r.container, 'later')).toBe('key-1-development');
    expect(mints).toBe(1);
  });

  it('joins a mint in flight instead of issuing a second key', async () => {
    const r = await renderWithScopes(<View id="first" />, DEVELOPER);
    unmount = r.unmount;
    await flush();
    await act(async () => void (await Promise.all([views.first.mintKey(), views.first.mintKey()])));
    expect(mints).toBe(1);
  });

  it('keeps a key that lands after the selection moved on for the endpoint it was minted for', async () => {
    let finish: () => void = () => {};
    vi.mocked(createEndpointTestKey).mockImplementationOnce((ref) => new Promise((resolve) => (finish = () => resolve({ keyId: 'k', apiKey: `late-${ref.environmentName}`, expiresAt: new Date(Date.now() + 60 * 60_000).toISOString() }))));
    const r = await renderWithScopes(<Selection />, DEVELOPER);
    unmount = r.unmount;
    vi.mocked(getEndpointSecurity).mockResolvedValue(onGateway('api-key'));
    await flush();
    let minting: Promise<string | null> = Promise.resolve(null);
    await act(async () => void (minting = currentAccess!.mintKey()));
    await act(async () => select({ ...a, environmentName: 'production' }));
    await act(async () => {
      finish();
      await minting;
    });
    expect(r.container.textContent).toBe('');
    await act(async () => select(a));
    expect(r.container.textContent).toBe('late-development');
  });

  it('is not minted for a binding that checks no key', async () => {
    vi.mocked(getEndpointSecurity).mockResolvedValue(onGateway('none'));
    const r = await renderWithScopes(<View id="first" />, DEVELOPER);
    unmount = r.unmount;
    await flush();
    await act(async () => void (await views.first.mintKey()));
    expect(createEndpointTestKey).not.toHaveBeenCalled();
  });

  it.each([
    ['an answer without a key', async () => ({ keyId: 'k', apiKey: '' }), 'Could not mint a test key.'],
    ['a 409 that reads as an unexposed API elsewhere', async () => Promise.reject(coded(409)), 'Could not mint a test key.'],
    ['a binding that stopped checking keys', async () => Promise.reject(coded(409, 'MCP_API_KEY_NOT_CHECKED')), 'This MCP server’s AI gateway URL takes no API key, so it needs no test key.'],
  ])('reports %s as a failed mint', async (_, answer, message) => {
    vi.mocked(createEndpointTestKey).mockImplementation(answer as never);
    const r = await renderWithScopes(<View id="first" />, DEVELOPER);
    unmount = r.unmount;
    await flush();
    await act(async () => void (await views.first.mintKey()));
    await vi.waitFor(async () => {
      await flush();
      expect(views.first.keyError).toBe(message);
    });
    expect(shown(r.container, 'first')).toBe('');
  });

  it('is neither renewed nor shown once it is due for renewal', async () => {
    vi.useFakeTimers();
    const settle = () => act(async () => void (await vi.advanceTimersByTimeAsync(0)));
    const r = await renderWithScopes(<Views />, DEVELOPER);
    unmount = r.unmount;
    await settle();
    await act(async () => void (await views.first.mintKey()));
    await settle();
    expect(shown(r.container, 'first')).toBe('key-1-development');

    await act(async () => void (await vi.advanceTimersByTimeAsync(59 * 60_000 + 1_000)));
    await act(async () => showLater(true));
    await settle();
    expect(mints).toBe(1);
    expect(shown(r.container, 'first')).toBe('');
    expect(shown(r.container, 'later')).toBe('');
  });
});

describe('keyRenewalTime', () => {
  const mintedAt = Date.parse('2026-11-07T10:00:00Z');

  it('is a minute before the key expires', () => {
    expect(keyRenewalTime('2026-11-07T11:00:00Z', mintedAt)).toBe(mintedAt + 59 * 60_000);
  });

  it('assumes the hour a test key lasts when the mint states no expiry, or one that cannot be read', () => {
    expect(keyRenewalTime(undefined, mintedAt)).toBe(mintedAt + 59 * 60_000);
    expect(keyRenewalTime('soon', mintedAt)).toBe(mintedAt + 59 * 60_000);
  });

  it('never waits past the hour a test key lasts, so a browser clock behind the server’s cannot renew a key after it expired', () => {
    expect(keyRenewalTime('2026-11-07T12:00:00Z', mintedAt)).toBe(mintedAt + 59 * 60_000);
  });

  it('keeps a key for at least 5 minutes when it states a longer life, so a browser clock ahead of the server’s costs little', () => {
    expect(keyRenewalTime('2026-11-07T10:06:00Z', mintedAt)).toBe(mintedAt + 5 * 60_000);
  });

  it('renews a key that states a life of a few minutes before it expires', () => {
    expect(keyRenewalTime('2026-11-07T10:04:00Z', mintedAt)).toBe(mintedAt + 3 * 60_000);
    expect(keyRenewalTime('2026-11-07T10:02:00Z', mintedAt)).toBe(mintedAt + 60_000);
  });

  it('keeps a key that looks spent for 30 seconds, so a browser clock far ahead of the server’s cannot mint in a loop', () => {
    expect(keyRenewalTime('2026-11-07T10:00:45Z', mintedAt)).toBe(mintedAt + 30_000);
    expect(keyRenewalTime('2026-11-07T09:00:00Z', mintedAt)).toBe(mintedAt + 30_000);
  });
});
