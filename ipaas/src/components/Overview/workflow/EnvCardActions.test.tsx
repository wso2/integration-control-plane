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
import type { ReactElement } from 'react';
import WorkflowEnvCardActions from './EnvCardActions';
import ApiEnvCardActions from '../integration-as-api/EnvCardActions';
import { button, renderWithScopes } from '../../../test/renderWithScopes';
import { DEVELOPER } from '../../../test/roles';
import type { EnvCardActionsProps } from '../../../types/integration';

const mutation = { mutate: vi.fn(), isPending: false };
vi.mock('../../../hooks/useDeployments', () => ({ useStopDeployment: () => mutation, useRedeployDeployment: () => mutation }));
vi.mock('../../../hooks/useAppNavigate', () => ({ useAppNavigate: () => vi.fn() }));
vi.mock('../integration-as-api/ServiceLogsDrawer', () => ({ default: () => null }));
// The real action reads the portal state from the BFF; the marker stands in for its switch.
vi.mock('../../UserPortal/UserPortalAction', () => ({
  default: ({ isWorkflow }: { isWorkflow: boolean }) => (
    <label data-testid="portal-switch" data-workflow={String(isWorkflow)}>
      Publish to User Portal
    </label>
  ),
}));

const props = {
  component: { id: 'orders', displayType: 'ballerinaWorkflow' },
  env: { id: 'development', name: 'Development', critical: false },
  projectId: 'p1',
  orgHandler: 'acme',
  releaseId: 'r1',
  hasDeployment: true,
  deploymentStatusV2: 'ACTIVE',
  onNotify: () => {},
  requestPoll: () => {},
} as unknown as EnvCardActionsProps;

let unmount = () => {};
afterEach(() => unmount());

async function render(ui: ReactElement) {
  const r = await renderWithScopes(<MemoryRouter>{ui}</MemoryRouter>, DEVELOPER);
  unmount = r.unmount;
  return r.container;
}

describe('a workflow env card header', () => {
  it('has no Test button but keeps View logs and Stop', async () => {
    const c = await render(<WorkflowEnvCardActions {...props} />);
    expect(button(c, 'Test')).toBeUndefined();
    expect(button(c, 'View logs')).toBeDefined();
    expect(button(c, 'Stop')).toBeDefined();
  });

  it('leaves the User Portal switch to the footer', async () => {
    const c = await render(<WorkflowEnvCardActions {...props} />);
    expect(c.querySelector('[data-testid="portal-switch"]')).toBeNull();
  });
});

describe('an integration-as-API env card header', () => {
  it('still has its Test button and no User Portal switch of its own', async () => {
    const c = await render(<ApiEnvCardActions {...props} />);
    expect(button(c, 'Test')).toBeDefined();
    expect(c.querySelector('[data-testid="portal-switch"]')).toBeNull();
  });
});
