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

import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDeployPrebuiltIntegration } from './useDeployPrebuiltIntegration';
import { savePrebuiltConfig } from '../api/prebuilt';
import { Scopes } from '../constants/permissions';
import { renderWithScopes } from '../test/renderWithScopes';
import type { PrebuiltIntegration } from '../types/prebuilt';
import type { SchemaConfigItem } from '../types/configuration';

const deployImage = vi.fn();
vi.mock('../api/prebuilt', () => ({
  checkNameAvailability: () => Promise.resolve('orders'),
  fetchComponentDetail: () => Promise.resolve({ id: 'orders', handler: 'orders', deploymentTracks: [{ id: 'main' }] }),
  fetchFirstEnvironment: () => Promise.resolve({ id: 'development', templateId: 'development' }),
  fetchLatestCommitSha: () => Promise.resolve(''),
  savePrebuiltConfig: vi.fn(),
}));
vi.mock('../utils/prebuilt', () => ({ derivePrebuiltSlug: () => 'orders' }));
vi.mock('./useComponents', () => ({
  useCreateComponent: () => ({ mutateAsync: () => Promise.resolve({ id: 'orders', handler: 'orders' }), reset: () => {} }),
  useDeleteComponent: () => ({ mutateAsync: vi.fn(), reset: () => {} }),
}));
vi.mock('./useDeployments', () => ({ useDeployPrebuiltImage: () => ({ mutateAsync: deployImage, reset: () => {} }) }));

const configValues: SchemaConfigItem[] = [{ key: 'url', values: [{ environmentUuid: '', value: 'https://x' }] }];
const integration = { displayName: 'Orders', imageUrl: 'registry/orders:1', componentType: 'service', buildPack: 'ballerina' } as PrebuiltIntegration;

let run: () => Promise<void> = async () => {};
function Deploy() {
  const { deploy } = useDeployPrebuiltIntegration();
  run = () => deploy({ integration, orgHandler: 'acme', projectId: 'default', configValues });
  return null;
}

let unmount = () => {};
afterEach(() => unmount());
beforeEach(() => {
  vi.mocked(savePrebuiltConfig).mockReset();
  deployImage.mockReset().mockResolvedValue({});
});

async function deployAs(scopes: string[]) {
  const r = await renderWithScopes(<Deploy />, scopes);
  unmount = r.unmount;
  await act(() => run());
}

describe('useDeployPrebuiltIntegration', () => {
  it('sends a Developer’s configuration only inside deploy-prebuilt', async () => {
    await deployAs([Scopes.INTEGRATION_CREATE, Scopes.INTEGRATION_DEPLOY]);
    expect(savePrebuiltConfig).not.toHaveBeenCalled();
    expect(deployImage).toHaveBeenCalledWith(expect.objectContaining({ configurations: configValues }));
  });

  it('also saves the configuration for a role with config-manage', async () => {
    await deployAs([Scopes.INTEGRATION_CREATE, Scopes.INTEGRATION_DEPLOY, Scopes.CONFIG_MANAGE]);
    expect(savePrebuiltConfig).toHaveBeenCalled();
    expect(deployImage).toHaveBeenCalledWith(expect.objectContaining({ configurations: configValues }));
  });
});
