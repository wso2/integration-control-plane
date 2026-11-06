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
import type { PromotionTreeNode } from '../types/deploymentPipeline';
import { entryEnvironmentIds, isEntryEnvironment } from './entryEnvironment';

const tree = { env_name: 'Root', children: [{ env_name: 'development', children: [{ env_name: 'production', children: [] }] }] } as unknown as PromotionTreeNode;

describe('entry environment', () => {
  it('is the root of the deployment pipeline', () => {
    expect(entryEnvironmentIds(tree)).toEqual(['development']);
    expect(isEntryEnvironment(tree, 'development')).toBe(true);
    expect(isEntryEnvironment(tree, 'production')).toBe(false);
  });

  it('accepts every environment directly under the root', () => {
    const twoEntries = {
      env_name: 'Root',
      children: [
        { env_name: 'dev-a', children: [{ env_name: 'production' }] },
        { env_template_id: 'dev-b', env_name: 'Dev B' },
      ],
    } as unknown as PromotionTreeNode;
    expect(entryEnvironmentIds(twoEntries)).toEqual(['dev-a', 'dev-b']);
    expect(isEntryEnvironment(twoEntries, 'dev-b')).toBe(true);
    expect(isEntryEnvironment(twoEntries, 'production')).toBe(false);
  });

  it('allows nothing while the pipeline is loading', () => {
    expect(isEntryEnvironment(undefined, 'development')).toBe(false);
    expect(isEntryEnvironment(tree, '')).toBe(false);
  });

  it('leaves the decision to the BFF when there is no pipeline to read', () => {
    expect(isEntryEnvironment(null, 'production')).toBe(true);
  });
});
