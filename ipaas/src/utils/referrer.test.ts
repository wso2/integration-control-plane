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
import { referrerSource, type ReferrerContext } from './referrer';

const context: ReferrerContext = {
  origin: 'https://console.wso2.com',
  consolePath: '/integration-platform',
  signInHosts: ['auth.wso2.com'],
  signInPaths: ['/auth', '/auth/signin'],
};

describe('referrerSource', () => {
  it.each([
    ['', 'direct'],
    ['https://www.google.com/', 'search'],
    ['https://www.google.co.uk/', 'search'],
    ['https://duckduckgo.com/', 'search'],
    ['https://github.com/wso2/integration-samples', 'github'],
    ['https://wso2.com/integration-platform/', 'wso2'],
    ['https://docs.wso2.com/', 'wso2'],
    ['https://console.wso2.com/organizations/acme/home', 'wso2-cloud'],
    ['https://wiki.acme-internal.corp/runbooks', 'other'],
    ['not a url', 'other'],
  ])('%s is %s', (referrer, want) => {
    expect(referrerSource(referrer, context)).toBe(want);
  });

  it.each([
    ['the identity provider', 'https://auth.wso2.com/oauth2/authorize'],
    ["the gateway's sign-in flow", 'https://console.wso2.com/auth/callback'],
    ['the console itself', 'https://console.wso2.com/integration-platform/organizations/acme'],
  ])('says nothing for %s', (_, referrer) => {
    expect(referrerSource(referrer, context)).toBeUndefined();
  });

  it('treats every same-origin page as the console in a root build', () => {
    expect(referrerSource('https://console.wso2.com/organizations/acme', { ...context, consolePath: '' })).toBeUndefined();
  });

  it('never returns a host', () => {
    expect(referrerSource('https://jira.acme.corp/browse/X-1', context)).toBe('other');
  });
});
