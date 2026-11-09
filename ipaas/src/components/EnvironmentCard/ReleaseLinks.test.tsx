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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnvironmentLinks, IntegrationLinks } from '../../types/configuration';
import { ReleaseLinks } from './ReleaseLinks';

// ipaas-service's answer: development's release uses orders-db and the links changed since; production's values changed after its pods started.
const environment = (name: string, rest: Partial<EnvironmentLinks>): EnvironmentLinks => ({ name, deployed: true, resources: [], valuesChanged: false, linksNeedDeploy: false, connections: {}, configurables: {}, env: {}, ...rest });
const links: IntegrationLinks = {
  kind: 'ballerina',
  resources: [{ id: 'orders-db', displayName: 'Orders DB', keys: [], valuesIn: ['development', 'production'] }],
  used: {},
  usedByOrphaned: {},
  connections: [],
  fieldLinks: {},
  endpointLinks: {},
  orphaned: [],
  env: {},
  environments: [
    environment('development', { resources: [{ ref: 'orders-db', state: 'in_use' }], linksNeedDeploy: true }),
    environment('production', { resources: [{ ref: 'orders-db', state: 'needs_restart' }], valuesChanged: true }),
    environment('staging', { deployed: false }),
  ],
};
vi.mock('../../hooks/useConfiguration', () => ({ useIntegrationLinks: () => ({ data: links }) }));

let container: HTMLDivElement;
let root: Root;
const render = (env: string) => act(async () => root.render(<ReleaseLinks projectId="default" componentId="ghdemo" env={env} />));

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement('div');
  root = createRoot(container);
});
afterEach(() => act(() => root.unmount()));

describe('an environment card', () => {
  it("lists the resources the first environment's release uses, and that the links are not applied yet", async () => {
    await render('development');
    expect(container.textContent).toBe('This release usesOrders DBLinks apply on the next Apply');
  });

  it('says when values changed after the pods started', async () => {
    await render('production');
    expect(container.textContent).toBe('This release usesOrders DBValues changed · Stop and start to apply');
  });

  it('says nothing where the integration is not deployed', async () => {
    await render('staging');
    expect(container.textContent).toBe('');
  });
});
