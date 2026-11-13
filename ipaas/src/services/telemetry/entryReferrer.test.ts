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

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { entryReferrer, rememberEntryReferrer } from './entryReferrer';

const setReferrer = (referrer: string) => Object.defineProperty(document, 'referrer', { value: referrer, configurable: true });

beforeEach(() => {
  window.sessionStorage.clear();
  (window as unknown as { API_CONFIG: object }).API_CONFIG = { authBaseUrl: 'https://auth.example.com/auth' };
});
afterEach(() => setReferrer(''));

describe('entry referrer', () => {
  it('keeps the first landing across the sign-in round trip', () => {
    setReferrer('https://github.com/wso2');
    rememberEntryReferrer();
    // Back from the identity provider: the referrer is now its host.
    setReferrer('https://auth.example.com/auth/oauth2/authorize');
    rememberEntryReferrer();
    expect(entryReferrer()).toBe('github');
  });

  it('records a direct visit, so the return from signing in does not replace it', () => {
    setReferrer('');
    rememberEntryReferrer();
    setReferrer('https://auth.example.com/auth/oauth2/authorize');
    rememberEntryReferrer();
    expect(entryReferrer()).toBe('direct');
  });

  it('is unknown when the tab first loaded straight from signing in', () => {
    setReferrer('https://auth.example.com/auth/oauth2/authorize');
    rememberEntryReferrer();
    expect(entryReferrer()).toBe('unknown');
  });

  it('stores it under the console prefix, as a bucket and never a host', () => {
    setReferrer('https://wiki.acme-internal.corp/page');
    rememberEntryReferrer();
    expect(window.sessionStorage.getItem('icp:console_entry_referrer')).toBe('other');
    expect(JSON.stringify(window.sessionStorage)).not.toMatch(/acme/);
  });

  it('ignores a stored value that is not a known bucket', () => {
    window.sessionStorage.setItem('icp:console_entry_referrer', 'evil.example');
    expect(entryReferrer()).toBe('unknown');
  });
});
