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
import {
  assertClientMatchesConsole,
  assertUsableLifetime,
  buildStorageState,
  decodeTokenClaims,
  isRetryableTokenFailure,
  MIN_TOKEN_LIFETIME_MS,
  parseTokenBody,
  SDK_SESSION_ACTIVE_KEY,
  SDK_STORAGE_VERSIONS,
  sdkSessionKey,
  tokenSubject,
  TOKEN_FETCH_ATTEMPTS,
  tokenRetryDelayMs,
  type TokenClaims,
} from './token';
import { PARKED_SESSION_KEY } from './session-storage';
import manifest from '../../../package.json';

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
  client_id: 'IPAAS_CONSOLE',
  iat: NOW / 1000,
  exp: NOW / 1000 + 3600,
};

const CLAIMS: TokenClaims = {
  sub: 'user-1',
  email: 'bot@example.com',
  name: 'Test Bot',
  ouHandle: 'e2e-org',
  ouId: 'org-uuid',
  clientId: 'IPAAS_CONSOLE',
  iat: NOW / 1000,
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

  it.each(['sub', 'ouHandle', 'ouId', 'client_id', 'iat', 'exp'])('rejects a token with no %s claim', (claim) => {
    const payload = { ...VALID_PAYLOAD, [claim]: undefined };
    expect(() => decodeTokenClaims(jwt(payload))).toThrow(new RegExp(`'${claim}' claim`));
  });

  // A non-numeric date would serialize as null in the SDK session and slip past the lifetime check.
  it.each([
    ['iat', 'invalid'],
    ['exp', 'invalid'],
    ['iat', '1800000000'],
    ['exp', { seconds: 1 }],
  ])('rejects a non-numeric %s claim (%j)', (claim, value) => {
    const payload = { ...VALID_PAYLOAD, [claim]: value };
    expect(() => decodeTokenClaims(jwt(payload))).toThrow(`Token has a non-numeric '${claim}' claim.`);
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

  // The record goes in sessionStorage, which storageState cannot carry, so it is parked.
  const parkedSession = (): Record<string, unknown> => {
    const parked = JSON.parse(entries()[PARKED_SESSION_KEY]) as Array<{ name: string; value: string }>;
    const record = parked.find((e) => e.name === sdkSessionKey('IPAAS_CONSOLE'));
    if (!record) throw new Error('no parked SDK session');
    return JSON.parse(record.value);
  };

  it('parks the token as the SDK session, keyed on the client', () => {
    expect(parkedSession().access_token).toBe('the-token');
    expect(parkedSession().token_type).toBe('Bearer');
  });

  it('dates the session from the token, in the units the SDK uses', () => {
    expect(parkedSession().created_at).toBe(NOW);
    expect(parkedSession().expires_in).toBe(3600);
  });

  it('parks nothing but the session record', () => {
    expect(JSON.parse(entries()[PARKED_SESSION_KEY]).map((e: { name: string }) => e.name)).toEqual(['session_data-instance_0-IPAAS_CONSOLE']);
  });

  it('leaves the session record out of localStorage, where the SDK no longer looks', () => {
    expect(entries()[sdkSessionKey('IPAAS_CONSOLE')]).toBeUndefined();
  });

  it('marks the SDK session active', () => {
    expect(entries()[SDK_SESSION_ACTIVE_KEY]).toBe('true');
  });

  it('hands over no refresh or ID token, since the provider never shares one', () => {
    expect(parkedSession().refresh_token).toBeUndefined();
    expect(parkedSession().id_token).toBeUndefined();
  });

  it('marks terms of use accepted for this user and org', () => {
    expect(entries()['tos_accepted:user-1:e2e-org']).toBe('true');
  });

  // The console reads the token only through the SDK now; these would be dead weight.
  it('writes none of the keys the pre-SDK console read', () => {
    for (const key of ['auth_token', 'token_expires_at', 'refresh_token', 'auth_mode', 'user']) {
      expect(entries()[key]).toBeUndefined();
    }
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

describe('SDK storage format', () => {
  // The seeded keys are the SDK's internal format, verified against one version. Bumping the
  // pin should stop here until someone signs in with the new version and re-checks them.
  it.each(['@thunderid/browser', '@thunderid/react'])('was verified against the %s version package.json pins', (pkg) => {
    expect((manifest.dependencies as Record<string, string>)[pkg]).toBe(SDK_STORAGE_VERSIONS[pkg]);
  });
});

describe('assertClientMatchesConsole', () => {
  it('accepts a token issued to the console client', () => {
    expect(() => assertClientMatchesConsole(CLAIMS, 'IPAAS_CONSOLE')).not.toThrow();
  });

  it('names both clients when they differ', () => {
    expect(() => assertClientMatchesConsole(CLAIMS, 'OTHER_CLIENT')).toThrow(/issued to client 'IPAAS_CONSOLE', but the console is configured for 'OTHER_CLIENT'/);
  });
});

describe('tokenSubject', () => {
  it('reads sub from a token that lacks the claims token mode requires', () => {
    expect(tokenSubject(jwt({ sub: 'user-1', aud: 'IPAAS_CONSOLE', exp: NOW / 1000 + 3600 }))).toBe('user-1');
  });

  it.each([
    ['an empty token', ''],
    ['a value that is not a JWT', 'not-a-jwt'],
    ['a payload that is not JSON', 'a.bm90LWpzb24.c'],
    ['a token without sub', jwt({ ouHandle: 'acme' })],
  ])('returns undefined for %s', (_label, token) => {
    expect(tokenSubject(token)).toBeUndefined();
  });
});
