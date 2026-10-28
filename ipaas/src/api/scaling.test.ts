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
 * Guards the console's side of the BFF autoscaling contract. The PUT replaces the whole setting
 * and the BFF rejects unknown fields, so the body must be exactly what the page chose: a stray
 * field fails the write, and a missing bound on enable is a 400.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// The API module graph evaluates the build-time __PRODUCT__ at module scope, and
// nothing substitutes it under vitest.
vi.hoisted(() => {
  (globalThis as unknown as { __PRODUCT__: string }).__PRODUCT__ = 'cloud';
});

const { get, put } = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));

vi.mock('./_client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./_client')>()),
  bff: { get, post: vi.fn(), put, patch: vi.fn(), delete: vi.fn() },
}));

import { BffError } from './_client';
import { getAutoscaling, updateAutoscaling } from './scaling';

const PATH = '/components/order%20api/environments/development/autoscaling';

beforeEach(() => {
  get.mockReset();
  put.mockReset();
});

describe('getAutoscaling', () => {
  it('maps a configured, running autoscaler', async () => {
    get.mockResolvedValue({
      environment: 'development',
      supported: true,
      effective: true,
      memoryEffective: true,
      enabled: true,
      minReplicas: 2,
      maxReplicas: 4,
      cpuUtilizationPercentage: 50,
      memoryUtilizationPercentage: 85,
      maxReplicasLimit: 5,
      status: {
        currentReplicas: 3,
        desiredReplicas: 4,
        currentCpuUtilizationPercentage: 91,
        currentMemoryUtilizationPercentage: 62,
        conditions: [{ type: 'ScalingLimited', status: 'False' }],
      },
    });

    const got = await getAutoscaling('org', 'proj', 'order api', 'development');

    expect(get).toHaveBeenCalledWith(PATH);
    expect(got).toEqual({
      environmentId: 'development',
      supported: true,
      effective: true,
      memoryEffective: true,
      enabled: true,
      minReplicas: 2,
      maxReplicas: 4,
      cpuUtilizationPercentage: 50,
      memoryUtilizationPercentage: 85,
      maxReplicasLimit: 5,
      status: {
        currentReplicas: 3,
        desiredReplicas: 4,
        currentCpuUtilizationPercentage: 91,
        currentMemoryUtilizationPercentage: 62,
        conditions: [{ type: 'ScalingLimited', status: 'False', reason: '', message: '' }],
      },
      syncStatus: undefined,
      syncMessage: undefined,
    });
  });

  it('leaves bounds and status unset before autoscaling is first configured', async () => {
    get.mockResolvedValue({ environment: 'development', supported: true, effective: false, memoryEffective: false, enabled: false, maxReplicasLimit: 5 });

    const got = await getAutoscaling('org', 'proj', 'order api', 'development');

    expect(got.enabled).toBe(false);
    expect(got.effective).toBe(false);
    expect(got.minReplicas).toBeUndefined();
    expect(got.maxReplicas).toBeUndefined();
    expect(got.cpuUtilizationPercentage).toBeUndefined();
    expect(got.memoryUtilizationPercentage).toBeUndefined();
    expect(got.memoryEffective).toBe(false);
    expect(got.status).toBeUndefined();
  });

  it('carries a render failure through for the page to show', async () => {
    get.mockResolvedValue({ environment: 'development', supported: true, effective: true, memoryEffective: true, enabled: true, maxReplicasLimit: 5, syncStatus: 'RenderingFailed', syncMessage: 'minReplicas must not exceed maxReplicas' });

    const got = await getAutoscaling('org', 'proj', 'order api', 'development');

    expect(got.syncStatus).toBe('RenderingFailed');
    expect(got.syncMessage).toBe('minReplicas must not exceed maxReplicas');
  });
});

describe('updateAutoscaling', () => {
  it('sends a memory target beside the CPU one when set', async () => {
    put.mockResolvedValue({ status: 'ok' });

    await updateAutoscaling('org', 'proj', 'order api', 'development', { enabled: true, minReplicas: 1, maxReplicas: 5, cpuUtilizationPercentage: 80, memoryUtilizationPercentage: 85 });

    expect(put).toHaveBeenCalledWith(PATH, { enabled: true, minReplicas: 1, maxReplicas: 5, cpuUtilizationPercentage: 80, memoryUtilizationPercentage: 85 });
  });

  it('leaves an unset memory target out of the body, which removes a stored one', async () => {
    put.mockResolvedValue({ status: 'ok' });

    await updateAutoscaling('org', 'proj', 'order api', 'development', { enabled: true, minReplicas: 1, maxReplicas: 5, cpuUtilizationPercentage: 80, memoryUtilizationPercentage: undefined });

    expect(Object.keys(put.mock.calls[0][1] as object)).toEqual(['enabled', 'minReplicas', 'maxReplicas', 'cpuUtilizationPercentage']);
  });

  it('sends every bound when enabling', async () => {
    put.mockResolvedValue({ status: 'ok' });

    await updateAutoscaling('org', 'proj', 'order api', 'development', { enabled: true, minReplicas: 2, maxReplicas: 4, cpuUtilizationPercentage: 50 });

    expect(put).toHaveBeenCalledWith(PATH, { enabled: true, minReplicas: 2, maxReplicas: 4, cpuUtilizationPercentage: 50 });
  });

  it('sends enabled alone when disabling', async () => {
    put.mockResolvedValue({ status: 'ok' });

    await updateAutoscaling('org', 'proj', 'order api', 'development', { enabled: false });

    expect(put).toHaveBeenCalledWith(PATH, { enabled: false });
  });

  it("surfaces the BFF's redeploy message when the release predates autoscaling", async () => {
    const message = 'the release deployed to development was built before deployment/integration-as-api could autoscale; deploy the component to it again first';
    put.mockRejectedValue(new BffError(409, JSON.stringify({ message })));

    await expect(updateAutoscaling('org', 'proj', 'order api', 'development', { enabled: true, minReplicas: 1, maxReplicas: 2, cpuUtilizationPercentage: 50 })).rejects.toThrow(message);
  });
});
