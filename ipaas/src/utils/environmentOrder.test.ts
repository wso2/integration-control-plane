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

import { describe, expect, it } from 'vitest';
import { orderEnvironmentsByPipeline, pipelineEnvOrder, restrictEnvironmentsToPipeline } from './environmentOrder';
import type { PromotionTreeNode } from '../types/deploymentPipeline';

const chain = (...envs: string[]): PromotionTreeNode => {
  const build = (index: number): PromotionTreeNode[] => (index >= envs.length ? [] : [{ env_template_id: envs[index], env_name: envs[index], children: build(index + 1) }]);
  return { name: 'Root', children: build(0) };
};

const envs = (...ids: string[]) => ids.map((id) => ({ id }));

describe('pipelineEnvOrder', () => {
  it('returns the chain in promotion order', () => {
    expect(pipelineEnvOrder(chain('dev', 'staging', 'prod'))).toEqual(['dev', 'staging', 'prod']);
  });

  it('returns nothing for a missing or empty tree', () => {
    expect(pipelineEnvOrder(undefined)).toEqual([]);
    expect(pipelineEnvOrder({ name: 'Root' })).toEqual([]);
  });

  it('ranks a rejoining branch by its first appearance', () => {
    const tree: PromotionTreeNode = {
      name: 'Root',
      children: [
        {
          env_template_id: 'dev',
          children: [
            { env_template_id: 'staging', children: [{ env_template_id: 'prod' }] },
            { env_template_id: 'prod' },
          ],
        },
      ],
    };
    expect(pipelineEnvOrder(tree)).toEqual(['dev', 'staging', 'prod']);
  });

  it('falls back to env_name when the template id is absent', () => {
    expect(pipelineEnvOrder({ name: 'Root', children: [{ env_name: 'dev' }] })).toEqual(['dev']);
  });
});

describe('orderEnvironmentsByPipeline', () => {
  it('sorts environments along the promotion chain', () => {
    expect(orderEnvironmentsByPipeline(envs('prod', 'dev', 'staging'), chain('dev', 'staging', 'prod'))).toEqual(envs('dev', 'staging', 'prod'));
  });

  it('leaves the list untouched when the pipeline has no chain', () => {
    const list = envs('b', 'a');
    expect(orderEnvironmentsByPipeline(list, undefined)).toEqual(list);
  });

  it('puts environments outside the chain last, in their original order', () => {
    expect(orderEnvironmentsByPipeline(envs('orphan-b', 'prod', 'orphan-a', 'dev'), chain('dev', 'prod'))).toEqual(envs('dev', 'prod', 'orphan-b', 'orphan-a'));
  });

  it('does not mutate the input', () => {
    const list = envs('prod', 'dev');
    orderEnvironmentsByPipeline(list, chain('dev', 'prod'));
    expect(list).toEqual(envs('prod', 'dev'));
  });
});

describe('restrictEnvironmentsToPipeline', () => {
  it('drops environments the project\'s pipeline does not promote through', () => {
    expect(restrictEnvironmentsToPipeline(envs('dev', 'other-team-env', 'prod'), chain('dev', 'prod'))).toEqual(envs('dev', 'prod'));
  });

  it('returns the chain in promotion order', () => {
    expect(restrictEnvironmentsToPipeline(envs('prod', 'dev', 'staging'), chain('dev', 'staging', 'prod'))).toEqual(envs('dev', 'staging', 'prod'));
  });

  it('restricts nothing when the pipeline could not be resolved', () => {
    const list = envs('dev', 'prod');
    expect(restrictEnvironmentsToPipeline(list, undefined)).toEqual(list);
    expect(restrictEnvironmentsToPipeline(list, { name: 'Root' })).toEqual(list);
  });

  it('ignores chain entries with no matching environment', () => {
    expect(restrictEnvironmentsToPipeline(envs('dev'), chain('dev', 'deleted-env'))).toEqual(envs('dev'));
  });
});
