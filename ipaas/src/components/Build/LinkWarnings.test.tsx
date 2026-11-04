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
import type { LinkWarning, ResourceLinkSuggestion } from '../../types/configuration';
import { LinkWarnings } from './LinkWarnings';

const server = vi.hoisted(() => ({ warnings: [] as LinkWarning[], suggestions: [] as ResourceLinkSuggestion[], suggestionsBuild: '' as string | undefined }));
const deploy = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false, isError: false }));
vi.mock('../../hooks/useConfiguration', () => ({
  useLinkWarnings: () => ({ data: server.warnings }),
  useResourceLinks: () => ({ data: [{ resourceType: 'salesforce-sales', connection: 'acme.sfdemo.sfSales', linked: true, environments: [] }] }),
  useResourceLinkSuggestions: (_p: string, _c: string, build?: string) => {
    server.suggestionsBuild = build;
    return { data: server.suggestions };
  },
  useCreateResourceLink: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
  useLastUnlinkAt: () => 0,
}));
vi.mock('../../hooks/useDeployments', () => ({ useDeployDeploymentTrack: () => deploy }));
vi.mock('@wso2/oxygen-ui-icons-react', () => ({ Link: () => <span /> }));
vi.mock('@wso2/oxygen-ui', () => {
  const Plain = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
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
    Chip: () => <span />,
    CircularProgress: () => <span />,
    Button: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => <button onClick={onClick}>{children}</button>,
  };
});

let container: HTMLDivElement;
let root: Root;
const render = () => act(async () => root.render(<LinkWarnings projectId="default" componentId="sfdemo" versionId="v1" build="sfdemo-1793" firstEnvId="development" deploymentPipelineId="p1" />));
const buttons = () => [...container.querySelectorAll('button')].map((b) => b.textContent);

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.assign(server, { warnings: [], suggestions: [] });
  deploy.mutate.mockClear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('LinkWarnings', () => {
  it("names a connection the build doesn't have, and offers that build's connections", async () => {
    server.warnings = [{ resourceType: 'salesforce-sales', connection: 'acme.sfdemo.sfSales', reason: 'not_in_build' }];
    server.suggestions = [{ resourceType: 'salesforce-sales', displayName: 'Salesforce Sales', package: 'ballerinax/salesforce', connections: ['acme.sfdemo.sfCrm'], linked: true, linkedConnection: 'acme.sfdemo.sfSales' }];
    await render();
    expect(container.textContent).toContain('salesforce-sales: this build has no sfSales');
    expect(server.suggestionsBuild).toBe('sfdemo-1793');
    expect(buttons()).toEqual(['Change link']);
  });

  it('deploys the build to the first environment where its names are not applied', async () => {
    server.warnings = [{ resourceType: 'salesforce-sales', connection: 'acme.sfdemo.sfSales', reason: 'not_applied' }];
    await render();
    expect(container.textContent).toContain('Links not applied yet: salesforce-sales');
    await act(async () => container.querySelector('button')?.click());
    expect(deploy.mutate).toHaveBeenCalledWith({ componentId: 'sfdemo', id: 'v1', imageId: 'sfdemo-1793', environmentId: 'development', deploymentPipelineId: 'p1' });
  });

  it("offers no Change link for a build the Workload doesn't hold, after a rollback", async () => {
    // ipaas-service warns only for the Workload's build; the rolled-back build's suggestions still name its connections.
    server.suggestions = [{ resourceType: 'salesforce-sales', displayName: 'Salesforce Sales', package: 'ballerinax/salesforce', connections: ['acme.sfdemo.sfOld'], linked: true, linkedConnection: 'acme.sfdemo.sfSales' }];
    await render();
    expect(buttons()).toEqual([]);
  });

  it('offers Change link only for the resource the warning names', async () => {
    server.warnings = [{ resourceType: 'salesforce-sales', connection: 'acme.sfdemo.sfSales', reason: 'not_in_build' }];
    server.suggestions = [
      { resourceType: 'salesforce-sales', displayName: 'Salesforce Sales', package: 'ballerinax/salesforce', connections: ['acme.sfdemo.sfCrm'], linked: true, linkedConnection: 'acme.sfdemo.sfSales' },
      { resourceType: 'salesforce-support', displayName: 'Salesforce Support', package: 'ballerinax/salesforce', connections: ['acme.sfdemo.sfCrm'], linked: true, linkedConnection: 'acme.sfdemo.sfDesk' },
    ];
    await render();
    expect(container.textContent).not.toContain('acme.sfdemo.sfDesk → acme.sfdemo.sfCrm');
    expect(buttons()).toEqual(['Change link']);
  });

  it('says nothing when the build and the links agree', async () => {
    await render();
    expect(container.textContent).toBe('');
    expect(buttons()).toEqual([]);
  });
});
