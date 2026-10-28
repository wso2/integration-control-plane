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

import { afterEach, describe, expect, it } from 'vitest';
import type { ApiConfig } from '../config/runtimeConfig';
import { moesifInsightsUrl } from '../paths';
import { configuredMoesifOrigin, moesifOrigin } from './moesif';
describe('Moesif origin validation', () => {
  it.each(['https://www.moesif.com', 'https://web-dev.moesif.com'])('accepts %s', (origin) => expect(moesifOrigin(origin)).toBe(origin));
  it.each([undefined, '', 'invalid', 'http://www.moesif.com', 'https://www.moesif.com.evil.test', 'https://user:pass@www.moesif.com', 'https://www.moesif.com:444'])('rejects %s', (origin) => expect(moesifOrigin(origin)).toBeNull());
});

describe('API Insights configuration', () => {
  const config = window.API_CONFIG;
  afterEach(() => {
    window.API_CONFIG = config;
  });
  it.each([
    [undefined, null],
    ['', null],
    ['https://web.moesif.com', null],
    ['https://www.moesif.com/', 'https://www.moesif.com'],
  ])('reads MOESIF_APP_URL %j as %j', (moesifAppUrl, expected) => {
    window.API_CONFIG = { moesifAppUrl } as ApiConfig;
    expect(configuredMoesifOrigin()).toBe(expected);
  });
});

it('builds a postMessage-authenticated embed URL for the isolated APIs section, without credentials', () => {
  expect(moesifInsightsUrl('https://www.moesif.com')).toBe('https://www.moesif.com/wrap/basic/apis?embedded_ui=true&isolated_section=true#auth=post');
});
