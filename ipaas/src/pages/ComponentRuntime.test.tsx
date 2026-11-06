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
import { MemoryRouter } from 'react-router';
import ComponentRuntime from './ComponentRuntime';
import { POD_ACTION_LABELS } from '../constants/runtime';
import { button, renderWithScopes } from '../test/renderWithScopes';
import { DEVELOPER, VIEWER } from '../test/roles';

const environments = { current: [] as { id: string; name: string; critical: boolean }[] };
const pod = { metadata: { name: 'orders-1', uid: 'u1' }, spec: { containers: [] }, status: { phase: 'Running' } };
const query = (data: unknown) => ({ data, isLoading: false, isError: false, isFetching: false, refetch: vi.fn() });
vi.mock('../hooks/useOrgUuid', () => ({ useOrgUuid: () => 'acme' }));
vi.mock('../hooks/useProjects', () => ({ useProjectId: () => ({ projectId: 'default', isLoading: false }) }));
vi.mock('../hooks/useComponents', () => ({ useComponentByHandler: () => ({ data: { id: 'orders', name: 'orders', deploymentTracks: [{ id: 'v1', latest: true }] }, isLoading: false }) }));
vi.mock('../hooks/useEnvironments', () => ({ useEnvironments: () => ({ data: environments.current, isLoading: false, isError: false }) }));
vi.mock('../hooks/useDeployments', () => ({ useComponentDeployment: () => ({ data: { releaseId: 'r1', deploymentStatusV2: 'ACTIVE' } }) }));
vi.mock('../hooks/useRuntime', () => ({
  useReleaseDetails: () => ({ data: { ID: 'r1', componentId: 'orders' } }),
  useComponentPods: () => query([pod]),
  useComponentPodMetrics: () => query(undefined),
  useRedeployRelease: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('../components/DeploymentTrackBar', () => ({ default: () => null }));
vi.mock('../components/Runtime/PodLogsDrawer', () => ({ default: () => null }));
vi.mock('../components/Runtime/PodEventsDrawer', () => ({ default: () => null }));

let unmount = () => {};
afterEach(() => unmount());

async function runtime(env: { id: string; name: string; critical: boolean }, scopes: string[]) {
  environments.current = [env];
  const r = await renderWithScopes(
    <MemoryRouter>
      <ComponentRuntime level="components" org="acme" project="default" component="orders" />
    </MemoryRouter>,
    scopes,
  );
  unmount = r.unmount;
  return r.container;
}

const production = { id: 'production', name: 'Production', critical: true };
const byName = { development: { id: 'development', name: 'Development', critical: false }, production };

describe('Runtime', () => {
  it.each([
    ['Developer', 'development', DEVELOPER],
    ['Developer', 'production', DEVELOPER],
    ['Viewer', 'development', VIEWER],
    ['Viewer', 'production', VIEWER],
  ] as const)("lets a %s read a pod's logs in %s", async (_role, env, scopes) => {
    expect(button(await runtime(byName[env], scopes), POD_ACTION_LABELS.logs)?.disabled).toBe(false);
  });

  it('lets a Developer redeploy a production release, and not a Viewer', async () => {
    expect(button(await runtime(production, DEVELOPER), 'Redeploy release')?.disabled).toBe(false);
    unmount();
    expect(button(await runtime(production, VIEWER), 'Redeploy release')?.disabled).toBe(true);
  });
});
