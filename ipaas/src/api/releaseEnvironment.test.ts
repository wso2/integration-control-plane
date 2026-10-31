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
 * A release doesn't identify an environment: after a promotion two environments run the same
 * one. So every release call names the environment it acts in (integration-engineering#4106).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  (globalThis as unknown as { __PRODUCT__: string }).__PRODUCT__ = 'cloud';
});

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));

vi.mock('./_client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./_client')>()),
  bff: { get, post, put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

import { fetchComponentPodMetrics, fetchComponentPods, fetchPodEvents, fetchPodLogs, fetchReleaseDetails, redeployRelease } from './runtime';
import { fetchEnvEndpoints, redeployDeployment } from './deployments';
import { fetchTaskExecutions, triggerComponentRun } from './executions';
import { getReleaseById } from './devopsConfigs';

// A release names its track, so the release routes need none; the others carry it.
const release = '/components/orders/environments/production/releases/r1';

beforeEach(() => {
  get.mockReset().mockResolvedValue({});
  post.mockReset().mockResolvedValue({});
});

describe('release calls name the environment', () => {
  it.each([
    ['runtime', () => fetchReleaseDetails('p', 'orders', 'production', 'r1'), get, `${release}/runtime`],
    ['pods', () => fetchComponentPods('p', 'orders', 'production', 'r1'), get, `${release}/pods`],
    ['metrics', () => fetchComponentPodMetrics('p', 'orders', 'production', 'r1'), get, `${release}/metrics`],
    ['pod events', () => fetchPodEvents('p', 'orders', 'production', 'r1', 'pod-1'), get, `${release}/pods/pod-1/events`],
    ['pod logs', () => fetchPodLogs('p', 'orders', 'production', 'r1', 'pod-1', { previous: false }), get, `${release}/pods/pod-1/logs?previous=false`],
    ['runtime redeploy', () => redeployRelease('p', 'orders', 'production', 'r1'), post, `${release}/redeploy`],
    ['card redeploy', () => redeployDeployment({ orgHandler: 'acme', componentId: 'orders', environmentId: 'production', releaseId: 'r1', type: 'service' }), post, `${release}/redeploy`],
    ['executions', () => triggerComponentRun({ orgHandler: 'acme', projectId: 'p', componentId: 'orders', environmentId: 'production', releaseId: 'r1' }), post, `${release}/executions`],
    ['execution history', () => fetchTaskExecutions('r1', 'orders', 'production'), get, `${release}/executions/history?limit=100`],
    ['endpoints', () => fetchEnvEndpoints('orders', 'next-bbbbbb', 'production', 'r1'), get, '/components/orders/environments/production/endpoints?deploymentTrackId=next-bbbbbb'],
    ['containers', () => getReleaseById('', 'p', 'orders', 'production', 'r1', 'next-bbbbbb'), get, '/components/orders/environments/production/containers?deploymentTrackId=next-bbbbbb'],
  ])('%s', async (_name, call, method, path) => {
    await call();
    expect(method).toHaveBeenCalledTimes(1);
    expect((method.mock.calls[0] as unknown[])[0]).toBe(path);
  });
});
