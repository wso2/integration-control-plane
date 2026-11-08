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
import { forwardedTokenExample, jwtFormErrors, jwtFormOf, scopeRequirementText, splitScopes, toJwtSecurity, tokenHeaderExample } from './jwtSecurity';

describe('jwtFormOf', () => {
  it('fills the gateway defaults for an API not on jwt yet', () => {
    expect(jwtFormOf(undefined)).toEqual({
      headerName: 'Authorization',
      authHeaderPrefix: 'Bearer',
      audiences: [],
      forwardToken: true,
      forwardedTokenHeader: 'X-Forwarded-Authorization',
      forwardTokenStripScheme: false,
      scopes: {},
    });
  });

  it('keeps saved options and gives every operation both lists', () => {
    const form = jwtFormOf({ headerName: 'X-JWT', forwardToken: false, operations: { 'GET /orders': { allOf: ['orders:read'] } } });
    expect(form.headerName).toBe('X-JWT');
    expect(form.forwardToken).toBe(false);
    expect(form.scopes).toEqual({ 'GET /orders': { allOf: ['orders:read'], anyOf: [] } });
  });
});

describe('toJwtSecurity', () => {
  it('sends every option, since a PUT resets what it leaves out', () => {
    const jwt = toJwtSecurity(jwtFormOf(undefined), undefined);
    expect(jwt).toEqual({
      audiences: [],
      operations: {},
      headerName: 'Authorization',
      authHeaderPrefix: 'Bearer',
      forwardToken: true,
      forwardedTokenHeader: 'X-Forwarded-Authorization',
      forwardTokenStripScheme: false,
    });
  });

  it('carries the saved key manager back unchanged', () => {
    expect(toJwtSecurity(jwtFormOf(undefined), ['ThunderKeyManager']).issuers).toEqual(['ThunderKeyManager']);
  });

  it('drops operations without scopes and cleans the lists', () => {
    const form = jwtFormOf(undefined);
    form.scopes = {
      'GET /orders': { allOf: [' orders:read ', 'orders:read'], anyOf: [] },
      'POST /orders': { allOf: [], anyOf: [] },
      'DELETE /orders': { allOf: [], anyOf: ['orders:write orders:admin'] },
    };
    expect(toJwtSecurity(form, undefined).operations).toEqual({
      'GET /orders': { allOf: ['orders:read'] },
      'DELETE /orders': { anyOf: ['orders:write', 'orders:admin'] },
    });
  });

  it('falls back to the defaults for blank fields', () => {
    const form = { ...jwtFormOf(undefined), headerName: '  ', authHeaderPrefix: '', forwardedTokenHeader: ' ' };
    const jwt = toJwtSecurity(form, undefined);
    expect([jwt.headerName, jwt.authHeaderPrefix, jwt.forwardedTokenHeader]).toEqual(['Authorization', 'Bearer', 'X-Forwarded-Authorization']);
  });
});

describe('splitScopes', () => {
  it('splits on whitespace and de-duplicates', () => {
    expect(splitScopes(['a b', 'b', ' c '])).toEqual(['a', 'b', 'c']);
  });
});

describe('jwtFormErrors', () => {
  const valid = jwtFormOf(undefined);

  it('accepts the defaults', () => {
    expect(jwtFormErrors(valid)).toEqual({});
  });

  it.each([
    ['a header with a space', 'X JWT', 'no spaces'],
    ['a reserved header', 'cookie', 'can’t carry the token'],
    ['a reserved header family', 'Access-Control-Token', 'can’t carry the token'],
  ])('refuses %s as the token header', (_, headerName, want) => {
    expect(jwtFormErrors({ ...valid, headerName }).headerName).toContain(want);
  });

  it('refuses a prefix of more than one word', () => {
    expect(jwtFormErrors({ ...valid, authHeaderPrefix: 'Bearer token' }).authHeaderPrefix).toBeDefined();
  });

  it('checks the forwarded header only while the token is forwarded', () => {
    expect(jwtFormErrors({ ...valid, forwardedTokenHeader: 'Host' }).forwardedTokenHeader).toBeDefined();
    expect(jwtFormErrors({ ...valid, forwardToken: false, forwardedTokenHeader: 'Host' }).forwardedTokenHeader).toBeUndefined();
  });

  it('caps audiences and scopes at 20', () => {
    const many = Array.from({ length: 21 }, (_, i) => `v${i}`);
    expect(jwtFormErrors({ ...valid, audiences: many }).audiences).toBeDefined();
    expect(jwtFormErrors({ ...valid, scopes: { 'GET /a': { allOf: many, anyOf: [] } } }).scopes?.['GET /a']).toBeDefined();
  });
});

describe('summaries', () => {
  it('shows the header a client sends', () => {
    expect(tokenHeaderExample(undefined)).toBe('Authorization: Bearer <token>');
    expect(tokenHeaderExample({ headerName: 'X-JWT', authHeaderPrefix: 'JWT' })).toBe('X-JWT: JWT <token>');
  });

  it('shows what the backend receives', () => {
    expect(forwardedTokenExample(undefined)).toBe('X-Forwarded-Authorization: Bearer <token>');
    expect(forwardedTokenExample({ forwardTokenStripScheme: true })).toBe('X-Forwarded-Authorization: <token>');
    expect(forwardedTokenExample({ forwardToken: false })).toBeNull();
  });

  it('writes a requirement in one line', () => {
    expect(scopeRequirementText({ allOf: ['a', 'b'], anyOf: ['c'] })).toBe('All of: a, b · Any of: c');
    expect(scopeRequirementText(undefined)).toBe('');
  });
});
