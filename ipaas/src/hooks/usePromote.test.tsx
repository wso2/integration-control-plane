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
import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useIntegrationLinks } from './useConfiguration';
import { usePromote } from './useDeployments';
import type { EnvironmentLinks } from '../types/configuration';

// What ipaas-service answers: development's release links sfSales; production's does once it runs that release.
const server = vi.hoisted(() => ({ productionPromoted: false, reads: 0 }));
const environment = (name: string, linked: boolean): EnvironmentLinks => ({
  name,
  deployed: true,
  resources: linked ? [{ ref: 'salesforce-sales', state: 'in_use' }] : [],
  valuesChanged: false,
  linksNeedDeploy: false,
  connections: linked ? { 'acme/sfdemo:sfSales': 'salesforce-sales' } : {},
  configurables: linked ? { 'acme/sfdemo:sfSalesBaseUrl': { ref: 'salesforce-sales', key: 'BASE_URL' } } : {},
  env: {},
});
vi.mock('../api/configuration', () => ({
  fetchIntegrationLinks: async () => {
    server.reads++;
    return { kind: 'ballerina', resources: [], used: {}, usedByOrphaned: {}, connections: [], fieldLinks: {}, orphaned: [], env: {}, environments: [environment('development', true), environment('production', server.productionPromoted)] };
  },
}));
vi.mock('../api/deployments', () => ({ promote: async () => 'promoted' }));

let container: HTMLDivElement;
let root: Root;
let promote: ReturnType<typeof usePromote>;

function ProductionForm() {
  const { data } = useIntegrationLinks('default', 'sfdemo', true);
  promote = usePromote();
  return <span>{Object.keys(data?.environments[1].configurables ?? {}).join()}</span>;
}

const wait = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));
const promoteToProduction = () => act(() => promote.mutateAsync({ componentId: 'sfdemo', apiVersionId: 'v', sourceReleaseId: 'sfdemo-5ffb9874d9', sourceEnvironmentId: 'development', targetEnvironmentId: 'production', deploymentPipelineId: 'p' }));

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  focusManager.setFocused(true);
  Object.assign(server, { productionPromoted: false, reads: 0 });
  container = document.createElement('div');
  root = createRoot(container);
  await act(async () =>
    root.render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ProductionForm />
      </QueryClientProvider>,
    ),
  );
  await wait(0);
});
afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
});

describe('after a promote', () => {
  it("shows production's linked field once production runs the promoted release", async () => {
    await promoteToProduction();
    await wait(0);
    expect(container.textContent).toBe('');

    server.productionPromoted = true;
    await wait(4000);
    expect(container.textContent).toBe('acme/sfdemo:sfSalesBaseUrl');

    const reads = server.reads;
    await wait(30_000);
    expect(server.reads).toBe(reads);
  });

  it('stops reading the links after two minutes when the target never gets the release', async () => {
    await promoteToProduction();
    await wait(120_000);
    const reads = server.reads;
    await wait(30_000);
    expect(server.reads).toBe(reads);
  });
});
