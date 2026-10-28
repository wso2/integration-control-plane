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

import { beforeEach, describe, expect, it } from 'vitest';
import { getAndClearRedirectUrl, saveRedirectUrl } from './redirectUrl';

beforeEach(() => {
  localStorage.clear();
});

describe('redirectUrl', () => {
  it('hands back the saved URL once', () => {
    saveRedirectUrl('https://console.example/organizations/acme/projects/p1/home');
    expect(getAndClearRedirectUrl()).toBe('https://console.example/organizations/acme/projects/p1/home');
    expect(getAndClearRedirectUrl()).toBeNull();
  });

  it.each(['https://console.example/organizations/default', 'https://console.example/organizations/default/projects/p1/home'])('never saves the placeholder default org (%s)', (url) => {
    saveRedirectUrl(url);
    expect(getAndClearRedirectUrl()).toBeNull();
  });

  it('does not mistake an org whose handle starts with "default" for the placeholder', () => {
    saveRedirectUrl('https://console.example/organizations/default-team/home');
    expect(getAndClearRedirectUrl()).toBe('https://console.example/organizations/default-team/home');
  });

  it('keeps a value it cannot parse as a URL', () => {
    saveRedirectUrl('not a url');
    expect(getAndClearRedirectUrl()).toBe('not a url');
  });
});
