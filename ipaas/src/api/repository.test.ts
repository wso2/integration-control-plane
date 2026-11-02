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

const put = vi.hoisted(() => vi.fn());
const get = vi.hoisted(() => vi.fn());
const post = vi.hoisted(() => vi.fn());

vi.mock('./_client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./_client')>();
  return { ...actual, bff: { ...actual.bff, get, post, put } };
});

import { BffError } from './_client';
import { connectAzureDevOps, fetchAzureDevOpsBranches, fetchAzureDevOpsMetadata, fetchAzureDevOpsOrganizations, fetchAzureDevOpsProjects, fetchAzureDevOpsRepositories, updateBuildpackConfigs } from './repository';
import type { UpdateBuildpackConfigsInput } from '../types/build';

const baseInput: UpdateBuildpackConfigsInput = {
  componentId: 'demo-svc',
  versionId: '',
  buildContext: '',
  languageVersion: '',
  isUnitTestEnabled: true,
  pullLatestSubmodules: false,
  enableTrivyScan: false,
};

describe('updateBuildpackConfigs', () => {
  beforeEach(() => {
    put.mockReset();
    put.mockResolvedValue({ success: true });
  });

  it('sends the unit test opt-in, the submodule setting and build environment variables without row ids', async () => {
    await updateBuildpackConfigs({
      ...baseInput,
      pullLatestSubmodules: true,
      environmentVariables: [
        { id: 'row-1', key: 'FOO', value: 'bar' },
        { key: 'MI_VERSION', value: '4.4.0' },
      ],
    });

    expect(put).toHaveBeenCalledWith('/components/demo-svc/buildpack-config', {
      isUnitTestEnabled: true,
      pullLatestSubmodules: true,
      environmentVariables: [
        { key: 'FOO', value: 'bar' },
        { key: 'MI_VERSION', value: '4.4.0' },
      ],
    });
  });

  it('sends an empty list so removing every variable clears them', async () => {
    await updateBuildpackConfigs({ ...baseInput, environmentVariables: [] });

    expect(put.mock.calls[0][1]).toEqual({ isUnitTestEnabled: true, pullLatestSubmodules: false, environmentVariables: [] });
  });

  it('leaves the stored variables untouched when none are given', async () => {
    await updateBuildpackConfigs(baseInput);

    const body = put.mock.calls[0][1] as Record<string, unknown>;
    expect(JSON.parse(JSON.stringify(body))).toEqual({ isUnitTestEnabled: true, pullLatestSubmodules: false });
  });
});

describe('Azure DevOps repository API', () => {
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
  });

  it('binds the authorization code with the exact callback URI', async () => {
    post.mockResolvedValue({ items: [{ organization: 'acme' }] });
    await expect(connectAzureDevOps('code', 'https://console.example/ipaas/adoapp')).resolves.toEqual([{ organization: 'acme' }]);
    expect(post).toHaveBeenCalledWith('/git/azuredevops/organizations', { code: 'code', redirectUri: 'https://console.example/ipaas/adoapp' });
  });

  it('uses the cascading organization, project and repository query shapes', async () => {
    get
      .mockResolvedValueOnce({ items: [{ organization: 'acme' }] })
      .mockResolvedValueOnce({ items: [{ id: 'p1', name: 'Payments' }] })
      .mockResolvedValueOnce({ items: [{ name: 'order-sync', project: 'Payments', defaultBranch: 'refs/heads/main' }] });

    await fetchAzureDevOpsOrganizations();
    await fetchAzureDevOpsProjects('acme org');
    await fetchAzureDevOpsRepositories('acme org', 'Payments & Billing');

    expect(get.mock.calls.map((call) => call[0])).toEqual(['/git/azuredevops/organizations', '/git/azuredevops/projects?organization=acme%20org', '/git/azuredevops/repos?organization=acme%20org&project=Payments%20%26%20Billing']);
  });

  it('normalizes refs/heads branch names and marks the repository default', async () => {
    get.mockResolvedValueOnce({ items: [{ name: 'order-sync', defaultBranch: 'refs/heads/main' }] }).mockResolvedValueOnce({ items: ['refs/heads/main', 'feature/demo'] });
    await expect(fetchAzureDevOpsBranches('acme', 'Payments', 'order-sync')).resolves.toEqual([
      { name: 'main', isDefault: true },
      { name: 'feature/demo', isDefault: false },
    ]);
    expect(get.mock.calls[1][0]).toBe('/git/azuredevops/branches?organization=acme&project=Payments&repo=order-sync');
  });

  it('falls back to permissive metadata for non-auth tree failures', async () => {
    get.mockRejectedValueOnce(new BffError(500, 'tree unavailable'));

    await expect(fetchAzureDevOpsMetadata('acme', 'Payments', 'order-sync', 'main', '/')).resolves.toMatchObject({
      isValidRepo: true,
      isSubPathValid: true,
    });
  });

  it('preserves Azure DevOps authentication failures from metadata loading', async () => {
    const authError = new BffError(409, 'azuredevops-auth-required');
    get.mockRejectedValueOnce(authError);

    await expect(fetchAzureDevOpsMetadata('acme', 'Payments', 'order-sync', 'main', '/')).rejects.toBe(authError);
  });
});
