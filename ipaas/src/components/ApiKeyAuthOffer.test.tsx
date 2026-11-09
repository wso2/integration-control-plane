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
import ApiKeyAuthOffer from './ApiKeyAuthOffer';
import { BffError } from '../api/_client';
import { createEndpointTestKey, getEndpointSecurity, setEndpointApiKeyAuth } from '../api/consumers';
import { useEndpointTestAccess } from '../hooks/useEndpointTestAccess';
import { Scopes } from '../constants/permissions';
import { button, flush, renderWithScopes } from '../test/renderWithScopes';
import { DEVELOPER, VIEWER } from '../test/roles';
import type { EndpointRef } from '../types/consumers';

vi.mock('../api/consumers', () => ({ getEndpointSecurity: vi.fn(), createEndpointTestKey: vi.fn(), setEndpointApiKeyAuth: vi.fn() }));

const ref: EndpointRef = { componentName: 'orders', environmentName: 'development', endpointName: 'http', deploymentTrackId: 'v1' };

/** The Test page's part of the flow: the auto-minted key's refusal, the offer, and the key once minted. */
function TestKey({ agent = false }: { agent?: boolean }) {
  const access = useEndpointTestAccess(ref, { agent });
  return (
    <>
      <ApiKeyAuthOffer access={access} />
      <output>{access.apiKey}</output>
    </>
  );
}

let unmount = () => {};
afterEach(() => unmount());
beforeEach(() => {
  vi.resetAllMocks();
  // The stored mode says api-key, but the endpoint has since been switched to OAuth.
  vi.mocked(getEndpointSecurity).mockResolvedValue({ mode: 'api-key', publicUrl: 'https://gw.example/orders' } as never);
  vi.mocked(createEndpointTestKey).mockRejectedValue(new BffError(409, JSON.stringify({ code: 'API_KEY_AUTH_REQUIRED', message: 'the endpoint does not use API-key auth' })));
  vi.mocked(setEndpointApiKeyAuth).mockResolvedValue(true);
});

async function refusedTestKey(scopes: string[], agent = false) {
  const r = await renderWithScopes(<TestKey agent={agent} />, scopes);
  unmount = r.unmount;
  await flush();
  return r.container;
}

/** Waits for the auto-minted key's refusal to reach the page: the mint starts only once the security read has rendered. */
const refusalShown = () =>
  vi.waitFor(async () => {
    await flush();
    expect(document.body.textContent).toContain("can't issue a test key");
  });

describe('ApiKeyAuthOffer', () => {
  it('points to where the security is managed when it comes by promotion, and offers no switch', async () => {
    vi.mocked(getEndpointSecurity).mockResolvedValue({ mode: 'jwt', publicUrl: 'https://gw.example/orders', editable: false, entryEnvironment: 'development' } as never);
    const c = await refusedTestKey(DEVELOPER);
    await refusalShown();
    expect(button(c, 'Switch to API key')).toBeUndefined();
    expect(document.body.textContent).toContain('Its security is managed in development. Switch it to API key there, then promote to apply it here.');
  });

  it('explains a 409 and switches the endpoint to API key, then mints', async () => {
    const c = await refusedTestKey(DEVELOPER);
    await refusalShown();
    expect(document.body.textContent).toContain('changes how every caller of this API authenticates');

    vi.mocked(createEndpointTestKey).mockResolvedValue({ keyId: 'k', apiKey: 'test-key-1' });
    await act(async () => button(c, 'Switch to API key')!.click());
    await flush();
    expect(setEndpointApiKeyAuth).toHaveBeenCalledWith(ref, true);
    expect(c.querySelector('output')?.textContent).toBe('test-key-1');
    expect(button(c, 'Switch to API key')).toBeUndefined();
  });

  it('only explains to a role that may test the endpoint but not change its security', async () => {
    const c = await refusedTestKey(DEVELOPER.filter((s) => s !== Scopes.ENDPOINT_UPDATE));
    await refusalShown();
    expect(button(c, 'Switch to API key')).toBeUndefined();
  });

  it("only explains for an AI agent, whose security Agent Manager owns, not the API Platform's API the switch edits", async () => {
    const c = await refusedTestKey(DEVELOPER, true);
    await refusalShown();
    expect(document.body.textContent).not.toContain('Switching it');
    expect(button(c, 'Switch to API key')).toBeUndefined();
  });

  it('asks nothing for a Viewer, who may not create test keys', async () => {
    await refusedTestKey(VIEWER);
    expect(createEndpointTestKey).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain("can't issue a test key");
  });
});
