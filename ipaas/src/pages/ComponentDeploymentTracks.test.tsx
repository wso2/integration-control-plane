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
import ComponentDeploymentTracks from './ComponentDeploymentTracks';
import { visibleComponentSettingsSections } from '../constants/componentSettingsSections';
import { button, renderWithScopes } from '../test/renderWithScopes';
import { DEVELOPER, PLATFORM_ENGINEER, VIEWER } from '../test/roles';
import { identifyIntegration } from '../utils/identifyIntegration';

const tracks = [
  { id: 'main-aaaaaa', branch: 'main', latest: true },
  { id: 'next-bbbbbb', branch: 'next' },
];
vi.mock('../hooks/useProjects', () => ({ useProjectId: () => ({ projectId: 'default', isLoading: false }) }));
vi.mock('../hooks/useComponents', () => ({
  useComponentByHandler: () => ({ data: { id: 'orders', deploymentTracksEnabled: true, deploymentTracks: tracks }, isPending: false, isError: false }),
  useCreateDeploymentTrack: () => ({}),
  useUpdateDeploymentTrack: () => ({}),
  useCheckDeploymentTrackDeletable: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteDeploymentTrack: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('../hooks/useEnvironments', () => ({ useEnvironments: () => ({ data: [] }) }));
vi.mock('../hooks/useOrgUuid', () => ({ useOrgUuid: () => 'acme' }));
vi.mock('../hooks/useRepository', () => ({ useComponentRepository: () => ({ data: null }), useRepoBranches: () => ({ data: [], isLoading: false }) }));
vi.mock('../components/Settings/ComponentSettingsTabs', () => ({ default: () => null }));

let unmount = () => {};
afterEach(() => unmount());

async function page(scopes: string[]) {
  const r = await renderWithScopes(<ComponentDeploymentTracks level="components" org="acme" project="default" component="orders" />, scopes);
  unmount = r.unmount;
  return r.container;
}

const controls = ['Create deployment track', 'Edit next', 'Delete next'];
const tab = (scopes: string[]) => visibleComponentSettingsSections(identifyIntegration('ballerinaService', null), (perms) => perms.some((p) => scopes.includes(p))).map((s) => s.label);

describe('Deployment Tracks', () => {
  it('lists the tracks to a Viewer, with nothing to change', async () => {
    expect(tab(VIEWER)).toContain('Deployment tracks');
    const c = await page(VIEWER);
    expect(c.textContent).toContain('next');
    for (const name of controls) expect(button(c, name)).toBeUndefined();
  });

  it('lets a Platform Engineer create, edit and delete a track', async () => {
    const c = await page(PLATFORM_ENGINEER);
    for (const name of controls) expect(button(c, name)?.disabled).toBe(false);
  });

  it('lets a Developer, who may update but not delete integrations, create and edit a track, not delete it', async () => {
    expect(tab(DEVELOPER)).toContain('Deployment tracks');
    const c = await page(DEVELOPER);
    expect(button(c, 'Create deployment track')?.disabled).toBe(false);
    expect(button(c, 'Edit next')?.disabled).toBe(false);
    expect(button(c, 'Delete next')).toBeUndefined();
  });
});
