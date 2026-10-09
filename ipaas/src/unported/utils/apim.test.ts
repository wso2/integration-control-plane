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
import { getApiBackendEndpoint } from './apim';
import type { ApimApiInfo } from '../../types/apim';

const baseApi = (endpointConfig?: Record<string, unknown>): ApimApiInfo => ({
  id: 'api-1',
  name: 'my-api',
  displayName: 'My API',
  version: '1.0.0',
  lifeCycleStatus: 'PUBLISHED',
  endpointConfig,
});

describe('getApiBackendEndpoint', () => {
  it('returns null when the api is null', () => {
    expect(getApiBackendEndpoint(null)).toBeNull();
  });

  it('returns null when there is no endpointConfig', () => {
    expect(getApiBackendEndpoint(baseApi())).toBeNull();
  });

  it('returns null when there are no production endpoints', () => {
    expect(getApiBackendEndpoint(baseApi({}))).toBeNull();
  });

  it('returns null when the production endpoint url is not a string', () => {
    expect(getApiBackendEndpoint(baseApi({ production_endpoints: { url: 123 } }))).toBeNull();
  });

  it('returns the production endpoint url when present', () => {
    expect(getApiBackendEndpoint(baseApi({ production_endpoints: { url: 'https://backend.example.com' } }))).toBe('https://backend.example.com');
  });
});
