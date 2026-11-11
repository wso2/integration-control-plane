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
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnvCardSharedActionProps } from '../../../types/integration';
import UserPortalSharedAction from './UserPortalSharedAction';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The real action reads the portal from the BFF; the marker shows what the footer asked of it.
vi.mock('../../UserPortal/UserPortalAction', () => ({
  default: ({ isWorkflow, showPortalLink }: { isWorkflow: boolean; showPortalLink: boolean }) => <span data-testid="portal-action" data-workflow={String(isWorkflow)} data-link={String(showPortalLink)} />,
}));

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

const WORKFLOW = { id: 'orders', displayType: 'ballerinaWorkflow', componentSubType: null };
const AUTOMATION = { id: 'nightly', displayType: 'ballerinaScheduledTask', componentSubType: null };

describe("the footer's Open User Portal link", () => {
  // A workflow's card body has a notice that opens the portal only while its deployment is active.
  it.each([
    { name: 'an active workflow leaves it to the notice', component: WORKFLOW, status: 'ACTIVE', link: false },
    { name: 'a stopped workflow keeps it', component: WORKFLOW, status: 'SUSPENDED', link: true },
    { name: 'a workflow redeploying keeps it', component: WORKFLOW, status: 'IN_PROGRESS', link: true },
    { name: 'a workflow with no deployment keeps it', component: WORKFLOW, status: null, link: true },
    { name: 'an active automation keeps it', component: AUTOMATION, status: 'ACTIVE', link: true },
  ])('$name', async ({ component, status, link }) => {
    const props = { component, env: { id: 'production', name: 'Production' }, orgHandler: 'acme', projectId: 'shop', onNotify: () => {}, deploymentStatusV2: status } as unknown as EnvCardSharedActionProps;
    await act(async () => root.render(<UserPortalSharedAction {...props} />));
    const action = container.querySelector('[data-testid="portal-action"]');
    expect(action?.getAttribute('data-link')).toBe(String(link));
    expect(action?.getAttribute('data-workflow')).toBe(String(component === WORKFLOW));
  });

  // Every card holds the switch's place from its first frame, whatever the integration type.
  it.each([WORKFLOW, AUTOMATION])('holds the switch’s place while the deployment loads', async (component) => {
    const props = { component, env: { id: 'production', name: 'Production' }, orgHandler: 'acme', projectId: 'shop', onNotify: () => {}, deploymentStatusV2: null, loadingDeployment: true } as unknown as EnvCardSharedActionProps;
    await act(async () => root.render(<UserPortalSharedAction {...props} />));
    expect(container.querySelector('[data-testid="portal-action"]')).toBeNull();
    expect(container.querySelector('[role="status"][aria-label="Loading the User Portal"]')).not.toBeNull();
  });
});
