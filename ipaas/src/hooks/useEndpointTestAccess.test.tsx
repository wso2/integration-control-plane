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

function Selection() {
  const [ref, setRef] = useState(a);
  const access = useEndpointTestAccess(ref);
  select = setRef;
  switchToApiKey = access.switchToApiKey;
  return <output>{access.apiKey}</output>;
}

let unmount = () => {};
afterEach(() => unmount());
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getEndpointSecurity).mockResolvedValue({ mode: 'jwt', publicUrl: 'https://gw.example/orders' } as never);
  vi.mocked(createEndpointTestKey).mockImplementation(async (ref) => ({ keyId: 'k', apiKey: `key-for-${ref.endpointName}-${ref.environmentName}-${ref.deploymentTrackId}` }));
});

describe('useEndpointTestAccess', () => {
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
    // Each mint is a new key, valid for two minutes.
    vi.mocked(createEndpointTestKey).mockImplementation(async () => {
      mints += 1;
      return { keyId: `k${mints}`, apiKey: `key-${mints}`, expiresAt: new Date(Date.now() + 2 * 60_000).toISOString() };
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

    await act(async () => void (await vi.advanceTimersByTimeAsync(59_000)));
    expect(mints).toBe(1);
    await act(async () => void (await vi.advanceTimersByTimeAsync(2_000)));
    await settle();
    expect(mints).toBe(2);
    expect(shown(r.container, 'first')).toBe('key-2');
    expect(shown(r.container, 'second')).toBe('key-2');
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

describe('keyRenewalTime', () => {
  const mintedAt = Date.parse('2026-11-07T10:00:00Z');

  it('is a minute before the key expires', () => {
    expect(keyRenewalTime('2026-11-07T11:00:00Z', mintedAt)).toBe(mintedAt + 59 * 60_000);
  });

  it('assumes the hour a test key lasts when the mint states no expiry, or one that cannot be read', () => {
    expect(keyRenewalTime(undefined, mintedAt)).toBe(mintedAt + 59 * 60_000);
    expect(keyRenewalTime('soon', mintedAt)).toBe(mintedAt + 59 * 60_000);
  });

  it('keeps a key for at least 30 seconds, so a short or skewed expiry cannot mint in a loop', () => {
    expect(keyRenewalTime('2026-11-07T10:00:45Z', mintedAt)).toBe(mintedAt + 30_000);
    expect(keyRenewalTime('2026-11-07T09:00:00Z', mintedAt)).toBe(mintedAt + 30_000);
  });
});
