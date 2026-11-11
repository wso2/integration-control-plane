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

import { beforeEach, describe, expect, it, vi } from 'vitest';

const post = vi.hoisted(() => vi.fn());
const get = vi.hoisted(() => vi.fn());
const put = vi.hoisted(() => vi.fn());
const del = vi.hoisted(() => vi.fn());

vi.mock('./_client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./_client')>();
  return { ...actual, bff: { ...actual.bff, post, get, put, delete: del } };
});

import {
  createEndpointApiKey,
  createEndpointTestKey,
  exposeEndpoint,
  getEndpointPolicies,
  setEndpointPolicies,
  getEndpointSecurity,
  listEndpointApiKeys,
  revokeEndpointApiKey,
  setEndpointApiKeyAuth,
  setEndpointJwtAuth,
  setEndpointSecurity,
  unexposeEndpoint,
} from './consumers';
import type { EndpointRef } from '../types/consumers';

const BASE = '/components/hello/environments/development/endpoints/api';
const TRACKED: EndpointRef = { componentName: 'hello', environmentName: 'development', endpointName: 'api', deploymentTrackId: 'next-bbbbbb' };
const DEFAULT: EndpointRef = { componentName: 'hello', environmentName: 'development', endpointName: 'api', deploymentTrackId: '' };

const urls = () => [...get.mock.calls, ...post.mock.calls, ...put.mock.calls, ...del.mock.calls].map(([url]) => url as string);

describe('endpoint API calls', () => {
  beforeEach(() => {
    for (const fn of [get, post, put, del]) {
      fn.mockReset();
      fn.mockResolvedValue({});
    }
  });

  // Each track's API has its own URL, security and keys.
  it("address the ref's deployment track", async () => {
    await exposeEndpoint(TRACKED);
    await unexposeEndpoint(TRACKED);
    await listEndpointApiKeys(TRACKED);
    await createEndpointApiKey(TRACKED, { displayName: 'app-1' });
    await revokeEndpointApiKey(TRACKED, 'key-1');
    await createEndpointTestKey(TRACKED);
    await setEndpointApiKeyAuth(TRACKED, true);
    await setEndpointJwtAuth(TRACKED, false);
    await getEndpointSecurity(TRACKED);
    await setEndpointSecurity(TRACKED, { mode: 'none' });
    await getEndpointPolicies(TRACKED);
    await setEndpointPolicies(TRACKED, {} as Parameters<typeof setEndpointPolicies>[1]);
    expect(urls().sort()).toEqual(
      [
        `${BASE}/expose?deploymentTrackId=next-bbbbbb`,
        `${BASE}/expose?deploymentTrackId=next-bbbbbb`,
        `${BASE}/api-keys?deploymentTrackId=next-bbbbbb`,
        `${BASE}/api-keys?deploymentTrackId=next-bbbbbb`,
        `${BASE}/api-keys/key-1?deploymentTrackId=next-bbbbbb`,
        `${BASE}/test-key?deploymentTrackId=next-bbbbbb`,
        `${BASE}/security/api-key?deploymentTrackId=next-bbbbbb`,
        `${BASE}/security/jwt?deploymentTrackId=next-bbbbbb`,
        `${BASE}/security?deploymentTrackId=next-bbbbbb`,
        `${BASE}/security?deploymentTrackId=next-bbbbbb`,
        `${BASE}/policies?deploymentTrackId=next-bbbbbb`,
        `${BASE}/policies?deploymentTrackId=next-bbbbbb`,
      ].sort(),
    );
  });

  it('send no track for the default one', async () => {
    await getEndpointSecurity(DEFAULT);
    expect(get).toHaveBeenCalledWith(`${BASE}/security`);
  });
});

describe('api keys', () => {
  beforeEach(() => {
    for (const fn of [get, post, put, del]) fn.mockReset();
  });

  it("issue a key under the name it's given, on the endpoint's track", async () => {
    post.mockResolvedValueOnce({ keyId: 'k1', apiKey: 'secret' });
    await createEndpointApiKey(TRACKED, { displayName: 'billing-service' });
    expect(post).toHaveBeenCalledWith(`${BASE}/api-keys?deploymentTrackId=next-bbbbbb`, { displayName: 'billing-service' });
  });

  it('list the bare array or the items envelope alike', async () => {
    const key = { name: 'k1', displayName: 'billing-service', maskedApiKey: '***abcde', status: 'active' };
    get.mockResolvedValueOnce([key]).mockResolvedValueOnce({ items: [key] });
    expect(await listEndpointApiKeys(TRACKED)).toEqual([key]);
    expect(await listEndpointApiKeys(TRACKED)).toEqual([key]);
  });
});
