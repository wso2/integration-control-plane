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

const images = [{ name: 'Code Server' }];
vi.mock('../../../hooks/useRepository', () => ({ useChoreoSampleImages: () => ({ data: images }) }));
vi.mock('../../../hooks/useComponents', () => ({ useUpdateComponent: () => ({ mutate: vi.fn(), isPending: false }) }));
vi.mock('../../../hooks/useOrgUuid', () => ({ useOrgUuid: () => 'acme' }));
vi.mock('../../../auth', () => ({ useAuth: () => ({ userId: 'u1' }) }));
vi.mock('./SetupInstructionsButton', () => ({ default: () => null }));

const component = { id: 'orders', handler: 'orders', displayName: 'Orders', displayType: 'ballerinaService' } as ComponentDetail;
let unmount = () => {};
afterEach(() => unmount());

async function openInCloudEditor(scopes: string[]) {
  const r = await renderWithScopes(<HeaderShell component={component} repository={null} latestCommit={null} orgHandler="acme" projectId="default" />, scopes);
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
});
