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
import { useEndpointTestAccess } from './useEndpointTestAccess';
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
