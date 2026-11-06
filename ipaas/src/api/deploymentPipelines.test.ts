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

const put = vi.fn();
const get = vi.fn();
vi.mock('./_client', () => ({ bff: { put: (...args: unknown[]) => put(...args), get: (...args: unknown[]) => get(...args) }, items: (r: { items?: unknown[] } | null) => r?.items ?? [], seg: (s: string) => s }));

import { appendEnvironmentToDefaultPipeline, updateDeploymentPipeline } from './deploymentPipelines';
import type { PromotionTreeNode } from '../types/deploymentPipeline';

const env = (id: string, children?: PromotionTreeNode[]): PromotionTreeNode => ({ env_template_id: id, env_name: id, ...(children ? { children } : {}) });
const sentPaths = () => put.mock.calls[0][1].promotionPaths;

describe('updateDeploymentPipeline promotion paths', () => {
  beforeEach(() => {
    put.mockReset();
    put.mockResolvedValue({ name: 'default', displayName: 'Default Pipeline' });
  });

  // A single-environment pipeline still has to name that environment.
  it('keeps a single environment as a path with no targets', async () => {
    await updateDeploymentPipeline('org', 'default', { name: 'Default Pipeline', promotion_tree: { name: 'Root', children: [env('development')] } });
    expect(sentPaths()).toEqual([{ sourceEnvironment: 'development', targetEnvironments: [] }]);
  });

  it('emits one path per environment with successors, and none for later leaves', async () => {
    await updateDeploymentPipeline('org', 'default', { name: 'Default Pipeline', promotion_tree: { name: 'Root', children: [env('development', [env('staging', [env('production')])])] } });
    expect(sentPaths()).toEqual([
      { sourceEnvironment: 'development', targetEnvironments: ['staging'] },
      { sourceEnvironment: 'staging', targetEnvironments: ['production'] },
    ]);
  });
});

describe('appendEnvironmentToDefaultPipeline', () => {
  type Path = { sourceEnvironment: string; targetEnvironments: string[] };
  const withDefault = (promotionPaths: Path[]) => get.mockResolvedValue({ items: [{ name: 'default', displayName: 'Default Pipeline', promotionPaths }] });

  beforeEach(() => {
    put.mockReset();
    get.mockReset();
  });

  // The shape a new org starts with, and what the editor saves for one environment.
  it('fills in an empty last path when it is the only one', async () => {
    withDefault([{ sourceEnvironment: 'development', targetEnvironments: [] }]);
    expect(await appendEnvironmentToDefaultPipeline('staging')).toBe(true);
    expect(sentPaths()).toEqual([{ sourceEnvironment: 'development', targetEnvironments: ['staging'] }]);
  });

  it('fills in an empty last path at the end of a longer chain', async () => {
    withDefault([
      { sourceEnvironment: 'development', targetEnvironments: ['staging'] },
      { sourceEnvironment: 'staging', targetEnvironments: [] },
    ]);
    expect(await appendEnvironmentToDefaultPipeline('production')).toBe(true);
    expect(sentPaths()).toEqual([
      { sourceEnvironment: 'development', targetEnvironments: ['staging'] },
      { sourceEnvironment: 'staging', targetEnvironments: ['production'] },
    ]);
  });

  it('appends after the end of a linear chain', async () => {
    withDefault([{ sourceEnvironment: 'development', targetEnvironments: ['staging'] }]);
    expect(await appendEnvironmentToDefaultPipeline('production')).toBe(true);
    expect(sentPaths()).toEqual([
      { sourceEnvironment: 'development', targetEnvironments: ['staging'] },
      { sourceEnvironment: 'staging', targetEnvironments: ['production'] },
    ]);
  });

  it('leaves a branching chain alone', async () => {
    withDefault([{ sourceEnvironment: 'development', targetEnvironments: ['staging', 'qa'] }]);
    expect(await appendEnvironmentToDefaultPipeline('production')).toBe(false);
    expect(put).not.toHaveBeenCalled();
  });

  it('leaves a pipeline with no paths alone', async () => {
    withDefault([]);
    expect(await appendEnvironmentToDefaultPipeline('staging')).toBe(false);
    expect(put).not.toHaveBeenCalled();
  });

  // Each append rereads the pipeline after the previous write, so neither environment is lost.
  it('runs overlapping appends one after the other', async () => {
    let stored: Path[] = [{ sourceEnvironment: 'development', targetEnvironments: [] }];
    get.mockImplementation(async () => ({ items: [{ name: 'default', promotionPaths: stored }] }));
    put.mockImplementation(async (_url: string, body: { promotionPaths: Path[] }) => {
      await new Promise((r) => setTimeout(r, 5));
      stored = body.promotionPaths;
      return {};
    });
    expect(await Promise.all([appendEnvironmentToDefaultPipeline('staging'), appendEnvironmentToDefaultPipeline('production')])).toEqual([true, true]);
    expect(stored).toEqual([
      { sourceEnvironment: 'development', targetEnvironments: ['staging'] },
      { sourceEnvironment: 'staging', targetEnvironments: ['production'] },
    ]);
  });

  it('keeps appending after an earlier append fails', async () => {
    get.mockRejectedValueOnce(new Error('unavailable'));
    await expect(appendEnvironmentToDefaultPipeline('staging')).rejects.toThrow('unavailable');
    withDefault([{ sourceEnvironment: 'development', targetEnvironments: [] }]);
    expect(await appendEnvironmentToDefaultPipeline('staging')).toBe(true);
  });

  it('does nothing for an environment already in the chain', async () => {
    withDefault([{ sourceEnvironment: 'development', targetEnvironments: ['staging'] }]);
    expect(await appendEnvironmentToDefaultPipeline('staging')).toBe(false);
    expect(put).not.toHaveBeenCalled();
  });
});
