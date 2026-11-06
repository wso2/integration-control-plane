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

import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnvCardBodyProps } from '../../../types/integration';
import EnvCardBody from './EnvCardBody';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const state = vi.hoisted(() => ({ targets: [] as unknown[] }));

// The endpoints and insights are the webhook body's; here only what goes between them is under test.
vi.mock('../webhook/EnvCardBody', () => ({ default: ({ children }: { children?: ReactNode }) => <section data-testid="deployed">{children}</section> }));
vi.mock('../../Workflows/overview/WorkflowEnvCardContent', () => ({
  default: ({ target }: { target: unknown }) => {
    state.targets.push(target);
    return <p>workflow content</p>;
  },
}));

const PROPS = {
  component: { id: 'orders' },
  env: { id: 'production', name: 'Production' },
  versionId: 'track-2',
  releaseId: 'release-1',
} as unknown as EnvCardBodyProps;

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  state.targets = [];
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function renderBody(deployment: Pick<EnvCardBodyProps, 'hasDeployment' | 'loadingDeployment' | 'deploymentStatusV2'>) {
  await act(async () => root.render(<EnvCardBody {...PROPS} {...deployment} />));
}

const deployedSection = () => container.querySelector('[data-testid="deployed"]');

describe('workflow EnvCardBody', () => {
  it('shows the workflows of an active deployment under its endpoints, from this environment and track', async () => {
    await renderBody({ hasDeployment: true, loadingDeployment: false, deploymentStatusV2: 'ACTIVE' });
    expect(deployedSection()?.textContent).toBe('workflow content');
    expect(state.targets.at(-1)).toEqual({ componentId: 'orders', environmentId: 'production', trackId: 'track-2', deployment: { releaseId: 'release-1', deploymentStatusV2: 'ACTIVE' }, isDeploymentLoading: false });
  });

  it.each(['IN_PROGRESS', 'SUSPENDED', 'ERROR'])('says the workflows come once a %s deployment is active', async (status) => {
    await renderBody({ hasDeployment: true, loadingDeployment: false, deploymentStatusV2: status });
    expect(deployedSection()?.textContent).toBe('The workflows show here once the deployment is active.');
    expect(state.targets).toHaveLength(0);
  });

  it('says when the environment has no deployment at all', async () => {
    await renderBody({ hasDeployment: false, loadingDeployment: false, deploymentStatusV2: null });
    expect(deployedSection()).toBeNull();
    expect(container.textContent).toBe('This integration has not been deployed to this environment yet.');
  });

  it('holds the card’s shape while the deployment loads', async () => {
    await renderBody({ hasDeployment: false, loadingDeployment: true, deploymentStatusV2: null });
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(deployedSection()).toBeNull();
  });
});
