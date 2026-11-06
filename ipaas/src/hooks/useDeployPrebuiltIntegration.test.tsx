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
import { BffError } from '../api/_client';
import { deleteComponent } from '../api/components';
import { savePrebuiltConfig } from '../api/prebuilt';
import PermissionDeniedNotice from '../components/PermissionDeniedNotice';
import { Scopes } from '../constants/permissions';
import { renderWithScopes } from '../test/renderWithScopes';
import { DEVELOPER, PLATFORM_ENGINEER } from '../test/roles';
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
vi.mock('../api/components', async (importOriginal) => ({ ...(await importOriginal<typeof import('../api/components')>()), deleteComponent: vi.fn() }));
vi.mock('./useComponents', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./useComponents')>()),
  useCreateComponent: () => ({ mutateAsync: () => Promise.resolve({ id: 'orders', handler: 'orders' }), reset: () => {} }),
}));
vi.mock('./useDeployments', () => ({ useDeployPrebuiltImage: () => ({ mutateAsync: deployImage, reset: () => {} }) }));

const configValues: SchemaConfigItem[] = [{ key: 'url', values: [{ environmentUuid: '', value: 'https://x' }] }];
const integration = { displayName: 'Orders', imageUrl: 'registry/orders:1', componentType: 'service', buildPack: 'ballerina' } as PrebuiltIntegration;

let run: () => Promise<unknown> = async () => {};
function Deploy() {
  const { deploy, error } = useDeployPrebuiltIntegration();
  run = () => deploy({ integration, orgHandler: 'acme', projectId: 'default', configValues });
  return (
    <>
      <output>{error}</output>
      <PermissionDeniedNotice />
    </>
  );
}

let unmount = () => {};
afterEach(() => unmount());
beforeEach(() => {
  vi.mocked(savePrebuiltConfig).mockReset();
  deployImage.mockReset().mockResolvedValue({});
  vi.mocked(deleteComponent)
    .mockReset()
    .mockRejectedValue(new BffError(403, JSON.stringify({ message: 'insufficient permissions: requires ipaas:integration:delete', code: 'INSUFFICIENT_SCOPE', scope: 'ipaas:integration:delete' })));
});

async function deployAs(scopes: string[]) {
  const r = await renderWithScopes(<Deploy />, scopes);
  unmount = r.unmount;
  await act(() => run());
  return r.container;
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

  it('leaves a failed deploy to an Admin when the role may not delete integrations, with only the deploy error', async () => {
    deployImage.mockRejectedValue(new Error('deploy failed'));
    const c = await deployAs(DEVELOPER);
    expect(deleteComponent).not.toHaveBeenCalled();
    expect(c.querySelector('output')?.textContent).toBe('deploy failed');
    expect(document.body.textContent).not.toContain("Your role doesn't allow this");
  });

  it('rolls a failed deploy back for a role that may delete integrations', async () => {
    deployImage.mockRejectedValue(new Error('deploy failed'));
    vi.mocked(deleteComponent).mockResolvedValue({ status: 'success', canDelete: true, message: '' } as never);
    await deployAs(PLATFORM_ENGINEER);
    expect(deleteComponent).toHaveBeenCalledWith({ orgHandler: 'acme', componentId: 'orders', projectId: 'default' });
  });
});
