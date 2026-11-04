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
import type { ResourceLink } from '../../types/configuration';
import { LinkRows } from './LinkRows';

const unlink = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
vi.mock('../../hooks/useConfiguration', () => ({ useDeleteResourceLink: () => unlink.current }));
vi.mock('@wso2/oxygen-ui-icons-react', () => ({ Unlink: () => <span /> }));
vi.mock('@wso2/oxygen-ui', () => {
  const Plain = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  const Hidden = () => null;
  return {
    Alert: ({ children, action }: { children?: ReactNode; action?: ReactNode }) => (
      <div>
        {children}
        {action}
      </div>
    ),
    Box: Plain,
    Stack: Plain,
    Typography: Plain,
    Chip: ({ label }: { label: string }) => <span>{label}</span>,
    CircularProgress: () => <span />,
    Button: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => <button onClick={onClick}>{children}</button>,
    Dialog: Hidden,
    DialogTitle: Hidden,
    DialogContent: Hidden,
    DialogActions: Hidden,
  };
});

const support: ResourceLink = {
  resourceType: 'salesforce-support',
  connection: 'acme.sfdemo.sfDesk',
  linked: true,
  environments: [{ name: 'development', state: 'linked', inRelease: true, hasValues: true, configurables: {} }],
};
const variables = { projectId: 'default', componentId: 'sfdemo', resourceType: 'salesforce-support' };
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('LinkRows', () => {
  it('offers to try a failed unlink again, with the same link', async () => {
    const mutate = vi.fn();
    unlink.current = { mutate, isPending: false, isError: true, error: new Error('delete link failed'), variables };
    await act(async () => root.render(<LinkRows projectId="default" componentId="sfdemo" env="development" links={[support]} />));
    expect(container.textContent).toContain('delete link failed');
    const retry = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Try again');
    await act(async () => retry?.click());
    expect(mutate).toHaveBeenCalledWith(variables);
  });

  it('shows a link only the release still delivers with a label, its display name and package, and no Unlink', async () => {
    unlink.current = { mutate: vi.fn(), isPending: false, isError: false };
    const removed: ResourceLink = {
      resourceType: 'github-acme',
      displayName: 'GitHub Acme',
      package: 'ballerinax/github',
      linked: false,
      environments: [{ name: 'development', state: 'in_release', inRelease: true, hasValues: true, configurables: {}, connection: 'acme.ghdemo.github' }],
    };
    await act(async () => root.render(<LinkRows projectId="default" componentId="ghdemo" env="development" links={[removed]} />));
    expect(container.textContent).toContain('GitHub Acmeballerinax/githubUnlinked in next releaseacme.ghdemo.github');
    expect(container.querySelectorAll('button')).toHaveLength(0);
  });

  it('offers no retry while nothing failed', async () => {
    unlink.current = { mutate: vi.fn(), isPending: false, isError: false };
    await act(async () => root.render(<LinkRows projectId="default" componentId="sfdemo" env="development" links={[support]} />));
    expect([...container.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Unlink']);
  });
});
