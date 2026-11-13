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

import { describe, expect, it, vi } from 'vitest';
import { acceptedWorkflowDeploy, fetchWorkflowDeploy, toWorkflowDeploy, toWorkflowRuntime } from './workflowRuntime';

const bffGet = vi.hoisted(() => vi.fn());
vi.mock('./_client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./_client')>();
  return { ...actual, bff: { ...actual.bff, get: bffGet } };
});

describe('toWorkflowRuntime', () => {
  it('maps the server name and namespaces', () => {
    expect(toWorkflowRuntime({ status: 'READY', server: { name: 'ipaas-workflows' }, namespaces: [{ environment: 'qa', namespace: 'qa-env' }] })).toEqual({
      status: 'READY',
      serverName: 'ipaas-workflows',
      namespaces: [{ environment: 'qa', namespace: 'qa-env' }],
    });
  });

  it('reads an unknown status as an error and a null list as empty', () => {
    expect(toWorkflowRuntime({ status: 'SOMETHING_NEW', namespaces: null })).toEqual({ status: 'ERROR', serverName: undefined, namespaces: [] });
  });
});

describe('acceptedWorkflowDeploy', () => {
  it('reads the deploying status a 202 answer to a workflow deploy carries', () => {
    expect(acceptedWorkflowDeploy({ environment: 'development', state: 'deploying', operation: 'deploy', startedAt: '2026-11-10T11:33:09Z', message: 'running' })).toEqual({
      environment: 'development',
      state: 'deploying',
      operation: 'deploy',
      startedAt: '2026-11-10T11:33:09Z',
      finishedAt: undefined,
      releaseName: undefined,
      message: 'running',
    });
  });

  it.each([
    ['a deploy finished within its request', { message: 'orders-20261110-3' }],
    ['a promote finished within its request', { message: 'orders-20261110-3', proxyReconciliation: { status: 'SUCCEEDED' } }],
    ['an empty answer', null],
  ])('finds none in %s', (_name, body) => {
    expect(acceptedWorkflowDeploy(body)).toBeUndefined();
  });
});

describe('toWorkflowDeploy', () => {
  it('reads a state or operation it does not know as none and unset', () => {
    expect(toWorkflowDeploy({ environment: 'development', state: 'rolling', operation: 'redeploy' })).toMatchObject({ state: 'none', operation: undefined });
  });

  it('keeps a failed deploy’s message', () => {
    expect(toWorkflowDeploy({ environment: 'production', state: 'failed', operation: 'promote', message: 'the workflow runtime is unavailable; try again later' })).toMatchObject({
      state: 'failed',
      operation: 'promote',
      message: 'the workflow runtime is unavailable; try again later',
    });
  });
});

describe('fetchWorkflowDeploy', () => {
  it('reads an empty answer as no deploy', async () => {
    bffGet.mockResolvedValueOnce(null);
    await expect(fetchWorkflowDeploy('orders', 'development')).resolves.toEqual({ environment: 'development', state: 'none' });
  });

  it('reads the status of the environment it asked for', async () => {
    bffGet.mockResolvedValueOnce({ environment: 'development', state: 'deploying', operation: 'deploy' });
    await expect(fetchWorkflowDeploy('orders', 'development')).resolves.toMatchObject({ state: 'deploying' });
    expect(bffGet).toHaveBeenLastCalledWith('/components/orders/workflow-deploy?environment=development');
  });
});
