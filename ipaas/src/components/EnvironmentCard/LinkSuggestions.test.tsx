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
import { LinkSuggestions } from './LinkSuggestions';

const create = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
vi.mock('../../hooks/useConfiguration', () => ({
  useResourceLinkSuggestions: () => ({
    data: [{ resourceType: 'salesforce-sales', displayName: 'Salesforce Sales', package: 'ballerinax/salesforce', connections: ['acme.sfdemo.sfCrm'], linked: true, linkedConnection: 'acme.sfdemo.sfSales' }],
  }),
  useCreateResourceLink: () => create.current,
}));
vi.mock('@wso2/oxygen-ui-icons-react', () => ({ Link: () => <span /> }));
vi.mock('@wso2/oxygen-ui', () => {
  const Plain = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return { Alert: Plain, Box: Plain, Stack: Plain, Typography: Plain, Chip: () => <span />, CircularProgress: () => <span />, Button: ({ children }: { children: ReactNode }) => <button>{children}</button> };
});

let container: HTMLDivElement;
let root: Root;
const sales: ResourceLink = { resourceType: 'salesforce-sales', connection: 'acme.sfdemo.sfSales', linked: true, environments: [] };
const variables = { projectId: 'default', componentId: 'sfdemo', resourceType: 'salesforce-sales', connection: 'acme.sfdemo.sfCrm', changed: true };

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

describe('LinkSuggestions', () => {
  it('offers to change a link the build can no longer take', async () => {
    create.current = { mutate: vi.fn(), isPending: false, isError: false };
    await act(async () => root.render(<LinkSuggestions projectId="default" componentId="sfdemo" open links={[sales]} build="sfdemo-2" />));
    expect(container.querySelector('button')?.textContent).toBe('Change link');
    expect(container.textContent).toContain('acme.sfdemo.sfSales → acme.sfdemo.sfCrm');
  });

  it('says in one line when the change reaches development', async () => {
    create.current = {
      mutate: vi.fn(),
      isPending: false,
      isError: false,
      data: { resourceType: 'salesforce-sales', connection: 'acme.sfdemo.sfCrm', workload: 'next_build', environmentsWithoutValues: [] },
      variables,
    };
    await act(async () => root.render(<LinkSuggestions projectId="default" componentId="sfdemo" open links={[sales]} />));
    expect(container.textContent).toContain('salesforce-sales now goes through acme.sfdemo.sfCrm. Build again to use it.');
  });
});
