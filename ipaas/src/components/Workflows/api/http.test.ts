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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkflowApiError, buildQuery, retryWorkflowRead, workflowFetch } from './http';

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('workflowFetch', () => {
  it('sends the headers it is given and parses the answer', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{"taskQueue":"q"}'));
    await expect(workflowFetch('https://gw/x/runtime', { headers: { 'X-API-Key': 'k' } })).resolves.toEqual({ taskQueue: 'q' });
    // No body, so no content type: a read stays as simple a request as its headers allow.
    expect(fetchMock.mock.calls[0][1]).toEqual({ method: 'GET', headers: { 'X-API-Key': 'k' }, body: undefined });
  });

  it('sends a body as JSON', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await workflowFetch('https://gw/x/workflows/w/signal', { method: 'POST', headers: { 'X-API-Key': 'k' }, body: { name: 'go' } });
    expect(fetchMock.mock.calls[0][1]).toEqual({ method: 'POST', headers: { 'X-API-Key': 'k', 'Content-Type': 'application/json' }, body: '{"name":"go"}' });
  });

  it('reads an empty answer as null', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(workflowFetch('https://gw/x/wake', { method: 'POST', headers: {} })).resolves.toBeNull();
  });

  it('names a refusal, keeping the engine’s own words when it gave any', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{"error":{"message":"Workflow is not running"}}', { status: 409 }));
    await expect(workflowFetch('https://gw/x/workflows/w/terminate', { method: 'POST', headers: {} })).rejects.toMatchObject({
      code: 'CONFLICT',
      status: 409,
      message: 'Workflow is not running',
      route: 'POST https://gw/x/workflows/w/terminate',
    });

    fetchMock.mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }));
    await expect(workflowFetch('https://gw/x/runtime', { headers: {} })).rejects.toMatchObject({
      code: 'GATEWAY_REJECTED',
      message: 'The gateway rejected the test key. It may have expired.',
    });
  });

  it('reads a failed request as the engine being out of reach', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(workflowFetch('https://gw/x/runtime', { headers: {} })).rejects.toMatchObject({ code: 'NETWORK', status: 0 });
  });

  it('reads a connection dropped mid-body the same way', async () => {
    const response = new Response('{"taskQueue":');
    vi.spyOn(response, 'text').mockRejectedValueOnce(new TypeError('network error'));
    fetchMock.mockResolvedValueOnce(response);
    await expect(workflowFetch('https://gw/x/runtime', { headers: {} })).rejects.toMatchObject({ code: 'NETWORK', status: 0 });
  });
});

describe('buildQuery', () => {
  it('drops empty values rather than sending them as literals', () => {
    expect(buildQuery({ status: 'RUNNING', workflowType: '', pageToken: undefined, taskQueue: null, limit: 20 })).toBe('?status=RUNNING&limit=20');
    expect(buildQuery({})).toBe('');
  });
});

describe('retryWorkflowRead', () => {
  it('does not ask again what the gateway or the engine answered on purpose', () => {
    expect(retryWorkflowRead(0, new WorkflowApiError('GATEWAY_REJECTED', 401, null, 'GET /x'))).toBe(false);
    expect(retryWorkflowRead(0, new WorkflowApiError('NOT_FOUND', 404, null, 'GET /x'))).toBe(false);
  });

  it('tries an unreachable or failing engine twice more', () => {
    const network = new WorkflowApiError('NETWORK', 0, null, 'GET /x');
    expect(retryWorkflowRead(0, network)).toBe(true);
    expect(retryWorkflowRead(1, new WorkflowApiError('EXECUTION_ERROR', 500, null, 'GET /x'))).toBe(true);
    expect(retryWorkflowRead(2, network)).toBe(false);
  });
});
