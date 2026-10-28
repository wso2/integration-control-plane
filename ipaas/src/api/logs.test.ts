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

import { fetchComponentLogs, fetchGatewayLogs, fetchLogs } from './logs';
import type { ComponentLogsRequest, GatewayLogsRequest } from '../types/logs';

// resolveComponentProject memoizes per component id, so every case needs its own.
let n = 0;
const request = (overrides: Partial<ComponentLogsRequest> = {}): ComponentLogsRequest =>
  ({
    componentId: `component-${++n}`,
    environmentId: 'Development',
    versionIdList: [],
    logLevels: [],
    startTime: '2026-09-10T00:00:00Z',
    endTime: '2026-09-10T01:00:00Z',
    limit: 100,
    sort: 'desc',
    region: 'US',
    searchPhrase: '',
    regexPhrase: '',
    ...overrides,
  }) as ComponentLogsRequest;

afterEach(() => {
  post.mockReset();
  get.mockReset();
});

describe('fetchComponentLogs project scoping', () => {
  // The observer answers a component-scoped query with no project
  // "searchScope.project is required when searchScope.component is provided"
  // (400), so a component whose project cannot be resolved must not be queried.
  it('does not query when the component has no build to resolve a project from', async () => {
    get.mockResolvedValue({ items: [] });

    expect(await fetchComponentLogs(request(), 'ignored')).toEqual([]);
    expect(post).not.toHaveBeenCalled();
  });

  it('does not query when the builds lookup fails', async () => {
    get.mockRejectedValue(new Error('boom'));

    expect(await fetchComponentLogs(request(), 'ignored')).toEqual([]);
    expect(post).not.toHaveBeenCalled();
  });

  // An empty projectName is rejected exactly as a missing one is.
  it('treats an empty project name as unresolved', async () => {
    get.mockResolvedValue({ items: [{ projectName: '' }] });

    expect(await fetchComponentLogs(request(), 'ignored')).toEqual([]);
    expect(post).not.toHaveBeenCalled();
  });

  it('scopes the query to the resolved project, component and lower-cased environment', async () => {
    get.mockResolvedValue({ items: [{ projectName: 'default' }] });
    post.mockResolvedValue({ logs: [{ timestamp: 't', level: 'INFO', log: 'hello' }] });

    const req = request({ environmentId: 'Development' });
    const rows = await fetchComponentLogs(req, 'ignored');

    expect(post.mock.calls[0][1].searchScope).toEqual({ project: 'default', component: req.componentId, environment: 'development' });
    expect(rows).toHaveLength(1);
    expect(rows[0].logLine).toBe('hello');
  });
});

describe('level filtering', () => {
  // The observer matches logLevels against a level parsed from the line, not the
  // one it returns, so any value hides plain container output. Sending none is
  // what makes a cron task's logs visible at all — this is the regression guard.
  it('never sends logLevels, even when the request carries them', async () => {
    get.mockResolvedValue({ items: [{ projectName: 'default' }] });
    post.mockResolvedValue({ logs: [] });

    await fetchComponentLogs(request({ logLevels: ['ERROR'] }), 'ignored');
    expect(post.mock.calls[0][1]).not.toHaveProperty('logLevels');
  });

  it('never sends logLevels from the project-scoped query either', async () => {
    post.mockResolvedValue({ logs: [] });

    await fetchLogs({ ...request(), projectId: 'default', componentIdList: ['a', 'b'], environmentList: 'development', logLevels: ['INFO'] } as never, 'ignored');
    expect(post.mock.calls[0][1]).not.toHaveProperty('logLevels');
  });
});

describe('fetchLogs scoping', () => {
  it('narrows to the component when exactly one is selected', async () => {
    post.mockResolvedValue({ logs: [] });

    await fetchLogs({ ...request(), projectId: 'default', componentIdList: ['scheduled-logger'], environmentList: 'Development', environmentId: 'Development', logLevels: [] } as never, 'ignored');
    expect(post.mock.calls[0][1].searchScope).toEqual({ project: 'default', component: 'scheduled-logger', environment: 'development' });
  });

  // Several components mean "all in project", which the project scope covers —
  // and which is why the query also returns pods the console does not list.
  it('stays project-scoped when several components are selected', async () => {
    post.mockResolvedValue({ logs: [] });

    await fetchLogs({ ...request(), projectId: 'default', componentIdList: ['a', 'b'], environmentList: 'development', logLevels: [] } as never, 'ignored');
    expect(post.mock.calls[0][1].searchScope).not.toHaveProperty('component');
  });
});

describe('toLogRow provenance', () => {
  it('surfaces the nested Kubernetes metadata', async () => {
    get.mockResolvedValue({ items: [{ projectName: 'default' }] });
    post.mockResolvedValue({
      logs: [{ timestamp: 't', level: 'INFO', log: 'hello', metadata: { componentName: 'scheduled-logger', containerName: 'main', podName: 'scheduled-logger-development-1-abc' } }],
    });

    const [row] = await fetchComponentLogs(request(), 'ignored');
    expect(row.componentName).toBe('scheduled-logger');
    expect(row.containerName).toBe('main');
    expect(row.podName).toBe('scheduled-logger-development-1-abc');
  });

  // Consumers read these unconditionally, so an entry without metadata must
  // still produce the fields.
  it('reports null for an entry with no metadata', async () => {
    get.mockResolvedValue({ items: [{ projectName: 'default' }] });
    post.mockResolvedValue({ logs: [{ timestamp: 't', level: 'INFO', log: 'hello' }] });

    const [row] = await fetchComponentLogs(request(), 'ignored');
    expect(row.componentName).toBeNull();
    expect(row.containerName).toBeNull();
    expect(row.podName).toBeNull();
  });
});

describe('fetchGatewayLogs', () => {
  const gatewayRequest = (limit: number): GatewayLogsRequest => ({ environmentId: 'Development', searchPhrase: '/greeting', startTime: '2026-09-10T00:00:00Z', endTime: '2026-09-10T01:00:00Z', limit, sort: 'desc' });
  const entry = (containerName: string, timestamp: string) => ({ timestamp, level: 'INFO', log: 'line', metadata: { containerName } });

  it('keeps only rows logged by a gateway container', async () => {
    post.mockResolvedValue({ logs: [entry('gateway-runtime', 't3'), entry('main', 't2'), entry('gateway-controller', 't1')] });

    const page = await fetchGatewayLogs(gatewayRequest(100));
    expect(page.rows.map((r) => r.containerName)).toEqual(['gateway-runtime', 'gateway-controller']);
    expect(page.rows.every((r) => r.source === 'gateway')).toBe(true);
  });

  it('pages from the unfiltered batch, so dropped rows do not end paging early', async () => {
    post.mockResolvedValue({ logs: [entry('gateway-runtime', 't2'), entry('main', 't1')] });

    expect((await fetchGatewayLogs(gatewayRequest(2))).nextCursor).toBe('t1');
    expect((await fetchGatewayLogs(gatewayRequest(3))).nextCursor).toBeUndefined();
  });

  it('fails a full page whose last entry has no timestamp instead of ending paging silently', async () => {
    post.mockResolvedValue({ logs: [entry('gateway-runtime', 't2'), { log: 'line', metadata: { containerName: 'main' } }] });

    await expect(fetchGatewayLogs(gatewayRequest(2))).rejects.toThrow(/no timestamp/);
  });
});

describe('fetchComponentLogs environment scope', () => {
  it('leaves the environment out of the scope when none is given, and names each row by its own', async () => {
    get.mockResolvedValue({ items: [{ projectName: 'default' }] });
    post.mockResolvedValue({ logs: [{ timestamp: 't1', log: 'line', metadata: { environmentName: 'production' } }] });

    const rows = await fetchComponentLogs(request({ environmentId: undefined }), 'ignored');
    expect(post.mock.calls[0][1].searchScope).not.toHaveProperty('environment');
    expect(rows[0].environment).toBe('production');
  });
});
