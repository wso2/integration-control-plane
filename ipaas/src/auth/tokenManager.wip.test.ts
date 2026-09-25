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

vi.mock('../features', () => ({ IS_CLOUD: false, IS_WIP: true, IS_ICP: false }));

type TokenManager = typeof import('./tokenManager');
type Handler = (body: URLSearchParams | Record<string, unknown> | null, init: RequestInit) => Response | Promise<Response>;

const IDP_TOKEN = 'https://idp.example/oauth2/token';
const STS_TOKEN = 'https://sts.example/oauth2/token';
const ORGS_API = 'https://orgs.example/orgs/1.0.0';
const AUTH_BASE = 'https://auth.example';
const API = 'https://api.example/resource';

const jwt = (claims: Record<string, unknown>): string => `h.${btoa(JSON.stringify(claims)).replace(/=+$/, '')}.s`;
const json = (data: unknown, status = 200): Response => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

let tm: TokenManager;
let calls: Array<{ url: string; body: URLSearchParams | Record<string, unknown> | null; auth: string | null }>;
let routes: Record<string, Handler>;

function parseBody(init: RequestInit): URLSearchParams | Record<string, unknown> | null {
  if (typeof init.body !== 'string') return null;
  const type = new Headers(init.headers).get('Content-Type') ?? '';
  return type.includes('json') ? JSON.parse(init.body) : new URLSearchParams(init.body);
}

function callsTo(url: string) {
  return calls.filter((c) => c.url === url);
}

// What a reloaded page starts with: only the refresh token and metadata survive in storage.
function seedStoredSession({ oidc = true, orgHandle = 'acme' }: { oidc?: boolean; orgHandle?: string | null } = {}): void {
  localStorage.setItem('refresh_token', 'rt-1');
  if (orgHandle) localStorage.setItem('org_handle', orgHandle);
  localStorage.setItem('user', JSON.stringify({ userId: 'u1', username: 'user', displayName: 'User', isOidcUser: oidc, requirePasswordChange: false }));
}

// A live session: the stored session plus an in-memory access token.
function seedSession({ expired, oidc = true, orgHandle = 'acme' }: { expired: boolean; oidc?: boolean; orgHandle?: string | null }): void {
  seedStoredSession({ oidc, orgHandle });
  tm.saveTokens({ token: 'stored-token', expiresIn: expired ? -1 : 3600, refreshToken: 'rt-1' });
}

beforeEach(async () => {
  localStorage.clear();
  calls = [];
  routes = {
    [API]: () => new Response('ok'),
    [IDP_TOKEN]: () => json({ access_token: 'idp-token', refresh_token: 'rt-2', expires_in: 1800 }),
    [STS_TOKEN]: () => json({ access_token: 'sts-token', expires_in: 900 }),
  };
  window.API_CONFIG = {
    asgardeoClientId: 'idp-client',
    asgardeoTokenEndpoint: IDP_TOKEN,
    stsTokenEndpoint: STS_TOKEN,
    stsClientId: 'sts-client',
    stsScope: 'sts-scope',
    choreoOrgApiUrl: ORGS_API,
    authBaseUrl: AUTH_BASE,
  } as unknown as typeof window.API_CONFIG;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init: RequestInit = {}) => {
      const body = parseBody(init);
      calls.push({ url: input, body, auth: new Headers(init.headers).get('Authorization') });
      const handler = routes[input];
      if (!handler) throw new Error(`Unexpected fetch: ${input}`);
      return handler(body, init);
    }),
  );
  vi.resetModules();
  tm = await import('./tokenManager');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('tokenManager (WIP)', () => {
  it('sends the stored token without refreshing while it is still valid', async () => {
    seedSession({ expired: false });
    await tm.authenticatedFetch(API);
    expect(calls.map((c) => c.url)).toEqual([API]);
    expect(calls[0].auth).toBe('Bearer stored-token');
  });

  it('refreshes an expired token through the IdP and an org-scoped STS exchange', async () => {
    seedSession({ expired: true });
    await tm.authenticatedFetch(API);

    expect(calls.map((c) => c.url)).toEqual([IDP_TOKEN, STS_TOKEN, API]);
    const idp = calls[0].body as URLSearchParams;
    expect(Object.fromEntries(idp)).toEqual({ grant_type: 'refresh_token', refresh_token: 'rt-1', client_id: 'idp-client' });
    const sts = calls[1].body as URLSearchParams;
    expect(sts.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:token-exchange');
    expect(sts.get('subject_token')).toBe('idp-token');
    expect(sts.get('client_id')).toBe('sts-client');
    expect(sts.get('scope')).toBe('sts-scope');
    expect(sts.get('orgHandle')).toBe('acme');
    expect(calls[2].auth).toBe('Bearer sts-token');

    expect(tm.getAccessToken()).toBe('sts-token');
    expect(tm.getRefreshToken()).toBe('rt-2');
    expect(tm.getAsgardeoToken()).toBe('idp-token');
  });

  it('reuses a cached IdP token and only repeats the STS exchange', async () => {
    seedSession({ expired: true });
    tm.saveAsgardeoToken('cached-idp', 3600);
    await tm.authenticatedFetch(API);
    expect(calls.map((c) => c.url)).toEqual([STS_TOKEN, API]);
    expect((calls[0].body as URLSearchParams).get('subject_token')).toBe('cached-idp');
    expect(tm.getRefreshToken()).toBe('rt-1');
  });

  it('shares one refresh between concurrent requests', async () => {
    seedSession({ expired: true });
    await Promise.all([tm.authenticatedFetch(API), tm.authenticatedFetch(API), tm.refreshAccessToken()]);
    expect(callsTo(IDP_TOKEN)).toHaveLength(1);
    expect(callsTo(STS_TOKEN)).toHaveLength(1);
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
    expect(callsTo(API).map((c) => c.auth)).toEqual(['Bearer stored-token', 'Bearer sts-token']);
  });

  it('looks the org handle up through a base STS token when none is stored', async () => {
    seedSession({ expired: true, orgHandle: null });
    let stsCall = 0;
    routes[STS_TOKEN] = () => json({ access_token: stsCall++ === 0 ? 'base-sts' : 'org-sts', expires_in: 900 });
    routes[`${ORGS_API}/orgs`] = () => json({ list: [{ handle: 'found-org' }] });
    await tm.refreshAccessToken();

    expect(calls.map((c) => c.url)).toEqual([IDP_TOKEN, STS_TOKEN, `${ORGS_API}/orgs`, STS_TOKEN]);
    expect((calls[1].body as URLSearchParams).has('orgHandle')).toBe(false);
    expect(calls[2].auth).toBe('Bearer base-sts');
    expect((calls[3].body as URLSearchParams).get('orgHandle')).toBe('found-org');
    expect(localStorage.getItem('org_handle')).toBe('found-org');
    expect(tm.getAccessToken()).toBe('org-sts');
  });

  it('stores the IdP token directly when STS is not configured', async () => {
    seedSession({ expired: true });
    window.API_CONFIG.stsTokenEndpoint = '';
    await tm.refreshAccessToken();
    expect(calls.map((c) => c.url)).toEqual([IDP_TOKEN]);
    expect(tm.getAccessToken()).toBe('idp-token');
    expect(tm.getRefreshToken()).toBe('rt-2');
  });

  it.each([
    ['401', () => new Response('', { status: 401 })],
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
    expect(callsTo(STS_TOKEN)).toHaveLength(0);
  });

  it.each([
    ['500', () => new Response('', { status: 500 })],
    ['400 without invalid_grant', () => json({ error: 'invalid_request' }, 400)],
  ])('keeps the session on a transient IdP error (%s)', async (_label, handler) => {
    seedSession({ expired: true });
    const onFailure = vi.fn();
    tm.setOnAuthFailure(onFailure);
    routes[IDP_TOKEN] = handler;
    await tm.refreshAccessToken();
    expect(onFailure).not.toHaveBeenCalled();
    expect(tm.getAccessToken()).toBe('stored-token');
    expect(tm.getRefreshToken()).toBe('rt-1');
  });

  it('ends the session when STS rejects the exchange, and keeps it on an STS 5xx', async () => {
    seedSession({ expired: true });
    const onFailure = vi.fn();
    tm.setOnAuthFailure(onFailure);
    routes[STS_TOKEN] = () => new Response('', { status: 503 });
    await tm.refreshAccessToken();
    expect(onFailure).not.toHaveBeenCalled();
    expect(tm.getAccessToken()).toBe('stored-token');

    routes[STS_TOKEN] = () => new Response('', { status: 403 });
    await tm.refreshAccessToken();
    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(tm.getAccessToken()).toBeNull();
  });

  it('refreshes a local user through the backend and updates the stored user', async () => {
    seedSession({ expired: true, oidc: false });
    routes[`${AUTH_BASE}/refresh-token`] = () => json({ token: 'local-token', expiresIn: 600, refreshToken: 'local-rt', username: 'new-name', displayName: 'New Name', permissions: ['p1'] });
    await tm.authenticatedFetch(API);
    expect(calls.map((c) => c.url)).toEqual([`${AUTH_BASE}/refresh-token`, API]);
    expect(calls[0].body).toEqual({ refreshToken: 'rt-1' });
    expect(tm.getAccessToken()).toBe('local-token');
    expect(tm.getRefreshToken()).toBe('local-rt');
    expect(JSON.parse(localStorage.getItem('user') ?? '{}')).toMatchObject({ userId: 'u1', username: 'new-name', displayName: 'New Name', permissions: ['p1'] });
  });

  it('ends a local session on a backend 401 and falls through to the IdP on a 5xx', async () => {
    seedSession({ expired: true, oidc: false });
    const onFailure = vi.fn();
    tm.setOnAuthFailure(onFailure);
    routes[`${AUTH_BASE}/refresh-token`] = () => new Response('', { status: 500 });
    await tm.refreshAccessToken();
    expect(callsTo(IDP_TOKEN)).toHaveLength(1);
    expect(tm.getAccessToken()).toBe('sts-token');

    routes[`${AUTH_BASE}/refresh-token`] = () => new Response('', { status: 401 });
    await tm.refreshAccessToken();
    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(tm.getRefreshToken()).toBeNull();
  });

  it('ends the session when there is no refresh token', async () => {
    seedSession({ expired: true });
    localStorage.removeItem('refresh_token');
    const onFailure = vi.fn();
    tm.setOnAuthFailure(onFailure);
    await tm.refreshAccessToken();
    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(0);
  });

  it('switches org with an STS exchange of the current token', async () => {
    seedSession({ expired: false });
    await tm.switchOrgToken('other-org');
    const sts = calls[0].body as URLSearchParams;
    expect(calls[0].url).toBe(STS_TOKEN);
    expect(sts.get('subject_token')).toBe('stored-token');
    expect(sts.get('orgHandle')).toBe('other-org');
    expect(localStorage.getItem('org_handle')).toBe('other-org');
    expect(tm.getAccessToken()).toBe('sts-token');
    expect(tm.getRefreshToken()).toBe('rt-1');
  });

  it('rejects an org switch when STS fails or is not configured', async () => {
    seedSession({ expired: false });
    routes[STS_TOKEN] = () => new Response('', { status: 400 });
    await expect(tm.switchOrgToken('other-org')).rejects.toThrow('Org token exchange failed (400)');
    expect(localStorage.getItem('org_handle')).toBe('acme');

    window.API_CONFIG.stsClientId = '';
    await expect(tm.switchOrgToken('other-org')).rejects.toThrow('Org token exchange unavailable');
  });

  it('drops the cached IdP token when it nears expiry and on clearTokens', () => {
    tm.saveAsgardeoToken('short', 30);
    expect(tm.getAsgardeoToken()).toBeNull();
    tm.saveAsgardeoToken('long', 3600);
    expect(tm.getAsgardeoToken()).toBe('long');
    tm.clearTokens();
    expect(tm.getAsgardeoToken()).toBeNull();
  });

  it('revokes local sessions through the backend and skips OIDC sessions', async () => {
    routes[`${AUTH_BASE}/revoke-token`] = () => new Response('');
    seedSession({ expired: false, oidc: false });
    await tm.revokeToken();
    expect(calls[0]).toMatchObject({ url: `${AUTH_BASE}/revoke-token`, auth: 'Bearer stored-token', body: { refreshToken: 'rt-1' } });

    calls = [];
    seedSession({ expired: false, oidc: true });
    await tm.revokeToken();
    expect(calls).toHaveLength(0);
  });

  it('reads the org UUID only from organization.uuid', () => {
    tm.saveTokens({ token: jwt({ organization: { uuid: 'org-uuid' }, ouId: 'ou-id' }), expiresIn: 3600, refreshToken: 'rt-1' });
    expect(tm.getOrgUuidFromToken()).toBe('org-uuid');
    tm.saveTokens({ token: jwt({ ouId: 'ou-id' }), expiresIn: 3600, refreshToken: 'rt-1' });
    expect(tm.getOrgUuidFromToken()).toBeNull();
  });

  it('keeps the access token in memory and only the refresh token in storage', async () => {
    seedSession({ expired: true });
    await tm.authenticatedFetch(API);
    expect(tm.getAccessToken()).toBe('sts-token');
    expect(localStorage.getItem('auth_token')).toBeNull();
    expect(localStorage.getItem('token_expires_at')).toBeNull();
    expect(Object.values({ ...localStorage })).not.toContain('sts-token');
    expect(Object.values({ ...localStorage })).not.toContain('idp-token');
    expect(localStorage.getItem('refresh_token')).toBe('rt-2');
  });

  it('retries once with the refresh token another tab rotated in the meantime', async () => {
    seedSession({ expired: true });
    const onFailure = vi.fn();
    tm.setOnAuthFailure(onFailure);
    routes[IDP_TOKEN] = (body) => {
      if ((body as URLSearchParams).get('refresh_token') === 'rt-1') {
        localStorage.setItem('refresh_token', 'rt-other-tab');
        return json({ error: 'invalid_grant' }, 400);
      }
      return json({ access_token: 'idp-token', refresh_token: 'rt-3', expires_in: 1800 });
    };
    await tm.authenticatedFetch(API);
    expect(callsTo(IDP_TOKEN).map((c) => (c.body as URLSearchParams).get('refresh_token'))).toEqual(['rt-1', 'rt-other-tab']);
    expect(onFailure).not.toHaveBeenCalled();
    expect(tm.getAccessToken()).toBe('sts-token');
    expect(tm.getRefreshToken()).toBe('rt-3');
  });

  it('keeps a refresh token another tab stored while this refresh was running', async () => {
    seedSession({ expired: true });
    tm.saveAsgardeoToken('cached-idp', 3600);
    routes[STS_TOKEN] = () => {
      localStorage.setItem('refresh_token', 'rt-other-tab');
      return json({ access_token: 'sts-token', expires_in: 900 });
    };
    await tm.refreshAccessToken();
    expect(tm.getAccessToken()).toBe('sts-token');
    expect(tm.getRefreshToken()).toBe('rt-other-tab');
  });

  it('does not retry an invalid_grant when no other tab changed the refresh token', async () => {
    seedSession({ expired: true });
    routes[IDP_TOKEN] = () => json({ error: 'invalid_grant' }, 400);
    await tm.refreshAccessToken();
    expect(callsTo(IDP_TOKEN)).toHaveLength(1);
    expect(tm.hasStoredSession()).toBe(false);
  });
});

describe('restoreSession (WIP)', () => {
  it('gets both in-memory tokens back after a reload', async () => {
    seedStoredSession();
    expect(tm.hasStoredSession()).toBe(true);
    expect(tm.getAccessToken()).toBeNull();

    await tm.restoreSession();

    expect(calls.map((c) => c.url)).toEqual([IDP_TOKEN, STS_TOKEN]);
    expect((calls[1].body as URLSearchParams).get('orgHandle')).toBe('acme');
    expect(tm.getAccessToken()).toBe('sts-token');
    expect(tm.getAsgardeoToken()).toBe('idp-token');

    await tm.authenticatedFetch(API);
    expect(calls.map((c) => c.url)).toEqual([IDP_TOKEN, STS_TOKEN, API]);
    expect(calls[2].auth).toBe('Bearer sts-token');
  });

  it('restores a local user through the backend', async () => {
    seedStoredSession({ oidc: false });
    routes[`${AUTH_BASE}/refresh-token`] = () => json({ token: 'local-token', expiresIn: 600, refreshToken: 'local-rt', username: 'user', displayName: 'User', permissions: [] });
    await tm.restoreSession();
    expect(calls.map((c) => c.url)).toEqual([`${AUTH_BASE}/refresh-token`]);
    expect(tm.getAccessToken()).toBe('local-token');
  });

  it('does nothing without a stored session, or when a token is already in memory', async () => {
    await tm.restoreSession();
    expect(calls).toHaveLength(0);
    expect(tm.hasStoredSession()).toBe(false);

    seedSession({ expired: false });
    await tm.restoreSession();
    expect(calls).toHaveLength(0);
  });

  it('clears the session when the refresh token is rejected', async () => {
    seedStoredSession();
    routes[IDP_TOKEN] = () => json({ error: 'invalid_grant' }, 400);
    await tm.restoreSession();
    expect(tm.hasStoredSession()).toBe(false);
    expect(tm.getAccessToken()).toBeNull();
  });

  it('keeps the session on a transient failure and refreshes on the first request', async () => {
    seedStoredSession();
    routes[IDP_TOKEN] = () => new Response('', { status: 503 });
    await tm.restoreSession();
    expect(tm.hasStoredSession()).toBe(true);
    expect(tm.getAccessToken()).toBeNull();

    routes[IDP_TOKEN] = () => json({ access_token: 'idp-token', refresh_token: 'rt-2', expires_in: 1800 });
    await tm.authenticatedFetch(API);
    expect(callsTo(API)[0].auth).toBe('Bearer sts-token');
  });

  it('stops waiting for an IdP that does not answer', async () => {
    seedStoredSession();
    routes[IDP_TOKEN] = () => new Promise<Response>(() => {});
    await tm.restoreSession(20);
    expect(tm.getAccessToken()).toBeNull();
    expect(tm.hasStoredSession()).toBe(true);
  });
});
