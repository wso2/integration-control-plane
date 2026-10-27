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

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchMoesifViewerToken } from './moesif';
import { authenticatedFetch } from '../auth';
vi.mock('../auth', () => ({ authenticatedFetch: vi.fn() }));
afterEach(() => vi.resetAllMocks());
const signal = new AbortController().signal;
describe('Moesif viewer token', () => {
  it('uses authenticated transport, cancellation and no-store without an org override', async () => {
    vi.mocked(authenticatedFetch).mockResolvedValue(new Response(JSON.stringify({ token: 'viewer' })));
    expect(await fetchMoesifViewerToken('https://cloud.example/proxy', signal)).toBe('viewer');
    expect(authenticatedFetch).toHaveBeenCalledWith('https://cloud.example/proxy/analytics/id-token', { signal, cache: 'no-store', headers: { Accept: 'application/json' } });
  });
  it.each([null, {}, { token: '' }, { token: 123 }, { token: ' ' }])('rejects malformed tokens %j', async (payload) => {
    vi.mocked(authenticatedFetch).mockResolvedValue(new Response(JSON.stringify(payload)));
    await expect(fetchMoesifViewerToken('https://cloud.example', signal)).rejects.toThrow('invalid viewer token');
  });
  it('reports a deployment without the upstream as not configured', async () => {
    vi.mocked(authenticatedFetch).mockResolvedValue(new Response('{"error":"Service Unavailable","message":"API Insights not configured"}', { status: 503 }));
    await expect(fetchMoesifViewerToken('https://cloud.example', signal)).rejects.toThrow('not configured for this deployment');
  });
  it('treats other 503s as transient', async () => {
    vi.mocked(authenticatedFetch).mockResolvedValue(new Response('upstream connect error', { status: 503 }));
    await expect(fetchMoesifViewerToken('https://cloud.example', signal)).rejects.toThrow('temporarily unavailable');
  });
  it.each([401, 403, 404, 503])('does not expose server response content for %s', async (status) => {
    vi.mocked(authenticatedFetch).mockResolvedValue(new Response('sensitive upstream error', { status }));
    await expect(fetchMoesifViewerToken('https://cloud.example', signal)).rejects.not.toThrow('sensitive');
  });
});
