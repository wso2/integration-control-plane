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
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router';
import ApiEnvCardActions from './integration-as-api/EnvCardActions';
import TaskEnvCardActions from './_shared/ScheduledTaskEnvCardActions';
import ConfigureButton from './_shared/ConfigureButton';
import PromoteButton from '../EnvironmentCard/PromoteButton';
import { button, renderWithScopes } from '../../test/renderWithScopes';
import { DEVELOPER, PLATFORM_ENGINEER, VIEWER } from '../../test/roles';
import type { EnvCardActionsProps } from '../../types/integration';

const mutation = { mutate: vi.fn(), isPending: false };
const source = { data: { releaseId: 'r1', build: { buildId: 'b1' } }, isLoading: false };
vi.mock('../../hooks/useDeployments', () => ({
  useStopDeployment: () => mutation,
  useRedeployDeployment: () => mutation,
  usePromote: () => mutation,
  useComponentDeployment: (_o: string, _u: string, _c: string, _v: string, envId: string) => (envId === 'development' ? source : { data: undefined, isLoading: false }),
}));
vi.mock('../../hooks/useExecutions', () => ({ useExecutionConfigs: () => ({ data: undefined }), useTriggerComponent: () => mutation }));
vi.mock('../../hooks/useConfiguration', () => ({ useSchemaConfig: () => ({ data: undefined }), useIntegrationLinks: () => ({ data: undefined, refetch: vi.fn() }) }));
vi.mock('../../hooks/useAppNavigate', () => ({ useAppNavigate: () => vi.fn() }));
vi.mock('../../hooks/useOrgUuid', () => ({ useOrgUuid: () => 'acme' }));
vi.mock('./integration-as-api/ServiceLogsDrawer', () => ({ default: () => null }));
vi.mock('./_shared/ScheduleButton', () => ({ default: () => null }));

const production = { id: 'production', name: 'Production', critical: true };
const slot = (status: string) => ({ component: { id: 'orders' }, env: production, releaseId: 'r1', hasDeployment: true, deploymentStatusV2: status, onNotify: () => {}, requestPoll: () => {}, onTrigger: () => {} }) as unknown as EnvCardActionsProps;
const controls: [string, ReactElement][] = [
  ['Stop', <ApiEnvCardActions {...slot('ACTIVE')} />],
  ['Redeploy', <ApiEnvCardActions {...slot('ERROR')} />],
  ['Promote', <PromoteButton orgHandler="acme" projectId="default" componentId="orders" versionId="v1" deploymentPipelineId="default" sourceEnvId="development" targetEnvId="production" />],
  ['Test', <TaskEnvCardActions {...slot('ACTIVE')} />],
];
let unmount = () => {};
afterEach(() => unmount());

async function render(ui: ReactElement, scopes: string[]) {
  const r = await renderWithScopes(<MemoryRouter>{ui}</MemoryRouter>, scopes);
  unmount = r.unmount;
  return r.container;
}

describe('a production card', () => {
  it.each(controls)('lets a Developer use %s', async (name, ui) => {
    expect(button(await render(ui, DEVELOPER), name)?.disabled).toBe(false);
  });

  it.each(controls)('hides %s from a Viewer', async (name, ui) => {
    expect(button(await render(ui, VIEWER), name)).toBeUndefined();
  });

  it('offers Configure to a role that may change configuration, and not to a Viewer', async () => {
    const configure = <ConfigureButton onClick={() => {}} />;
    expect(button(await render(configure, PLATFORM_ENGINEER), 'Configure')?.disabled).toBe(false);
    unmount();
    expect(button(await render(configure, VIEWER), 'Configure')).toBeUndefined();
  });
});
