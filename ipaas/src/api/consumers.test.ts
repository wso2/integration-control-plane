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
  createConsumer,
  createEndpointApiKey,
  createEndpointTestKey,
  exposeEndpoint,
  fetchConsumers,
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
const DEFAULT: EndpointRef = { componentName: 'hello', environmentName: 'development', endpointName: 'api' };

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

describe('consumers', () => {
  beforeEach(() => {
    for (const fn of [get, post, put, del]) fn.mockReset();
  });

  it("tag a new application with the endpoint's track", async () => {
    post.mockResolvedValueOnce({ id: 'app-1', displayName: 'Shop' }).mockResolvedValueOnce({ keyId: 'k1', apiKey: 'secret' });
    await createConsumer({ ...TRACKED, projectName: 'proj', appName: 'Shop' });
    expect(post).toHaveBeenNthCalledWith(1, '/applications', { displayName: 'Shop', projectName: 'proj', description: 'endpoint:hello/development/api@next-bbbbbb' });
    expect(post).toHaveBeenNthCalledWith(2, `${BASE}/api-keys?deploymentTrackId=next-bbbbbb`, { displayName: 'app-1' });
  });

  it("list a track's applications, and older ones whose keys its API holds", async () => {
    get.mockImplementation((url: string) =>
      url.startsWith('/applications')
        ? Promise.resolve([
            { id: 'tracked', displayName: 'Tracked', description: 'endpoint:hello/development/api@next-bbbbbb' },
            { id: 'other-track', displayName: 'Other', description: 'endpoint:hello/development/api@main-aaaaaa' },
            { id: 'legacy-here', displayName: 'Legacy here', description: 'endpoint:hello/development/api' },
            { id: 'legacy-elsewhere', displayName: 'Legacy elsewhere', description: 'endpoint:hello/development/api' },
          ])
        : Promise.resolve([
            { name: 'k-tracked', displayName: 'tracked', status: 'active' },
            { name: 'k-legacy', displayName: 'legacy-here', status: 'active' },
          ]),
    );
    const consumers = await fetchConsumers(TRACKED, 'proj');
    expect(consumers.map((c) => c.id)).toEqual(['tracked', 'legacy-here']);
  });
});
