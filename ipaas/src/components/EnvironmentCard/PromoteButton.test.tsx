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

const deployments: Record<string, { releaseId: string; build: { buildId: string } } | undefined> = {};
const mutate = vi.hoisted(() => vi.fn());
vi.mock('../../hooks/useDeployments', () => ({
  useComponentDeployment: (_o: string, _u: string, _c: string, _v: string, env: string) => ({ data: deployments[env], isLoading: false }),
  usePromote: () => ({ mutate, isPending: false }),
}));
vi.mock('../../hooks/useOrgUuid', () => ({ useOrgUuid: () => 'org' }));
// The read of the links the click makes: what it answers, or a promise that never settles.
const read = vi.hoisted(() => ({ result: undefined as unknown }));
vi.mock('../../hooks/useConfiguration', () => ({ useResourceLinks: () => ({ refetch: () => read.result }) }));
const answered = (data: unknown[]) => Promise.resolve({ isSuccess: true, data });
vi.mock('../Authorized', () => ({ default: ({ children }: { children: ReactNode }) => <>{children}</> }));
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
const render = () => act(async () => root.render(<PromoteButton orgHandler="acme" projectId="default" componentId="sftask" versionId="v" deploymentPipelineId="p" sourceEnvId="development" targetEnvId="production" />));
const button = () => container.querySelector('button')!;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  mutate.mockClear();
  read.result = answered([]);
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
    expect(dialog.textContent).toContain("Couldn't check that the resources this release uses have values in production. It won't start there if one has none.");
    await act(async () => dialog.querySelectorAll('button')[1].click());
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it('warns before promoting a release whose resource has no values in the target', async () => {
    read.result = answered([
      {
        resourceType: 'salesforce-marketing',
        linked: true,
        environments: [
          { name: 'development', inRelease: true, hasValues: true, configurables: {}, connectionInBuild: true },
          { name: 'production', inRelease: false, hasValues: false, configurables: {}, connectionInBuild: false },
        ],
      },
    ]);
    await render();
    await act(async () => button().click());
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain("salesforce-marketing has no values in production. It won't start there until you add them on WSO2 Cloud.");
    expect(mutate).not.toHaveBeenCalled();
  });
});
