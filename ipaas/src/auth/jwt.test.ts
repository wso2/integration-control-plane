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

import { afterEach, describe, expect, it, vi } from 'vitest';
import { decodeJwtPayload, isExpired, stringClaim } from './jwt';

const b64url = (value: unknown): string => btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const jwt = (claims: Record<string, unknown>): string => `${b64url({ alg: 'none' })}.${b64url(claims)}.sig`;

afterEach(() => {
  vi.useRealTimers();
});

describe('decodeJwtPayload', () => {
  it('reads the claims', () => {
    expect(decodeJwtPayload(jwt({ sub: 'u1', ouHandle: 'acme' }))).toEqual({ sub: 'u1', ouHandle: 'acme' });
  });

  // '?' and '>' encode to '/' and '+' in base64, which base64url writes as '_' and '-'.
  it('reads base64url segments with no padding', () => {
    const claims = { name: 'a?b>c', n: 1 };
    expect(decodeJwtPayload(jwt(claims))).toEqual(claims);
  });

  // Encoded the way a server encodes claims: UTF-8 bytes, then base64url.
  it('reads non-ASCII claims as UTF-8', () => {
    const claims = { name: 'José Müller', given_name: '李' };
    const utf8 = String.fromCharCode(...new TextEncoder().encode(JSON.stringify(claims)));
    const payload = btoa(utf8).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(decodeJwtPayload(`${b64url({ alg: 'none' })}.${payload}.sig`)).toEqual(claims);
  });

  it('throws on a value that is not a JWT', () => {
    expect(() => decodeJwtPayload('not-a-jwt')).toThrow();
  });
});

describe('stringClaim', () => {
  it('returns a non-empty string claim', () => {
    expect(stringClaim({ ouHandle: 'acme' }, 'ouHandle')).toBe('acme');
  });

  it.each([
    ['missing', {}],
    ['empty', { ouHandle: '' }],
    ['not a string', { ouHandle: 42 }],
  ])('returns undefined when the claim is %s', (_label, claims) => {
    expect(stringClaim(claims, 'ouHandle')).toBeUndefined();
  });
});

describe('isExpired', () => {
  const NOW = 1_800_000_000_000;

  it('is false before exp and true from exp on', () => {
    vi.useFakeTimers({ now: NOW });
    expect(isExpired(jwt({ exp: NOW / 1000 + 1 }))).toBe(false);
    expect(isExpired(jwt({ exp: NOW / 1000 }))).toBe(true);
  });

  it('treats a token without exp, or an unreadable one, as expired', () => {
    expect(isExpired(jwt({ sub: 'u1' }))).toBe(true);
    expect(isExpired('garbage')).toBe(true);
  });
});
