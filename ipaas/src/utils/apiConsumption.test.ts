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
import { apiCallCurl, apiKeyLabel, apiKeySubtitle, isKeyNameTaken, jwtScopes, normalizeKeyStatus, tokenRequestCurl } from './apiConsumption';
import type { ApiKeySummary } from '../types/consumers';

const key = (over: Partial<ApiKeySummary> = {}): ApiKeySummary => ({ name: 'k-1', displayName: 'billing-service', maskedApiKey: '***abcde', status: 'active', ...over });

describe('normalizeKeyStatus', () => {
  it('maps the revoked-ish statuses regardless of case', () => {
    expect(normalizeKeyStatus('REVOKED')).toBe('revoked');
    expect(normalizeKeyStatus(' expired ')).toBe('revoked');
  });
  it('treats missing or unfamiliar statuses as active', () => {
    expect(normalizeKeyStatus(undefined)).toBe('active');
    expect(normalizeKeyStatus('ENABLED')).toBe('active');
  });
});

describe('apiKeyLabel', () => {
  it('lists a key under the name it was issued with', () => {
    expect(apiKeyLabel(key())).toBe('billing-service');
  });
  it('falls back to the key id for a key issued without a name', () => {
    expect(apiKeyLabel(key({ displayName: '  ' }))).toBe('k-1');
    expect(apiKeyLabel(key({ displayName: undefined }))).toBe('k-1');
  });
});

describe('apiKeySubtitle', () => {
  it('shows the masked key alone when the platform reports no dates', () => {
    expect(apiKeySubtitle(key())).toBe('***abcde');
  });
  it('adds when the key was issued and when it expires', () => {
    const subtitle = apiKeySubtitle(key({ createdAt: '2026-07-30T10:00:00Z', expiresAt: '2026-08-30T10:00:00Z' }));
    expect(subtitle.startsWith('***abcde · Created ')).toBe(true);
    expect(subtitle).toContain(' · Expires ');
  });
  it('leaves out an unparseable date', () => {
    expect(apiKeySubtitle(key({ createdAt: 'not-a-date' }))).toBe('***abcde');
  });
});

describe('isKeyNameTaken', () => {
  it('matches ignoring case and surrounding space', () => {
    expect(isKeyNameTaken('  Billing-Service ', ['billing-service'])).toBe(true);
  });
  it('allows a name no other key of this endpoint uses', () => {
    expect(isKeyNameTaken('other', ['billing-service'])).toBe(false);
  });
  it('never reports an empty name as taken — that is the required-field error', () => {
    expect(isKeyNameTaken('   ', ['', 'billing-service'])).toBe(false);
  });
});

describe('jwtScopes', () => {
  it("collects every operation's scopes once, in order", () => {
    expect(jwtScopes({ operations: { 'GET /a': { allOf: ['orders:read'] }, 'POST /a': { allOf: ['orders:write'], anyOf: ['orders:read', 'admin'] } } })).toEqual(['admin', 'orders:read', 'orders:write']);
  });
  it('is empty when no operation requires a scope', () => {
    expect(jwtScopes(undefined)).toEqual([]);
    expect(jwtScopes({ operations: {} })).toEqual([]);
  });
});

describe('tokenRequestCurl', () => {
  it('asks the token endpoint for a client credentials token', () => {
    expect(tokenRequestCurl('https://idp.example/oauth2/token')).toBe("curl -X POST 'https://idp.example/oauth2/token' \\\n  -u '<client-id>:<client-secret>' \\\n  -d 'grant_type=client_credentials'");
  });
  it('asks for the scopes the API requires', () => {
    expect(tokenRequestCurl('https://idp.example/oauth2/token', ['a', 'b'])).toContain("-d 'scope=a b'");
  });
  it('holds a placeholder while the token endpoint is unknown', () => {
    expect(tokenRequestCurl(undefined)).toContain("'<token-endpoint>'");
  });
});

describe('apiCallCurl', () => {
  it('sends the access token in the header the API reads it from', () => {
    expect(apiCallCurl('https://gw.example/api/v1', 'Authorization: Bearer <token>')).toBe("curl 'https://gw.example/api/v1' \\\n  -H 'Authorization: Bearer <access-token>'");
  });
});
