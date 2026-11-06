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

import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { authenticatedFetch, connect, disconnect, getAccessToken, getOrgUuidFromToken, type CloudSession } from './session';

const NOW = 1_800_000_000_000;
const b64url = (value: unknown): string => btoa(JSON.stringify(value)).replace(/=+$/, '');
const jwt = (claims: Record<string, unknown>): string => `${b64url({ alg: 'none' })}.${b64url(claims)}.sig`;
const LIVE = jwt({ sub: 'u1', exp: NOW / 1000 + 3600 });
const EXPIRED = jwt({ sub: 'u1', exp: NOW / 1000 - 1 });

const SESSION: CloudSession = {
  user: { userId: 'u1', username: 'ada@example.com', displayName: 'Ada' },
  orgHandle: 'acme',
  orgUuid: 'org-uuid',
  scopes: [],
};

let fetchMock: ReturnType<typeof vi.fn>;
let onExpired: Mock<() => void>;

function connectWith(token: string): void {
  connect({ session: SESSION, getAccessToken: () => Promise.resolve(token), onExpired });
}

const sentAuth = (call = 0): string | null => new Headers((fetchMock.mock.calls[call][1] as RequestInit).headers).get('Authorization');

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
  fetchMock = vi.fn(async () => new Response('ok'));
  vi.stubGlobal('fetch', fetchMock);
  onExpired = vi.fn<() => void>();
});

afterEach(() => {
  disconnect();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('authenticatedFetch', () => {
  it('sends the SDK token as a Bearer token, keeping the caller’s headers', async () => {
    connectWith(LIVE);
    await authenticatedFetch('https://api.example/x', { method: 'POST', headers: { 'Content-Type': 'application/json' } });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(sentAuth()).toBe(`Bearer ${LIVE}`);
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json');
  });

  it('asks the SDK for the token on every request, so a refreshed one is used', async () => {
    let token = LIVE;
    connect({ session: SESSION, getAccessToken: () => Promise.resolve(token), onExpired });
    await authenticatedFetch('https://api.example/x');
    token = jwt({ sub: 'u1', exp: NOW / 1000 + 7200 });
    await authenticatedFetch('https://api.example/x');
    expect(sentAuth(1)).toBe(`Bearer ${token}`);
  });

  it('sends no Authorization header before a session is connected', async () => {
    await authenticatedFetch('https://api.example/x');
    expect(sentAuth()).toBeNull();
  });

  // Auto-refresh is the only refresh: there is no refresh-and-retry on a 401.
  it('does not retry a 401', async () => {
    connectWith(LIVE);
    fetchMock.mockResolvedValue(new Response('', { status: 401 }));
    const res = await authenticatedFetch('https://api.example/x');
    expect(res.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('ends the session on a 401 for an expired token', async () => {
    connectWith(EXPIRED);
    fetchMock.mockResolvedValue(new Response('', { status: 401 }));
    await authenticatedFetch('https://api.example/x');
    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  it('ends the session on a 401 when the SDK has no token left', async () => {
    connectWith('');
    fetchMock.mockResolvedValue(new Response('', { status: 401 }));
    await authenticatedFetch('https://api.example/x');
    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  it('leaves the session alone on a 401 for a live token — that is the API’s answer', async () => {
    connectWith(LIVE);
    fetchMock.mockResolvedValue(new Response('', { status: 401 }));
    await authenticatedFetch('https://api.example/x');
    expect(onExpired).not.toHaveBeenCalled();
  });

  it('leaves the session alone on other errors, even with an expired token', async () => {
    connectWith(EXPIRED);
    fetchMock.mockResolvedValue(new Response('', { status: 403 }));
    await authenticatedFetch('https://api.example/x');
    expect(onExpired).not.toHaveBeenCalled();
  });
});

describe('authenticatedFetch without a cookie session', () => {
  it('ends the session on a 401 for an expired token from any host, and adds no X-Requested-With', async () => {
    connectWith(EXPIRED);
    fetchMock.mockResolvedValue(new Response('', { status: 401 }));
    await authenticatedFetch('https://obs.example/logs');
    await authenticatedFetch('/api/x');
    expect(onExpired).toHaveBeenCalledTimes(2);
    expect(new Headers((fetchMock.mock.calls[1][1] as RequestInit).headers).has('X-Requested-With')).toBe(false);
  });
});

describe('authenticatedFetch with a cookie session (BFF)', () => {
  let checkSession: Mock<() => Promise<boolean>>;
  const sentHeader = (call: number): string | null => new Headers((fetchMock.mock.calls[call][1] as RequestInit).headers).get('X-Requested-With');

  beforeEach(() => {
    checkSession = vi.fn(async () => false);
    connect({ session: SESSION, getAccessToken: () => Promise.resolve(''), onExpired, checkSession });
    fetchMock.mockResolvedValue(new Response('', { status: 401 }));
  });

  it('marks same-origin requests with X-Requested-With and leaves cross-origin ones alone', async () => {
    fetchMock.mockResolvedValue(new Response('ok'));
    await authenticatedFetch('/_api/integration/projects', { headers: { Accept: 'application/json' } });
    await authenticatedFetch(`${window.location.origin}/_api/billing/api/v1/x`);
    await authenticatedFetch('https://cloud-obs-proxy.obs.dp.example/logs');
    expect(sentHeader(0)).toBe('XMLHttpRequest');
    expect(new Headers((fetchMock.mock.calls[0][1] as RequestInit).headers).get('Accept')).toBe('application/json');
    expect(sentHeader(1)).toBe('XMLHttpRequest');
    expect(sentHeader(2)).toBeNull();
    expect(sentAuth(0)).toBeNull();
  });

  it('sends the gateway token as a Bearer token to the observability host only', async () => {
    const saved = window.API_CONFIG;
    window.API_CONFIG = { ...saved, observabilityUrl: 'https://cloud-obs-proxy.obs.dp.example/' };
    const observabilityToken = vi.fn(async () => 'obs-token');
    connect({ session: SESSION, getAccessToken: () => Promise.resolve(''), onExpired, checkSession, observabilityToken });
    fetchMock.mockResolvedValue(new Response('ok'));
    await authenticatedFetch('https://cloud-obs-proxy.obs.dp.example/wso2cloud-obs/api/v1/logs/query', { method: 'POST' });
    await authenticatedFetch('https://cloud-obs-proxy.obs.dp.example.other/x');
    await authenticatedFetch('https://other.example/x');
    await authenticatedFetch('/_api/integration/projects');
    window.API_CONFIG = saved;
    expect(sentAuth(0)).toBe('Bearer obs-token');
    expect(sentAuth(1)).toBeNull();
    expect(sentAuth(2)).toBeNull();
    expect(sentAuth(3)).toBeNull();
    expect(observabilityToken).toHaveBeenCalledTimes(1);
  });

  it('keeps the session on a 401 from another host, without asking the gateway', async () => {
    const res = await authenticatedFetch('https://cloud-obs-proxy.obs.dp.example/logs');
    expect(res.status).toBe(401);
    expect(checkSession).not.toHaveBeenCalled();
    expect(onExpired).not.toHaveBeenCalled();
  });

  it('counts a protocol-relative URL and another port as other hosts', async () => {
    const { protocol, hostname } = window.location;
    await authenticatedFetch(`//cloud-obs-proxy.obs.dp.example/logs`);
    await authenticatedFetch(`${protocol}//${hostname}:1/_api/x`);
    expect(sentHeader(0)).toBeNull();
    expect(sentHeader(1)).toBeNull();
    expect(checkSession).not.toHaveBeenCalled();
    expect(onExpired).not.toHaveBeenCalled();
  });

  it('ends the session on a same-origin 401 once the gateway says it is signed out', async () => {
    const res = await authenticatedFetch('/_api/integration/projects');
    expect(res.status).toBe(401);
    expect(checkSession).toHaveBeenCalledTimes(1);
    expect(onExpired).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps a live session on a same-origin 401 and retries the request once', async () => {
    checkSession.mockResolvedValue(true);
    fetchMock.mockResolvedValueOnce(new Response('', { status: 401 })).mockResolvedValueOnce(new Response('ok'));
    const res = await authenticatedFetch('/_api/integration/projects', { method: 'POST', body: '{}' });
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock.calls[1][1] as RequestInit).method).toBe('POST');
    expect(onExpired).not.toHaveBeenCalled();
  });

  it('returns a second same-origin 401 from a live session to the caller', async () => {
    checkSession.mockResolvedValue(true);
    const res = await authenticatedFetch('/_api/integration/projects');
    expect(res.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(onExpired).not.toHaveBeenCalled();
  });
});

describe('getAccessToken', () => {
  it('returns the SDK token, or null when there is none', async () => {
    expect(await getAccessToken()).toBeNull();
    connectWith(LIVE);
    expect(await getAccessToken()).toBe(LIVE);
    connectWith('');
    expect(await getAccessToken()).toBeNull();
  });
});

describe('getOrgUuidFromToken', () => {
  it('returns the session org UUID, and null once disconnected', () => {
    connectWith(LIVE);
    expect(getOrgUuidFromToken()).toBe('org-uuid');
    disconnect();
    expect(getOrgUuidFromToken()).toBeNull();
  });
});
