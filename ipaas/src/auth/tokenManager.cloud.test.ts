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

vi.mock('../features', () => ({ IS_CLOUD: true, IS_WIP: false, IS_ICP: false }));

type TokenManager = typeof import('./tokenManager');
type Handler = (body: URLSearchParams | null) => Response | Promise<Response>;

const IDP_TOKEN = 'https://thunder.example/oauth2/token';
const API = 'https://bff.example/resource';

const jwt = (claims: Record<string, unknown>): string => `h.${btoa(JSON.stringify(claims)).replace(/=+$/, '')}.s`;
const json = (data: unknown, status = 200): Response => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

let tm: TokenManager;
let calls: Array<{ url: string; body: URLSearchParams | null; auth: string | null }>;
let routes: Record<string, Handler>;

function callsTo(url: string) {
  return calls.filter((c) => c.url === url);
}

// What a reloaded page starts with: only the refresh token and metadata survive in storage.
function seedStoredSession(): void {
  localStorage.setItem('refresh_token', 'rt-1');
  localStorage.setItem('org_handle', 'acme');
  localStorage.setItem('user', JSON.stringify({ userId: 'u1', username: 'user', displayName: 'User', isOidcUser: true, requirePasswordChange: false }));
}

// A live session: the stored session plus an in-memory access token.
function seedSession({ expired }: { expired: boolean }): void {
  seedStoredSession();
  tm.saveTokens({ token: 'stored-token', expiresIn: expired ? -1 : 3600, refreshToken: 'rt-1' });
}

beforeEach(async () => {
  localStorage.clear();
  calls = [];
  routes = {
    [API]: () => new Response('ok'),
    [IDP_TOKEN]: () => json({ access_token: 'thunder-token', refresh_token: 'rt-2', expires_in: 1800 }),
  };
  // Cloud configs leave STS unset: Thunder's token is used as is.
  window.API_CONFIG = {
    asgardeoClientId: 'cloud-client',
    asgardeoTokenEndpoint: IDP_TOKEN,
    stsTokenEndpoint: '',
    stsClientId: '',
    stsScope: '',
    authBaseUrl: 'https://auth.example',
  } as unknown as typeof window.API_CONFIG;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init: RequestInit = {}) => {
      calls.push({ url: input, body: typeof init.body === 'string' ? new URLSearchParams(init.body) : null, auth: new Headers(init.headers).get('Authorization') });
      const handler = routes[input];
      if (!handler) throw new Error(`Unexpected fetch: ${input}`);
      return handler(calls[calls.length - 1].body);
    }),
  );
  vi.resetModules();
  tm = await import('./tokenManager');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('tokenManager (cloud)', () => {
  it('sends the stored token without refreshing while it is still valid', async () => {
    seedSession({ expired: false });
    await tm.authenticatedFetch(API);
    expect(calls.map((c) => c.url)).toEqual([API]);
    expect(calls[0].auth).toBe('Bearer stored-token');
  });

  it('refreshes an expired token with the IdP alone and stores it as the access token', async () => {
    seedSession({ expired: true });
    await tm.authenticatedFetch(API);

    expect(calls.map((c) => c.url)).toEqual([IDP_TOKEN, API]);
    expect(Object.fromEntries(calls[0].body as URLSearchParams)).toEqual({ grant_type: 'refresh_token', refresh_token: 'rt-1', client_id: 'cloud-client' });
    expect(calls[1].auth).toBe('Bearer thunder-token');
    expect(tm.getAccessToken()).toBe('thunder-token');
    expect(tm.getRefreshToken()).toBe('rt-2');
  });

  it('holds one token: an expired sign-in token is refreshed with the IdP, not reused', async () => {
    // As the sign-in callback does: the IdP token is stored as the access token with its real,
    // here already-spent, lifetime.
    seedStoredSession();
    tm.saveTokens({ token: 'sign-in-token', expiresIn: -1, refreshToken: 'rt-1' });
    await tm.authenticatedFetch(API);
    expect(calls.map((c) => c.url)).toEqual([IDP_TOKEN, API]);
    expect(calls[1].auth).toBe('Bearer thunder-token');
    expect(tm.getAccessToken()).toBe('thunder-token');
  });

  it('keeps the access token in memory and only the refresh token in storage', async () => {
    seedSession({ expired: true });
    await tm.authenticatedFetch(API);
    expect(localStorage.getItem('auth_token')).toBeNull();
    expect(localStorage.getItem('token_expires_at')).toBeNull();
    expect(Object.values({ ...localStorage })).not.toContain('thunder-token');
    expect(localStorage.getItem('refresh_token')).toBe('rt-2');
  });

  it('retries once with the refresh token another tab rotated in the meantime', async () => {
    seedSession({ expired: true });
    const onFailure = vi.fn();
    tm.setOnAuthFailure(onFailure);
    routes[IDP_TOKEN] = (body) => {
      if (body?.get('refresh_token') === 'rt-1') {
        localStorage.setItem('refresh_token', 'rt-other-tab');
        return json({ error: 'invalid_grant' }, 400);
      }
      return json({ access_token: 'thunder-token', refresh_token: 'rt-3', expires_in: 1800 });
    };
    await tm.authenticatedFetch(API);
    expect(callsTo(IDP_TOKEN).map((c) => c.body?.get('refresh_token'))).toEqual(['rt-1', 'rt-other-tab']);
    expect(onFailure).not.toHaveBeenCalled();
    expect(tm.getAccessToken()).toBe('thunder-token');
    expect(tm.getRefreshToken()).toBe('rt-3');
  });

  it('shares one refresh between concurrent requests', async () => {
    seedSession({ expired: true });
    await Promise.all([tm.authenticatedFetch(API), tm.authenticatedFetch(API), tm.refreshAccessToken()]);
    expect(callsTo(IDP_TOKEN)).toHaveLength(1);
  });

  it('refreshes and retries once on a 401', async () => {
    seedSession({ expired: false });
    let first = true;
    routes[API] = () => {
      const res = new Response('x', { status: first ? 401 : 200 });
      first = false;
      return res;
    };
    const res = await tm.authenticatedFetch(API);
    expect(res.status).toBe(200);
    expect(callsTo(API).map((c) => c.auth)).toEqual(['Bearer stored-token', 'Bearer thunder-token']);
  });

  it('keeps a refresh token another tab stored when the IdP does not rotate it', async () => {
    seedSession({ expired: true });
    routes[IDP_TOKEN] = () => {
      localStorage.setItem('refresh_token', 'rt-other-tab');
      return json({ access_token: 'thunder-token', expires_in: 1800 });
    };
    await tm.refreshAccessToken();
    expect(tm.getAccessToken()).toBe('thunder-token');
    expect(tm.getRefreshToken()).toBe('rt-other-tab');
  });

  it.each([
    ['403', () => new Response('', { status: 403 })],
    ['400 invalid_grant', () => json({ error: 'invalid_grant' }, 400)],
  ])('ends the session when the IdP rejects the refresh token (%s)', async (_label, handler) => {
    seedSession({ expired: true });
    const onFailure = vi.fn();
    tm.setOnAuthFailure(onFailure);
    routes[IDP_TOKEN] = handler;
    await tm.refreshAccessToken();
    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(tm.getAccessToken()).toBeNull();
    expect(tm.getRefreshToken()).toBeNull();
  });

  it('keeps the session on a transient IdP error', async () => {
    seedSession({ expired: true });
    const onFailure = vi.fn();
    tm.setOnAuthFailure(onFailure);
    routes[IDP_TOKEN] = () => new Response('', { status: 502 });
    await tm.refreshAccessToken();
    expect(onFailure).not.toHaveBeenCalled();
    expect(tm.getAccessToken()).toBe('stored-token');
    expect(tm.getRefreshToken()).toBe('rt-1');
  });

  it('rejects an org switch without calling anything', async () => {
    seedSession({ expired: false });
    await expect(tm.switchOrgToken('other-org')).rejects.toThrow();
    expect(calls).toHaveLength(0);
    expect(localStorage.getItem('org_handle')).toBe('acme');
    expect(tm.getAccessToken()).toBe('stored-token');
  });

  it('drops the token on clearTokens', () => {
    seedSession({ expired: false });
    tm.clearTokens();
    expect(tm.getAccessToken()).toBeNull();
    expect(tm.hasStoredSession()).toBe(false);
  });

  it('reads the org UUID from organization.uuid, falling back to ouId', () => {
    tm.saveTokens({ token: jwt({ organization: { uuid: 'org-uuid' }, ouId: 'ou-id' }), expiresIn: 3600, refreshToken: 'rt-1' });
    expect(tm.getOrgUuidFromToken()).toBe('org-uuid');
    tm.saveTokens({ token: jwt({ ouId: 'ou-id' }), expiresIn: 3600, refreshToken: 'rt-1' });
    expect(tm.getOrgUuidFromToken()).toBe('ou-id');
  });
});

describe('restoreSession (cloud)', () => {
  it('gets the in-memory token back after a reload', async () => {
    seedStoredSession();
    await tm.restoreSession();

    expect(calls.map((c) => c.url)).toEqual([IDP_TOKEN]);
    expect(tm.getAccessToken()).toBe('thunder-token');

    await tm.authenticatedFetch(API);
    expect(calls.map((c) => c.url)).toEqual([IDP_TOKEN, API]);
    expect(calls[1].auth).toBe('Bearer thunder-token');
  });

  it('clears the session when the refresh token is rejected, and keeps it on a transient error', async () => {
    seedStoredSession();
    routes[IDP_TOKEN] = () => new Response('', { status: 500 });
    await tm.restoreSession();
    expect(tm.hasStoredSession()).toBe(true);
    expect(tm.getAccessToken()).toBeNull();

    routes[IDP_TOKEN] = () => json({ error: 'invalid_grant' }, 400);
    await tm.restoreSession();
    expect(tm.hasStoredSession()).toBe(false);
  });

  it('stops waiting for an IdP that does not answer', async () => {
    seedStoredSession();
    routes[IDP_TOKEN] = () => new Promise<Response>(() => {});
    await tm.restoreSession(20);
    expect(tm.getAccessToken()).toBeNull();
    expect(tm.hasStoredSession()).toBe(true);
  });
});
