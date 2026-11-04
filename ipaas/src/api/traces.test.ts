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

/**
 * The paths and query strings these calls build. The scope lives in the path —
 * the BFF derives the organization, project and agent from it — so a wrong path
 * is a wrong scope, not just a 404.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('./_client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./_client')>()),
  bff: { get, post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

import { fetchSpanDetail, fetchTraceSpans, fetchTraces } from './traces';

const window = { startTime: '2026-11-01T00:00:00Z', endTime: '2026-11-01T01:00:00Z' };

function calledPath(): string {
  return get.mock.calls[0][0] as string;
}

function calledParams(): URLSearchParams {
  return new URLSearchParams(calledPath().split('?')[1] ?? '');
}

beforeEach(() => {
  get.mockReset();
  get.mockResolvedValue({});
});

describe('fetchTraces', () => {
  it('addresses the component and environment', async () => {
    await fetchTraces('greeter', 'development', window);

    expect(calledPath().split('?')[0]).toBe('/components/greeter/environments/development/traces');
  });

  it('encodes path segments', async () => {
    await fetchTraces('a/b', 'dev env', window);

    expect(calledPath().split('?')[0]).toBe('/components/a%2Fb/environments/dev%20env/traces');
  });

  it('sends the window, paging and include list', async () => {
    await fetchTraces('greeter', 'development', { ...window, limit: 25, sortOrder: 'desc', cursor: 'page-2', include: ['models', 'tools'] });

    const params = calledParams();
    expect(params.get('startTime')).toBe(window.startTime);
    expect(params.get('endTime')).toBe(window.endTime);
    expect(params.get('limit')).toBe('25');
    expect(params.get('sortOrder')).toBe('desc');
    expect(params.get('cursor')).toBe('page-2');
    expect(params.get('include')).toBe('models,tools');
  });

  it('omits paging that was not asked for', async () => {
    await fetchTraces('greeter', 'development', window);

    const params = calledParams();
    expect(params.has('cursor')).toBe(false);
    expect(params.has('include')).toBe(false);
    expect(params.has('limit')).toBe(false);
  });
});

describe('fetchTraceSpans', () => {
  // A partial span list renders as orphaned branches, so the tree is fetched whole.
  it('asks for the whole tree in start order, ignoring the listing paging', async () => {
    await fetchTraceSpans('greeter', 'development', 't-1', { ...window, limit: 25, sortOrder: 'desc', cursor: 'page-2', include: ['tools'] });

    const params = calledParams();
    expect(calledPath().split('?')[0]).toBe('/components/greeter/environments/development/traces/t-1/spans');
    expect(params.get('limit')).toBe('1000');
    expect(params.get('sortOrder')).toBe('asc');
    expect(params.has('cursor')).toBe(false);
    expect(params.has('include')).toBe(false);
  });
});

describe('fetchSpanDetail', () => {
  it('addresses the span and sends only the window the BFF checks it against', async () => {
    await fetchSpanDetail('greeter', 'development', 't-1', 's-1', { ...window, limit: 25, cursor: 'page-2' });

    const params = calledParams();
    expect(calledPath().split('?')[0]).toBe('/components/greeter/environments/development/traces/t-1/spans/s-1');
    expect(params.get('startTime')).toBe(window.startTime);
    expect(params.get('endTime')).toBe(window.endTime);
    expect(params.has('limit')).toBe(false);
    expect(params.has('cursor')).toBe(false);
  });
});
