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
import { FormLinks } from './FormLinks';

// What ipaas-service answers for a build after a rename: the link's connection sfSales is gone, sfCrm is there.
const server = vi.hoisted(() => ({ warningsFor: '' as string | undefined }));
vi.mock('../../hooks/useConfiguration', () => ({
  useLinkWarnings: (_p: string, _c: string, build: string) => {
    server.warningsFor = build;
    return { data: [{ resourceType: 'salesforce-sales', connection: 'acme.sfdemo.sfSales', reason: 'not_in_build' }] };
  },
  useResourceLinks: () => ({ data: [sales] }),
  useResourceLinkSuggestions: () => ({
    data: [{ resourceType: 'salesforce-sales', displayName: 'Salesforce Sales', package: 'ballerinax/salesforce', connections: ['acme.sfdemo.sfCrm'], linked: true, linkedConnection: 'acme.sfdemo.sfSales' }],
  }),
  useCreateResourceLink: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
  useLastUnlinkAt: () => 0,
  useDeleteResourceLink: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
}));
vi.mock('../../hooks/useDeployments', () => ({ useDeployDeploymentTrack: () => ({ mutate: vi.fn(), isPending: false, isError: false }) }));
vi.mock('@wso2/oxygen-ui-icons-react', () => ({ Link: () => <span />, Unlink: () => <span /> }));
vi.mock('@wso2/oxygen-ui', () => {
  const Plain = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  const Hidden = () => null;
  return {
    Alert: Plain,
    Box: Plain,
    Stack: Plain,
    Typography: Plain,
    Chip: () => <span />,
    CircularProgress: () => <span />,
    Button: ({ children }: { children: ReactNode }) => <button>{children}</button>,
    Dialog: Hidden,
    DialogTitle: Hidden,
    DialogContent: Hidden,
    DialogActions: Hidden,
  };
});

const sales: ResourceLink = {
  resourceType: 'salesforce-sales',
  connection: 'acme.sfdemo.sfSales',
  linked: true,
  environments: [{ name: 'development', state: 'linked', inRelease: true, hasValues: true, configurables: { 'acme.sfdemo.sfSalesBaseUrl': 'SALESFORCE_BASE_URL' }, connection: 'acme.sfdemo.sfSales' }],
};
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  server.warningsFor = undefined;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('FormLinks', () => {
  it("offers Change link where the environment's build has no connection a link goes through", async () => {
    await act(async () => root.render(<FormLinks projectId="default" componentId="sfdemo" env="development" open links={[sales]} build="sfdemo-1793715328134" />));
    expect(server.warningsFor).toBe('sfdemo-1793715328134');
    expect(container.textContent).toContain('salesforce-sales: this build has no sfSales');
    expect([...container.querySelectorAll('button')].map((b) => b.textContent)).toContain('Change link');
  });

  it("asks nothing of a form that doesn't know the environment's build", async () => {
    await act(async () => root.render(<FormLinks projectId="default" componentId="sfdemo" env="development" open links={[sales]} />));
    expect(server.warningsFor).toBeUndefined();
    expect(container.textContent).not.toContain('this build has no');
  });
});
