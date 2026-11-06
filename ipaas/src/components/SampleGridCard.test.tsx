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

import { afterEach, describe, expect, it } from 'vitest';
import SampleGridCard from './SampleGridCard';
import { button, reasonFor, renderWithScopes } from '../test/renderWithScopes';
import { DEVELOPER } from '../test/roles';
import type { Sample } from '../types/samples';

const sample = { displayName: 'Orders', description: '', componentType: 'service', buildPack: 'ballerina', repositoryUrl: '', subDirectory: '', componentPath: '', tags: [] } as unknown as Sample;
let unmount = () => {};
afterEach(() => unmount());

async function quickDeploy(scopes: string[]) {
  const r = await renderWithScopes(<SampleGridCard sample={sample} onDeploy={() => {}} isDeploying={false} />, scopes);
  unmount = r.unmount;
  return button(r.container, 'Quick deploy');
}

describe('SampleGridCard', () => {
  it('refuses a Viewer to deploy a sample, with the reason', async () => {
    const b = await quickDeploy([]);
    expect(b?.disabled).toBe(true);
    expect(reasonFor(b)).toBe('You do not have permission to create integrations.');
  });

  it('lets a Developer deploy a sample', async () => {
    expect((await quickDeploy(DEVELOPER))?.disabled).toBe(false);
  });
});
