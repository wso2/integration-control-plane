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

import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import OrgOverview from './OrgOverview';
import { button, flush, reasonFor, renderWithScopes } from '../test/renderWithScopes';
import { DEVELOPER, PLATFORM_ENGINEER } from '../test/roles';

vi.mock('../auth', () => ({ useAuth: () => ({ displayName: 'Dee', username: 'dee' }) }));
vi.mock('../hooks/useDatabases', () => ({ useDatabaseAvailability: () => ({ data: { available: true } }) }));
vi.mock('../hooks/useProjects', () => ({ useProjects: () => ({ data: [], isLoading: false }) }));
vi.mock('../hooks/useComponents', () => ({ useOrgComponents: () => ({ byProject: new Map() }) }));
vi.mock('../hooks/useAppNavigate', () => ({ useAppNavigate: () => vi.fn() }));
vi.mock('../components/ExploreMore', () => ({ default: () => null }));
vi.mock('../components/Authorized', () => ({ default: () => null }));

let unmount = () => {};
afterEach(() => unmount());

async function createDatabase(scopes: string[]) {
  const r = await renderWithScopes(
    <MemoryRouter>
      <OrgOverview level="organizations" org="acme" />
    </MemoryRouter>,
    scopes,
  );
  unmount = r.unmount;
  await flush();
  return button(r.container, 'Create a database');
}

describe('Create a database on the org overview', () => {
  it('needs cloud:resource-type:manage, and says so to a Developer', async () => {
    const b = await createDatabase(DEVELOPER);
    expect(b?.disabled).toBe(true);
    expect(reasonFor(b)).toBe('You do not have permission to create databases.');
  });

  it('is offered to a Platform Engineer', async () => {
    expect((await createDatabase(PLATFORM_ENGINEER))?.disabled).toBe(false);
  });
});
