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
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DeployEnvironmentCard from './DeployEnvironmentCard';
import { button, flush, renderWithScopes } from '../../../test/renderWithScopes';
import { DEVELOPER } from '../../../test/roles';
import type { DeployEnvironmentCardProps } from '../../../types/deploy';
import { getComponentTypeFlags } from '../../../utils/componentType';

// The card's own reads, settled on an active deployment.
vi.mock('../../../hooks/useDeployments', () => ({
  useComponentDeployment: () => ({ data: { releaseId: 'release-1', deploymentStatusV2: 'ACTIVE' }, isLoading: false, isFetching: false }),
  useDeploymentStatus: () => ({ data: [] }),
  useDeploymentTrackImages: () => ({ data: [] }),
  useEnvEndpoints: () => ({ data: [], isLoading: false }),
  useRedeployDeployment: () => ({ mutate: vi.fn(), isPending: false }),
  useStopDeployment: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('../../../hooks/useExecutions', () => ({ useExecutionConfigs: () => ({ data: undefined }) }));
vi.mock('../../../hooks/useConfiguration', () => ({ useGetConfigMgt: () => ({}), useSchemaConfig: () => ({ data: undefined }) }));
vi.mock('../../../hooks/useMiConfig', () => ({ useMiConfig: () => ({ data: undefined }) }));
vi.mock('../../../hooks/useWorkflowRuntime', () => ({ useWorkflowRuntime: () => ({ data: { status: 'READY' } }) }));
vi.mock('../../../hooks/useUserVisibleEndpoints', () => ({ useUserVisibleEndpoints: () => [] }));
vi.mock('../../Overview/_shared/configStatus', () => ({ useMissingConfigsReason: () => undefined }));

// The card's parts, whose own behaviour is tested beside them.
vi.mock('./DeployEnvironmentCardHeader', () => ({ default: () => null }));
vi.mock('./DeployEnvironmentCardBody', () => ({ default: () => null }));
vi.mock('./DeploymentHistoryDrawer', () => ({ default: () => null }));
vi.mock('./EndpointsDrawer', () => ({ default: () => null }));
vi.mock('./WorkflowRuntimeRow', () => ({ default: () => null }));
vi.mock('../../EnvironmentCard/ConfigureDrawer', () => ({ default: () => null }));
vi.mock('../../EnvironmentCard/PromoteButton', () => ({ default: () => null }));
vi.mock('../../EnvironmentCard/ReleaseLinks', () => ({ ReleaseLinks: () => null }));
vi.mock('../../Overview/_shared/ScheduleDialog', () => ({ default: () => null }));
// The switch reports a publish through the card, as it does on the Overview card.
vi.mock('../../UserPortal/UserPortalAction', () => ({
  default: ({ envName, onNotify }: { envName: string; onNotify: (notification: { text: string; severity: 'success'; detail?: string }) => void }) => (
    <button onClick={() => onNotify({ text: `Published to the User Portal in ${envName}.`, severity: 'success', detail: 'The User Portal can’t hold this scope.' })}>User Portal switch</button>
  ),
}));

let unmount = () => {};
afterEach(() => unmount());

async function card(publishesToUserPortal: boolean) {
  const props: DeployEnvironmentCardProps = {
    orgHandler: 'acme',
    orgUuid: 'org-uuid',
    projectId: 'shop',
    componentId: 'orders',
    versionId: 'track-1',
    deploymentPipelineId: 'default',
    flags: getComponentTypeFlags('ballerinaService'),
    publishesToUserPortal,
    env: { id: 'production', name: 'Production', critical: true },
    branch: 'main',
    componentName: 'orders',
    projectHandler: 'shop',
  };
  const r = await renderWithScopes(
    <MemoryRouter>
      <DeployEnvironmentCard {...props} />
    </MemoryRouter>,
    DEVELOPER,
  );
  unmount = r.unmount;
  await flush();
  return r.container;
}

describe("the Deploy card's User Portal switch", () => {
  it('shows what the switch reports on the card, as the Overview card does', async () => {
    const container = await card(true);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    await act(async () => button(container, 'User Portal switch')?.click());
    const notice = container.querySelector('[role="alert"]');
    expect(notice?.textContent).toContain('Published to the User Portal in Production.');
    expect(notice?.textContent).toContain('The User Portal can’t hold this scope.');
  });

  it('has no switch for a type the User Portal does not show', async () => {
    const container = await card(false);
    expect(button(container, 'User Portal switch')).toBeUndefined();
  });
});
