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
import Authorized from './Authorized';
import DeleteIntegrationButton from './DeleteIntegrationButton';
import { Scopes } from '../constants/permissions';
import { button, renderWithScopes } from '../test/renderWithScopes';
import { DEVELOPER, PLATFORM_ENGINEER } from '../test/roles';
import type { Component } from '../types/component';

vi.mock('../nav', async (importOriginal) => ({ ...(await importOriginal<typeof import('../nav')>()), useScope: () => ({ level: 'projects', org: 'acme', project: 'default' }) }));
vi.mock('../hooks/useProjects', () => ({ useProjectByHandler: () => ({ data: { id: 'default' } }), useProject: () => ({ data: undefined }), useProjects: () => ({ data: [] }) }));
vi.mock('../hooks/useComponents', () => ({ useComponents: () => ({ data: [] }) }));

const orders = { id: 'orders', displayName: 'Orders', displayType: 'ballerinaService' } as Component;
let unmount = () => {};
afterEach(() => unmount());

/** The project page's row Delete, gated as `Project.tsx` gates it. */
async function rowDelete(scopes: string[]) {
  const r = await renderWithScopes(
    <Authorized permissions={Scopes.INTEGRATION_DELETE}>
      <DeleteIntegrationButton component={orders} onClick={() => {}} />
    </Authorized>,
    scopes,
  );
  unmount = r.unmount;
  return button(r.container, 'Delete Orders');
}

describe("the project page's integration Delete", () => {
  it('is not offered to a Developer, who may not delete integrations', async () => {
    expect(await rowDelete(DEVELOPER)).toBeUndefined();
  });

  it('is offered to a Platform Engineer', async () => {
    expect((await rowDelete(PLATFORM_ENGINEER))?.disabled).toBe(false);
  });
});
