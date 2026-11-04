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
import type { ResourceLink, ResourceLinkSuggestion } from '../../types/configuration';
import { LinkRows } from './LinkRows';

const unlink = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
const create = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false, isError: false }));
const server = vi.hoisted(() => ({ suggestions: [] as ResourceLinkSuggestion[] }));
vi.mock('../../hooks/useConfiguration', () => ({
  useDeleteResourceLink: () => unlink.current,
  useCreateResourceLink: () => create,
  useLastUnlinkAt: () => 0,
  useResourceLinkSuggestions: () => ({ data: server.suggestions }),
}));
vi.mock('@wso2/oxygen-ui-icons-react', () => ({ Unlink: () => <span />, Link: () => <span /> }));
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
    TextField: ({ children, value, onChange, inputProps }: { children: ReactNode; value: string; onChange: (e: { target: { value: string } }) => void; inputProps: { 'aria-label': string } }) => (
      <select aria-label={inputProps['aria-label']} value={value} onChange={(e) => onChange({ target: { value: e.target.value } })}>
        {children}
      </select>
    ),
    MenuItem: ({ children, value }: { children: ReactNode; value: string }) => <option value={value}>{children}</option>,
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
  server.suggestions = [];
  create.mutate.mockClear();
  unlink.current = { mutate: vi.fn(), isPending: false, isError: false };
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
    await act(async () => root.render(<LinkRows projectId="default" componentId="sfdemo" env="development" links={[support]} open />));
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
    await act(async () => root.render(<LinkRows projectId="default" componentId="ghdemo" env="development" links={[removed]} open />));
    expect(container.textContent).toContain('GitHub Acmeballerinax/githubUnlinked in next releaseacme.ghdemo.github');
    expect(container.querySelectorAll('button')).toHaveLength(0);
  });

  it('offers no retry while nothing failed', async () => {
    unlink.current = { mutate: vi.fn(), isPending: false, isError: false };
    await act(async () => root.render(<LinkRows projectId="default" componentId="sfdemo" env="development" links={[support]} open />));
    expect([...container.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Unlink']);
  });

  const github = (connections: string[], linked = false): ResourceLinkSuggestion => ({ resourceType: 'github-acme', displayName: 'GitHub Acme', package: 'ballerinax/github', connections, linked });
  const removed: ResourceLink = {
    resourceType: 'github-acme',
    linked: false,
    environments: [{ name: 'development', state: 'in_release', inRelease: true, hasValues: true, configurables: {}, connection: 'acme.ghdemo.github' }],
  };
  const buttons = () => [...container.querySelectorAll('button')].map((b) => b.textContent);

  it('shows a resource once: a link that ends with the next release and its suggestion are one row, with Link', async () => {
    server.suggestions = [github(['acme.ghdemo.gh'])];
    await act(async () => root.render(<LinkRows projectId="default" componentId="ghdemo" env="development" links={[removed]} open />));
    expect(container.textContent?.match(/GitHub Acme/g)).toHaveLength(1);
    expect(container.textContent).toContain('Unlinked in next release');
    expect(buttons()).toEqual(['Link']);
    await act(async () => container.querySelector('button')?.click());
    expect(create.mutate).toHaveBeenCalledWith({ projectId: 'default', componentId: 'ghdemo', resourceType: 'github-acme', connection: 'acme.ghdemo.gh', changed: false });
  });

  it('lists linked resources first, then suggestions, in one box', async () => {
    server.suggestions = [github(['acme.sfdemo.gh'])];
    await act(async () => root.render(<LinkRows projectId="default" componentId="sfdemo" env="development" links={[support]} open />));
    expect(container.textContent?.indexOf('salesforce-support')).toBeLessThan(container.textContent?.indexOf('GitHub Acme') ?? -1);
    expect(buttons()).toEqual(['Unlink', 'Link']);
  });

  it('offers a choice of connection where a resource is suggested through several, and links the one chosen', async () => {
    server.suggestions = [github(['acme.sfdemo.gh', 'acme.sfdemo.github'])];
    await act(async () => root.render(<LinkRows projectId="default" componentId="sfdemo" env="development" links={[]} open />));
    const select = container.querySelector('select[aria-label="Connection for github-acme"]') as HTMLSelectElement;
    await act(async () => {
      select.value = 'acme.sfdemo.github';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => [...container.querySelectorAll('button')].find((b) => b.textContent === 'Link')?.click());
    expect(create.mutate).toHaveBeenCalledWith(expect.objectContaining({ connection: 'acme.sfdemo.github' }));
  });

  it('links a link made on WSO2 Cloud through a connection, without calling it a change', async () => {
    const cloudOnly: ResourceLink = { resourceType: 'github-acme', linked: true, environments: [{ name: 'development', state: 'linked', inRelease: true, hasValues: true, configurables: {} }] };
    server.suggestions = [github(['acme.sfdemo.gh'], true)];
    await act(async () => root.render(<LinkRows projectId="default" componentId="sfdemo" env="development" links={[cloudOnly]} open />));
    expect(container.textContent).toContain('linked from WSO2 Cloud');
    await act(async () => container.querySelector('button')?.click());
    expect(create.mutate).toHaveBeenCalledWith(expect.objectContaining({ connection: 'acme.sfdemo.gh', changed: false }));
  });
});
