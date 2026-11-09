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
import { humanTasksComingSoon, testKeyNotice, testKeyReasonOf, workflowRequestHeaders } from './workflowCredential';

/** A failed BFF read, as `httpStatusOf` sees it. */
const failed = (status: number) => Object.assign(new Error(`HTTP ${status}`), { status });

const access = (patch: Partial<Parameters<typeof testKeyReasonOf>[0]> = {}) => ({
  isUnavailable: false,
  securityError: null,
  mode: 'api-key' as const,
  isAuthorized: true,
  keyError: null,
  canCreateKey: true,
  needsApiKeyAuth: false,
  canSwitch: true,
  managedIn: null as string | null,
  ...patch,
});

describe('workflowRequestHeaders', () => {
  it('sends the test key in the gateway’s header, and nothing else', () => {
    expect(workflowRequestHeaders({ authHeader: 'X-API-Key', apiKey: 'key-1' })).toEqual({ 'X-API-Key': 'key-1' });
  });

  it('uses whatever header the gateway’s policy names', () => {
    expect(workflowRequestHeaders({ authHeader: 'Internal-Key', apiKey: 'key-1' })).toEqual({ 'Internal-Key': 'key-1' });
  });

  it('sends no credential to an open API, and never an empty one', () => {
    expect(workflowRequestHeaders({ authHeader: 'X-API-Key', apiKey: null })).toEqual({});
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

  it('names an exposed API with no URL, one that takes no test key, and a failed mint', () => {
    expect(testKeyReasonOf(access({ isUnavailable: true }))).toBe('no-gateway-url');
    expect(testKeyReasonOf(access({ isAuthorized: false, mode: 'jwt', needsApiKeyAuth: true }))).toBe('needs-api-key');
    // ipaas-service refused a key for an endpoint the security read calls api-key.
    expect(testKeyReasonOf(access({ isAuthorized: false, needsApiKeyAuth: true }))).toBe('needs-api-key');
    // Where the security comes by promotion, it can't be switched here.
    expect(testKeyReasonOf(access({ isAuthorized: false, mode: 'jwt', needsApiKeyAuth: true, canSwitch: false, managedIn: 'development' }))).toBe('secured-by-promotion');
    expect(testKeyReasonOf(access({ isAuthorized: false, keyError: 'Could not mint a test key.' }))).toBe('mint-failed');
  });

  it('names a role that may not create test keys, whatever the endpoint’s mode', () => {
    expect(testKeyReasonOf(access({ isAuthorized: false, canCreateKey: false, keyError: "Your role can't create test keys." }))).toBe('key-refused');
    expect(testKeyReasonOf(access({ isAuthorized: false, mode: 'jwt', canCreateKey: false }))).toBe('key-refused');
    // An open API needs no key, so the role does not matter.
    expect(testKeyReasonOf(access({ mode: 'none', canCreateKey: false }))).toBeNull();
  });
});

describe('testKeyNotice', () => {
  it('says what to do about an endpoint that is not exposed yet, as the Test Console does', () => {
    const notice = testKeyNotice('not-exposed', access({ isUnavailable: true, securityError: failed(409) }));
    expect(notice.severity).toBe('info');
    expect(notice.text).toContain('isn’t exposed on the gateway yet');
    expect(notice.text).toContain('Set the endpoint’s visibility to Public and deploy');
  });

  it('says switching to API key changes every caller, or that the role cannot switch', () => {
    expect(testKeyNotice('needs-api-key', access({ mode: 'jwt' })).text).toBe(
      'The Workflow Management API uses OAuth authentication, so it can’t issue the test key the console calls it with. Switching it to API key changes how every caller of this API authenticates.',
    );
    expect(testKeyNotice('needs-api-key', access({ mode: 'jwt', canSwitch: false })).text).toContain('Your role can’t switch it to API key.');
  });

  it('says where an environment that takes its security by promotion gets it, and the ways out of it', () => {
    const notice = testKeyNotice('secured-by-promotion', access({ mode: 'jwt', canSwitch: false, managedIn: 'development' }));
    expect(notice.severity).toBe('info');
    expect(notice.text).toContain('takes the Workflow Management API’s security from development by promotion');
    expect(notice.text).toContain('Publish the workflow to the User Portal here');
    expect(notice.text).toContain('put the API back on API key in development');
  });

  it('passes the mint failure through in the words the hook chose', () => {
    expect(testKeyNotice('mint-failed', access({ keyError: 'Your session has expired. Sign in again and retry.' }))).toEqual({
      severity: 'warning',
      text: 'Your session has expired. Sign in again and retry.',
    });
  });
});

describe('humanTasksComingSoon', () => {
  it('points to the User Portal only where ipaas-service serves one', () => {
    expect(humanTasksComingSoon(true)).toContain('publish this workflow to the User Portal');
    expect(humanTasksComingSoon(false)).toBe('Human tasks are coming to the console.');
  });
});
