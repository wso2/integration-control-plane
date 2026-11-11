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
import PromoteButton from './PromoteButton';
import { BffError } from '../../api/_client';
import type { LinkableResource } from '../../types/configuration';

const deployments: Record<string, { releaseId: string; build: { buildId: string } } | undefined> = {};
const mutate = vi.hoisted(() => vi.fn());
vi.mock('../../hooks/useDeployments', () => ({
  useComponentDeployment: (_o: string, _u: string, _c: string, _v: string, env: string) => ({ data: deployments[env], isLoading: false }),
  usePromote: () => ({ mutate, isPending: false }),
}));
vi.mock('../../hooks/useOrgUuid', () => ({ useOrgUuid: () => 'org' }));
// The read of the links the click makes: what it answers, or a promise that never settles.
const read = vi.hoisted(() => ({ result: undefined as unknown }));
vi.mock('../../hooks/useConfiguration', () => ({ useIntegrationLinks: () => ({ refetch: () => read.result }) }));
const answered = (resources: LinkableResource[] = [], uses: string[] = []) =>
  Promise.resolve({
    isSuccess: true,
    data: { kind: 'ballerina', resources, used: {}, usedByOrphaned: {}, connections: [], fieldLinks: {}, orphaned: [], env: {}, environments: [{ name: 'development', resources: uses.map((ref) => ({ ref, state: 'in_use' })) }] },
  });
// The read of where the integration is published to the User Portal, which the click makes for a workflow.
const portal = vi.hoisted(() => ({ result: undefined as unknown, reads: 0 }));
vi.mock('../../hooks/useUserPortal', () => ({
  useUserPortalPublications: () => ({
    refetch: () => {
      portal.reads += 1;
      return portal.result;
    },
  }),
}));
const publishedIn = (...environments: string[]) => Promise.resolve({ isSuccess: true, data: { environments, unpublishing: [] as string[], notGivenBack: [] as string[] }, error: null });
vi.mock('../../hooks/useCan', () => ({ useCan: () => () => true }));
vi.mock('@wso2/oxygen-ui', () => {
  const Plain = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    Tooltip: ({ children, title }: { children: ReactNode; title: string }) => <div title={title}>{children}</div>,
    Button: ({ children, disabled, onClick }: { children: ReactNode; disabled?: boolean; onClick?: () => void }) => (
      <button disabled={disabled} onClick={onClick}>
        {children}
      </button>
    ),
    Dialog: ({ children, open }: { children: ReactNode; open: boolean }) => (open ? <div role="dialog">{children}</div> : null),
    DialogTitle: Plain,
    DialogContent: Plain,
    DialogActions: Plain,
    Typography: Plain,
  };
});
vi.mock('@wso2/oxygen-ui-icons-react', () => ({ ArrowDown: () => <span /> }));

let container: HTMLDivElement;
let root: Root;
const render = (isWorkflow = false) => act(async () => root.render(<PromoteButton orgHandler="acme" projectId="default" componentId="sftask" versionId="v" deploymentPipelineId="p" sourceEnvId="development" targetEnvId="production" isWorkflow={isWorkflow} />));
const button = () => container.querySelector('button')!;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  mutate.mockClear();
  read.result = answered();
  portal.result = publishedIn();
  portal.reads = 0;
  deployments.development = { releaseId: 'sftask-784445f4b4', build: { buildId: 'b1' } };
  deployments.production = { releaseId: 'sftask-66d97f5f4d', build: { buildId: 'b1' } };
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('PromoteButton', () => {
  it('offers a release of the build the target already runs', async () => {
    await render();
    expect(button().disabled).toBe(false);
  });

  it('holds back the release the target already runs', async () => {
    deployments.production = { releaseId: 'sftask-784445f4b4', build: { buildId: 'b1' } };
    await render();
    expect(button().disabled).toBe(true);
    expect(container.querySelector('[title]')!.getAttribute('title')).toBe('Already deployed in target environment');
  });

  it('promotes once the links read finds every resource has values in the target', async () => {
    await render();
    await act(async () => button().click());
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it('waits for the links read before deciding, with Promote disabled', async () => {
    read.result = new Promise(() => {});
    await render();
    await act(async () => button().click());
    expect(button().disabled).toBe(true);
    expect(button().textContent).toBe('Checking…');
    expect(mutate).not.toHaveBeenCalled();
  });

  it('says it could not check the values when the links read fails, and promotes only when asked again', async () => {
    read.result = Promise.resolve({ isSuccess: false, isError: true, data: undefined });
    await render();
    await act(async () => button().click());
    expect(mutate).not.toHaveBeenCalled();
    const dialog = container.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain("Couldn't check resource values in production.");
    await act(async () => dialog.querySelectorAll('button')[1].click());
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it('warns before promoting a release whose resource has no values in the target', async () => {
    read.result = answered([{ id: 'salesforce-marketing', displayName: 'Salesforce Marketing', keys: [], valuesIn: ['development'] }], ['salesforce-marketing']);
    await render();
    await act(async () => button().click());
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain('Salesforce Marketing has no values in production.');
    expect(mutate).not.toHaveBeenCalled();
  });

  it('warns before promoting a workflow published to the User Portal in the source but not the target', async () => {
    portal.result = publishedIn('development');
    await render(true);
    await act(async () => button().click());
    const dialog = container.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain('promoting carries that to production');
    expect(dialog.textContent).toContain("the console's workflow views won't work there");
    expect(mutate).not.toHaveBeenCalled();
    await act(async () => dialog.querySelectorAll('button')[1].click());
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  // Both redeploy the workflow in the target, and whichever lands last would decide the key it takes.
  it('holds a promotion into an environment the workflow is still being given back to the console in', async () => {
    portal.result = Promise.resolve({ isSuccess: true, data: { environments: [], unpublishing: ['production'], notGivenBack: [] }, error: null });
    await render(true);
    await act(async () => button().click());
    const dialog = container.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain('still being redeployed there to take the console');
    expect(dialog.querySelectorAll('button')[1].disabled).toBe(true);
    expect(mutate).not.toHaveBeenCalled();
  });

  it('promotes a workflow published in the target too, or nowhere, without asking', async () => {
    for (const environments of [['development', 'production'], []]) {
      mutate.mockClear();
      portal.result = publishedIn(...environments);
      await render(true);
      await act(async () => button().click());
      expect(mutate).toHaveBeenCalledTimes(1);
    }
  });

  it('says it could not check where a workflow is published when that read fails, but not on a BFF without the User Portal', async () => {
    portal.result = Promise.resolve({ isSuccess: false, data: undefined, error: new BffError(500, 'boom') });
    await render(true);
    await act(async () => button().click());
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain("Couldn't check where this workflow is published to the User Portal.");
    expect(mutate).not.toHaveBeenCalled();

    await act(async () => container.querySelector('[role="dialog"]')!.querySelectorAll('button')[0].click());
    portal.result = Promise.resolve({ isSuccess: false, data: undefined, error: new BffError(404, '404 page not found') });
    await act(async () => button().click());
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it('reads no publications for an integration that is not a workflow', async () => {
    await render();
    await act(async () => button().click());
    expect(portal.reads).toBe(0);
    expect(mutate).toHaveBeenCalledTimes(1);
  });
});
