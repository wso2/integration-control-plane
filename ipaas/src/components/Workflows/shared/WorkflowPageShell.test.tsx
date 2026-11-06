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
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentScope } from '../../../nav';
import type { WorkflowApi } from '../api/useWorkflowApi';
import type { WorkflowClient } from '../api/client';
import WorkflowPageShell from './WorkflowPageShell';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const state = vi.hoisted(() => ({
  api: { client: null, connection: { status: 'loading' } } as unknown as WorkflowApi,
  displayType: 'ballerinaWorkflow',
  targets: [] as unknown[],
  componentError: null as Error | null,
  refetchComponent: vi.fn(),
}));

vi.mock('../../../hooks/useOrgUuid', () => ({ useOrgUuid: () => 'org-uuid' }));
vi.mock('../../../hooks/useProjects', () => ({ useProjectId: () => ({ projectId: 'project-1', isLoading: false }) }));
vi.mock('../../../hooks/useComponents', () => ({
  useComponentByHandler: () =>
    state.componentError
      ? { data: undefined, isLoading: false, error: state.componentError, refetch: state.refetchComponent }
      : { data: { id: 'orders', handler: 'orders', displayType: state.displayType, componentSubType: null, deploymentTracks: [] }, isLoading: false, error: null },
}));
vi.mock('../../../hooks/useEnvironments', () => ({
  useEnvironments: () => ({
    data: [
      { id: 'development', name: 'Development', critical: false },
      { id: 'production', name: 'Production', critical: true },
    ],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock('../../../hooks/useSelectedTrack', () => ({ useSelectedTrack: () => ({ trackId: 'track-1' }), withTrackParam: (url: string) => url }));
vi.mock('../../../hooks/useDeployments', () => ({ useComponentDeployment: () => ({ data: { releaseId: 'release-1', deploymentStatusV2: 'ACTIVE' }, isLoading: false }) }));
vi.mock('../api/useWorkflowApi', () => ({
  useWorkflowApi: (target: unknown) => {
    state.targets.push(target);
    return state.api;
  },
}));
// The band reads the scope from the router's nav context; its own behaviour is not under test here.
vi.mock('../../DeploymentTrackBar', () => ({ default: ({ extra }: { extra?: unknown }) => <div data-testid="band">{extra ? 'environments' : ''}</div> }));
vi.mock('../../common/EnvironmentSelect', () => ({ default: ({ value }: { value: string }) => <span>{value}</span> }));

const SCOPE: ComponentScope = { level: 'components', org: 'acme', project: 'default', component: 'orders' };

let root: Root;
let container: HTMLDivElement;

async function renderShell(url = '/') {
  await act(async () =>
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={[url]}>
          <WorkflowPageShell scope={SCOPE} title="Workflows" purpose="runWorkflows">
            {({ api, environment }) => <p>{`slot for ${environment.id} on ${api.connection.runtime.taskQueue}`}</p>}
          </WorkflowPageShell>
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  );
  return container.textContent ?? '';
}

beforeEach(() => {
  state.displayType = 'ballerinaWorkflow';
  state.targets = [];
  state.componentError = null;
  state.refetchComponent.mockClear();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

const pending = (connection: object) => ({ client: null, connection }) as unknown as WorkflowApi;

describe('WorkflowPageShell', () => {
  it('fills the slot once the connection is ready, with the auto-refresh switch beside the title', async () => {
    state.api = { client: {} as WorkflowClient, connection: { status: 'ready', scopeId: 's', runtime: { taskQueue: 'orders-queue' } } } as unknown as WorkflowApi;
    const text = await renderShell();
    expect(text).toContain('Workflows');
    expect(text).toContain('slot for development on orders-queue');
    expect(text).toContain('Auto-refresh');
  });

  it('opens on the environment a link names', async () => {
    await renderShell('/?env=production');
    expect(state.targets.at(-1)).toMatchObject({ componentId: 'orders', environmentId: 'production', trackId: 'track-1' });
  });

  it('says the integration is not deployed, as the Test Console does, for this page’s purpose', async () => {
    state.api = pending({ status: 'not-deployed', deploymentStatus: null });
    expect(await renderShell()).toContain('This integration is not yet deployed. Deploy it to run its workflows.');
  });

  it('shows the notice of a management API out of reach, and connecting while it resolves', async () => {
    state.api = pending({ status: 'unavailable', reason: 'not-exposed', notice: { severity: 'info', text: 'Not exposed yet.' }, action: null });
    expect(await renderShell()).toContain('Not exposed yet.');

    state.api = pending({ status: 'loading' });
    expect(await renderShell()).toContain('Connecting to the workflow engine');
  });

  it('says the credentials were refused, and retries on request', async () => {
    const retry = vi.fn();
    state.api = pending({ status: 'refused', message: 'The credentials were rejected.', retry });
    const text = await renderShell();
    expect(text).toContain('Credentials refused');
    expect(text).not.toContain('Auto-refresh');
    const button = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Retry');
    await act(async () => button?.click());
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('says the pages are only for workflow integrations', async () => {
    state.displayType = 'ballerinaService';
    expect(await renderShell()).toContain('Workflows are available only for workflow integrations.');
  });

  it('says a failed read of the integration is not a missing one, and reads it again on Retry', async () => {
    state.componentError = Object.assign(new Error('HTTP 500'), { status: 500 });
    const text = await renderShell();
    expect(text).toContain('Could not load this integration.');
    expect(text).not.toContain('Integration not found');
    const retry = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Retry');
    await act(async () => retry?.click());
    expect(state.refetchComponent).toHaveBeenCalledTimes(1);
  });

  it('says an integration the BFF does not know is not found', async () => {
    state.componentError = Object.assign(new Error('HTTP 404'), { status: 404 });
    expect(await renderShell()).toContain('Integration not found');
  });
});
