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

// Rendering the webhook body would list the endpoints; the workflow card must not.
const webhookBody = vi.hoisted(() => ({ rendered: 0 }));
vi.mock('../webhook/EnvCardBody', () => ({
  default: ({ children }: { children?: ReactNode }) => {
    webhookBody.rendered += 1;
    return <section>{children}</section>;
  },
}));
vi.mock('../../Workflows/overview/WorkflowEnvCardContent', () => ({
  default: ({ target }: { target: unknown }) => {
    state.targets.push(target);
    return <p>workflow content</p>;
  },
}));

// The workflow's deploy to the environment, which runs after its request.
const workflowDeploy = vi.hoisted(() => ({ value: { isDeploying: false } as Record<string, unknown>, args: [] as unknown[][] }));
vi.mock('../../../hooks/useWorkflowDeploy', () => ({
  useWorkflowDeploy: (...args: unknown[]) => {
    workflowDeploy.args.push(args);
    return workflowDeploy.value;
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
  webhookBody.rendered = 0;
  workflowDeploy.value = { isDeploying: false };
  workflowDeploy.args = [];
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

describe('workflow EnvCardBody', () => {
  it('shows only the workflows of an active deployment, from this environment and track, and no endpoints', async () => {
    await renderBody({ hasDeployment: true, loadingDeployment: false, deploymentStatusV2: 'ACTIVE' });
    expect(container.textContent).toBe('workflow content');
    expect(webhookBody.rendered).toBe(0);
    expect(state.targets.at(-1)).toEqual({ componentId: 'orders', environmentId: 'production', trackId: 'track-2', deployment: { releaseId: 'release-1', deploymentStatusV2: 'ACTIVE' }, isDeploymentLoading: false });
  });

  it.each(['IN_PROGRESS', 'SUSPENDED', 'ERROR'])('says the workflows come once a %s deployment is active', async (status) => {
    await renderBody({ hasDeployment: true, loadingDeployment: false, deploymentStatusV2: status });
    expect(container.textContent).toBe('The workflows show here once the deployment is active.');
    expect(webhookBody.rendered).toBe(0);
    expect(state.targets).toHaveLength(0);
  });

  it('says when the environment has no deployment at all', async () => {
    await renderBody({ hasDeployment: false, loadingDeployment: false, deploymentStatusV2: null });
    expect(state.targets).toHaveLength(0);
    expect(container.textContent).toBe('This integration has not been deployed to this environment yet.');
  });

  it('says a deploy to this environment is still running, before the environment has a deployment', async () => {
    workflowDeploy.value = { isDeploying: true, deploy: { environment: 'production', state: 'deploying', operation: 'deploy' } };
    await renderBody({ hasDeployment: false, loadingDeployment: false, deploymentStatusV2: null });
    expect(workflowDeploy.args.at(-1)).toEqual(['orders', 'production']);
    expect(container.querySelector('[data-testid="workflow-deploy-running"]')?.textContent).toBe('Deploying to this environment. Connecting the workflow runtime can take a minute.');
  });

  it('says when it could not check for a running deploy, and reads again on Retry', async () => {
    const refetch = vi.fn();
    workflowDeploy.value = { isDeploying: false, isError: true, refetch };
    await renderBody({ hasDeployment: true, loadingDeployment: false, deploymentStatusV2: 'ACTIVE' });
    const notice = container.querySelector('[data-testid="workflow-deploy-unknown"]');
    expect(notice?.textContent).toContain("Couldn't check whether a deployment to this environment is running.");
    await act(async () => notice?.querySelector('button')?.click());
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('says why the last promote to this environment failed', async () => {
    const failure = { environment: 'production', state: 'failed', operation: 'promote', message: 'the workflow runtime is unavailable; try again later' };
    workflowDeploy.value = { isDeploying: false, deploy: failure, failure };
    await renderBody({ hasDeployment: true, loadingDeployment: false, deploymentStatusV2: 'ACTIVE' });
    expect(container.querySelector('[data-testid="workflow-deploy-failed"]')?.textContent).toBe('The last promotion to this environment failed: the workflow runtime is unavailable; try again later');
    expect(state.targets).toHaveLength(1);
  });

  it('holds the card’s shape while the deployment loads', async () => {
    await renderBody({ hasDeployment: false, loadingDeployment: true, deploymentStatusV2: null });
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(state.targets).toHaveLength(0);
  });
});
