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
import { CALLER_ASSERTION_HEADER, testKeyNotice, testKeyReasonOf, workflowRequestHeaders } from './workflowCredential';

/** A failed BFF read, as `httpStatusOf` sees it. */
const failed = (status: number) => Object.assign(new Error(`HTTP ${status}`), { status });

const access = (patch: Partial<Parameters<typeof testKeyReasonOf>[0]> = {}) => ({
  isUnavailable: false,
  securityError: null,
  mode: 'api-key' as const,
  isAuthorized: true,
  keyError: null,
  ...patch,
});

describe('workflowRequestHeaders', () => {
  it('sends the test key in the gateway’s header and the caller’s token as an assertion', () => {
    expect(workflowRequestHeaders({ authHeader: 'X-API-Key', apiKey: 'key-1' }, 'user-token')).toEqual({
      'X-API-Key': 'key-1',
      [CALLER_ASSERTION_HEADER]: 'Bearer user-token',
    });
  });

  it('uses whatever header the gateway’s policy names', () => {
    expect(workflowRequestHeaders({ authHeader: 'Internal-Key', apiKey: 'key-1' }, null)).toEqual({ 'Internal-Key': 'key-1' });
  });

  it('sends only the assertion to an open API, and never an empty credential', () => {
    expect(workflowRequestHeaders({ authHeader: 'X-API-Key', apiKey: null }, 'user-token')).toEqual({ 'X-JWT-Assertion': 'Bearer user-token' });
    expect(workflowRequestHeaders({ authHeader: 'X-API-Key', apiKey: null }, null)).toEqual({});
  });
});

describe('testKeyReasonOf', () => {
  it('has none while the key is held, or while the gateway’s answer is still out', () => {
    expect(testKeyReasonOf(access())).toBeNull();
    expect(testKeyReasonOf(access({ isAuthorized: false, mode: null }))).toBeNull();
    // Minting: not a reason yet.
    expect(testKeyReasonOf(access({ isAuthorized: false }))).toBeNull();
  });

  it('reads a 409 as not exposed, a 503 as no gateway, and anything else as unreadable', () => {
    const unavailable = (status: number) => access({ isUnavailable: true, isAuthorized: false, mode: null, securityError: failed(status) });
    expect(testKeyReasonOf(unavailable(409))).toBe('not-exposed');
    expect(testKeyReasonOf(unavailable(503))).toBe('gateway-unavailable');
    expect(testKeyReasonOf(unavailable(500))).toBe('security-unreadable');
  });

  it('names an exposed API with no URL, a JWT-secured one, and a failed mint', () => {
    expect(testKeyReasonOf(access({ isUnavailable: true }))).toBe('no-gateway-url');
    expect(testKeyReasonOf(access({ isAuthorized: false, mode: 'jwt' }))).toBe('jwt-secured');
    expect(testKeyReasonOf(access({ isAuthorized: false, keyError: 'Could not mint a test key.' }))).toBe('mint-failed');
  });
});

describe('testKeyNotice', () => {
  it('says what to do about an endpoint that is not exposed yet, as the Test Console does', () => {
    const notice = testKeyNotice('not-exposed', access({ isUnavailable: true, securityError: failed(409) }));
    expect(notice.severity).toBe('info');
    expect(notice.text).toContain('isn’t exposed on the gateway yet');
    expect(notice.text).toContain('Set the endpoint’s visibility to Public and deploy');
  });

  it('warns that switching a JWT-secured endpoint is the person’s choice', () => {
    expect(testKeyNotice('jwt-secured', access()).text).toContain('switches the endpoint to API key authentication');
  });

  it('passes the mint failure through in the words the hook chose', () => {
    expect(testKeyNotice('mint-failed', access({ keyError: 'Your session has expired. Sign in again and retry.' }))).toEqual({
      severity: 'warning',
      text: 'Your session has expired. Sign in again and retry.',
    });
  });
});
