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

import { describe, expect, it } from 'vitest';
import { assertUsableLifetime, buildStorageState, decodeTokenClaims, isRetryableTokenFailure, MIN_TOKEN_LIFETIME_MS, parseTokenBody, TOKEN_FETCH_ATTEMPTS, tokenRetryDelayMs, type TokenClaims } from './token';

const NOW = 1_800_000_000_000;

function jwt(payload: Record<string, unknown>): string {
  const encode = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'RS256' })}.${encode(payload)}.signature`;
}

const VALID_PAYLOAD = {
  sub: 'user-1',
  email: 'bot@example.com',
  name: 'Test Bot',
  ouHandle: 'e2e-org',
  ouId: 'org-uuid',
  exp: NOW / 1000 + 3600,
};

const CLAIMS: TokenClaims = {
  sub: 'user-1',
  email: 'bot@example.com',
  name: 'Test Bot',
  ouHandle: 'e2e-org',
  ouId: 'org-uuid',
  exp: NOW / 1000 + 3600,
};

describe('parseTokenBody', () => {
  it('returns the token, trimmed of the response\u2019s whitespace', () => {
    expect(parseTokenBody('  abc.def.ghi\n', 'src')).toBe('abc.def.ghi');
  });

  it('rejects an empty body', () => {
    expect(() => parseTokenBody('   ', 'src')).toThrow(/empty body/);
  });
});

describe('decodeTokenClaims', () => {
  it('reads the claims the console needs', () => {
    expect(decodeTokenClaims(jwt(VALID_PAYLOAD))).toEqual(CLAIMS);
  });

  it('leaves name undefined when the token has none', () => {
    const { name, ...withoutName } = VALID_PAYLOAD;
    expect(decodeTokenClaims(jwt(withoutName)).name).toBeUndefined();
  });

  it('rejects a value that is not a JWT', () => {
    expect(() => decodeTokenClaims('not-a-jwt')).toThrow(/three dot-separated segments/);
  });

  it('rejects a payload that is not JSON', () => {
    expect(() => decodeTokenClaims('a.bm90LWpzb24.c')).toThrow(/not valid JSON/);
  });

  it.each(['sub', 'ouHandle', 'ouId', 'exp'])('rejects a token with no %s claim', (claim) => {
    const payload = { ...VALID_PAYLOAD, [claim]: undefined };
    expect(() => decodeTokenClaims(jwt(payload))).toThrow(new RegExp(`'${claim}' claim`));
  });
});

describe('assertUsableLifetime', () => {
  it('accepts a token that outlives a run', () => {
    expect(() => assertUsableLifetime(CLAIMS, NOW)).not.toThrow();
  });

  it('rejects a token with too little life left', () => {
    const expiring = { ...CLAIMS, exp: (NOW + MIN_TOKEN_LIFETIME_MS - 1000) / 1000 };
    expect(() => assertUsableLifetime(expiring, NOW)).toThrow(/of life left/);
  });

  it('rejects an already expired token', () => {
    expect(() => assertUsableLifetime({ ...CLAIMS, exp: NOW / 1000 - 60 }, NOW)).toThrow(/-60s of life left/);
  });
});

describe('buildStorageState', () => {
  const entries = (): Record<string, string> => Object.fromEntries(buildStorageState('the-token', CLAIMS, 'https://console.example.com').origins[0].localStorage.map((e) => [e.name, e.value]));

  it('stores the token and its expiry in milliseconds', () => {
    expect(entries().auth_token).toBe('the-token');
    expect(entries().token_expires_at).toBe(String(CLAIMS.exp * 1000));
  });

  it('marks terms of use accepted for this user and org', () => {
    expect(entries()['tos_accepted:user-1:e2e-org']).toBe('true');
  });

  it('leaves the refresh token empty, since the provider never shares one', () => {
    expect(entries().refresh_token).toBe('');
  });

  it('records the org handle the console routes on', () => {
    expect(entries().org_handle).toBe('e2e-org');
    expect(JSON.parse(entries().user).userId).toBe('user-1');
  });

  it('scopes the storage to the console origin', () => {
    expect(buildStorageState('t', CLAIMS, 'https://console.example.com').origins[0].origin).toBe('https://console.example.com');
  });
});

describe('isRetryableTokenFailure', () => {
  it.each([0, 502, 503, 504])('retries %i — the provider recovers from these on its own', (status) => {
    expect(isRetryableTokenFailure(status)).toBe(true);
  });

  it('does not retry 401 — a wrong shared secret never comes good', () => {
    expect(isRetryableTokenFailure(401)).toBe(false);
  });

  it.each([400, 403, 404, 500])('does not retry %i', (status) => {
    expect(isRetryableTokenFailure(status)).toBe(false);
  });
});

describe('tokenRetryDelayMs', () => {
  it('doubles each attempt', () => {
    expect([1, 2, 3, 4].map(tokenRetryDelayMs)).toEqual([2_000, 4_000, 8_000, 16_000]);
  });

  it('spans under a minute across the full run of attempts', () => {
    const total = Array.from({ length: TOKEN_FETCH_ATTEMPTS - 1 }, (_, i) => tokenRetryDelayMs(i + 1)).reduce((a, b) => a + b, 0);
    expect(total).toBeLessThan(60_000);
  });
});
