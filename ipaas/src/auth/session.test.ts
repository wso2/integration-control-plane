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
