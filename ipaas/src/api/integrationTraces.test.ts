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

const post = vi.hoisted(() => vi.fn());
const get = vi.hoisted(() => vi.fn());

vi.mock('./_client', () => ({
  obsClient: { post },
  bff: { get },
  items: <T>(r: { items?: T[] } | null | undefined): T[] => r?.items ?? [],
  seg: (s: string) => encodeURIComponent(s),
}));

import { fetchComponentTraces, fetchTraceSpans } from './integrationTraces';
import type { ComponentTracesRequest } from '../types/integrationTraces';

// resolveComponentProject memoizes per component id, so every case needs its own.
let n = 0;
const request = (): ComponentTracesRequest => ({
  componentId: `component-${++n}`,
  environmentId: 'Development',
  startTime: '2026-10-30T00:00:00Z',
  endTime: '2026-10-30T01:00:00Z',
});

afterEach(() => {
  post.mockReset();
  get.mockReset();
});

describe('fetchComponentTraces', () => {
  it('queries the observer with the owning project, the integration and the lower-cased environment', async () => {
    get.mockResolvedValue({ items: [{ projectName: 'shop' }] });
    post.mockResolvedValue({ traces: [], total: 0 });
    const req = request();

    await fetchComponentTraces(req);

    expect(post).toHaveBeenCalledWith('/wso2cloud-obs/api/v1alpha1/traces/query', {
      searchScope: { project: 'shop', component: req.componentId, environment: 'development' },
      startTime: req.startTime,
      endTime: req.endTime,
      limit: 1000,
      sortOrder: 'desc',
    });
  });

  // The observer rejects a component-scoped query without its project.
  it('does not query when the project cannot be resolved', async () => {
    get.mockResolvedValue({ items: [] });

    expect(await fetchComponentTraces(request())).toEqual({ traces: [], total: 0, truncated: false });
    expect(post).not.toHaveBeenCalled();
  });

  it('maps traces and converts nanosecond durations to milliseconds', async () => {
    get.mockResolvedValue({ items: [{ projectName: 'shop' }] });
    post.mockResolvedValue({
      traces: [{ traceId: 't1', traceName: 'get /greeting', spanCount: 3, startTime: '2026-10-30T00:10:00Z', endTime: '2026-10-30T00:10:01Z', durationNs: 1_500_000, hasErrors: true }],
      total: 1,
    });

    expect(await fetchComponentTraces(request())).toEqual({
      traces: [{ traceId: 't1', name: 'get /greeting', spanCount: 3, startTime: '2026-10-30T00:10:00Z', endTime: '2026-10-30T00:10:01Z', durationMs: 1.5, hasErrors: true }],
      total: 1,
      truncated: false,
    });
  });

  it('drops traces that carry no id or start time', async () => {
    get.mockResolvedValue({ items: [{ projectName: 'shop' }] });
    post.mockResolvedValue({ traces: [{ traceName: 'no id', startTime: '2026-10-30T00:10:00Z' }, { traceId: 'no-start' }], total: 2 });

    expect((await fetchComponentTraces(request())).traces).toEqual([]);
  });

  // The observer stops counting at its page size, so a full page means there may be more.
  it('marks a window that reaches the query limit as truncated', async () => {
    get.mockResolvedValue({ items: [{ projectName: 'shop' }] });
    post.mockResolvedValue({ traces: [], total: 1000 });

    expect((await fetchComponentTraces(request())).truncated).toBe(true);
  });
});

describe('fetchTraceSpans', () => {
  it('asks for attributes and reads the service from service.name', async () => {
    get.mockResolvedValue({ items: [{ projectName: 'shop' }] });
    post.mockResolvedValue({
      spans: [
        {
          spanId: 's1',
          spanName: 'get /greet',
          spanKind: 'SERVER',
          startTime: '2026-10-30T00:10:00Z',
          endTime: '2026-10-30T00:10:00.120Z',
          durationNs: 120_000_000,
          status: { code: 'error', message: 'boom' },
          attributes: { 'http.status_code': 500, 'http.method': 'GET' },
          resourceAttributes: { 'service.name': '/api' },
        },
      ],
    });

    const spans = await fetchTraceSpans(request(), 'trace/1');

    expect(post.mock.calls[0]?.[0]).toBe('/wso2cloud-obs/api/v1alpha1/traces/trace%2F1/spans/query');
    expect(post.mock.calls[0]?.[1]).toMatchObject({ includeAttributes: true });
    expect(spans).toEqual([
      {
        traceId: 'trace/1',
        spanId: 's1',
        name: 'get /greet',
        kind: 'SERVER',
        startTime: '2026-10-30T00:10:00Z',
        endTime: '2026-10-30T00:10:00.120Z',
        durationMs: 120,
        status: 'error',
        statusMessage: 'boom',
        serviceName: '/api',
        attributes: { 'http.status_code': '500', 'http.method': 'GET' },
      },
    ]);
  });

  it('files a span without service.name under unknown_service and an unrecognised status as unset', async () => {
    get.mockResolvedValue({ items: [{ projectName: 'shop' }] });
    post.mockResolvedValue({ spans: [{ spanId: 's1', startTime: '2026-10-30T00:10:00Z', status: { code: 'STATUS_CODE_UNSET' } }] });

    const [span] = await fetchTraceSpans(request(), 't1');

    expect(span).toMatchObject({ serviceName: 'unknown_service', status: 'unset', durationMs: 0, attributes: {} });
  });
});
