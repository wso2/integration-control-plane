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

import { afterEach, describe, expect, it, vi } from 'vitest';
import HeaderShell from './HeaderShell';
import { button, renderWithScopes } from '../../../test/renderWithScopes';
import { DEVELOPER, VIEWER } from '../../../test/roles';
import type { ComponentDetail } from '../../../types/component';
import type { Repository } from '../../../types/repository';
import type { Sample } from '../../../types/samples';

const images = [{ name: 'Code Server' }];
vi.mock('../../../hooks/useRepository', () => ({ useChoreoSampleImages: () => ({ data: images }) }));
vi.mock('../../../hooks/useComponents', () => ({ useUpdateComponent: () => ({ mutate: vi.fn(), isPending: false }) }));
vi.mock('../../../hooks/useOrgUuid', () => ({ useOrgUuid: () => 'acme' }));
vi.mock('../../../auth', () => ({ useAuth: () => ({ userId: 'u1' }) }));
vi.mock('./SetupInstructionsButton', () => ({ default: () => null }));

const helloWorld = { repositoryUrl: 'https://github.com/wso2/integration-samples/', componentPath: '/integrator-default-profile/samples/hello-world-service' } as Sample;
let samplesQuery: { data?: { samples: Sample[] }; isPending: boolean } = { data: { samples: [helloWorld] }, isPending: false };
vi.mock('../../../hooks/useSamples', () => ({ useSamples: () => samplesQuery }));

const component = { id: 'orders', handler: 'orders', displayName: 'Orders', displayType: 'ballerinaService' } as ComponentDetail;
const repoAt = (appSubPath: string) => ({ gitProvider: 'github', organizationApp: 'wso2', nameApp: 'integration-samples', branch: 'main', appSubPath }) as Repository;
let unmount = () => {};
afterEach(() => {
  unmount();
  samplesQuery = { data: { samples: [helloWorld] }, isPending: false };
});

async function openInCloudEditor(scopes: string[], repository: Repository | null = null) {
  const r = await renderWithScopes(<HeaderShell component={component} repository={repository} latestCommit={null} orgHandler="acme" projectId="default" environments={[]} versionId="v1" />, scopes);
  unmount = r.unmount;
  return button(r.container, 'Open in Cloud Editor');
}

describe('Open in Cloud Editor', () => {
  it('is hidden from a Viewer, who lacks ipaas:editor:use', async () => {
    expect(await openInCloudEditor(VIEWER)).toBeUndefined();
  });

  it('is enabled for a Developer', async () => {
    expect((await openInCloudEditor(DEVELOPER))?.disabled).toBe(false);
  });

  it('is hidden on an integration created from a sample', async () => {
    expect(await openInCloudEditor(DEVELOPER, repoAt('integrator-default-profile/samples/hello-world-service'))).toBeUndefined();
  });

  it('is shown on a prebuilt integration in the samples repository', async () => {
    expect((await openInCloudEditor(DEVELOPER, repoAt('integrator-default-profile/samples/salesforceops-to-googlesheets')))?.disabled).toBe(false);
  });

  it('waits for the sample catalog', async () => {
    samplesQuery = { isPending: true };
    expect(await openInCloudEditor(DEVELOPER)).toBeUndefined();
  });

  it('is shown when the sample catalog fails to load', async () => {
    samplesQuery = { isPending: false };
    expect((await openInCloudEditor(DEVELOPER))?.disabled).toBe(false);
  });
});
