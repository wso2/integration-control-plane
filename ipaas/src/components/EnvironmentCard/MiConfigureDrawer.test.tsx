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
import type { IntegrationLinks } from '../../types/configuration';
import MiConfigureDrawer from './MiConfigureDrawer';

// ipaas-service's answer for orders-mi: GITHUB_TOKEN is linked to GitHub Acme; production's release has the link too.
const github = { ref: 'github-acme', key: 'GITHUB_AUTH_TOKEN' };
const environment = (name: string) => ({ name, deployed: true, resources: [], valuesChanged: false, linksNeedDeploy: false, connections: {}, configurables: {}, env: { GITHUB_TOKEN: github } });
const links: IntegrationLinks = {
  kind: 'mi',
  resources: [
    { id: 'github-acme', displayName: 'GitHub Acme', keys: [{ name: 'GITHUB_AUTH_TOKEN', secret: true }], valuesIn: ['development'] },
    { id: 'orders-db', displayName: 'orders-db', keys: [{ name: 'URL', secret: false }], valuesIn: ['development'] },
  ],
  used: { 'github-acme|GITHUB_AUTH_TOKEN': 'GITHUB_TOKEN' },
  connections: [],
  fieldLinks: {},
  orphaned: [],
  env: { GITHUB_TOKEN: github },
  environments: [environment('development'), environment('production')],
};
const writes = vi.hoisted(() => [] as unknown[]);
vi.mock('../../hooks/useConfiguration', () => ({
  useIntegrationLinks: () => ({ data: links }),
  useLinkWrite: () => ({ isError: false, mutate: (input: { target: unknown }) => writes.push(input.target) }),
}));
vi.mock('../../hooks/useMiConfig', () => ({
  useMiConfig: () => ({ data: { envVars: [{ key: 'DB_URL', value: 'jdbc:x' }], secrets: [] }, isLoading: false, isError: false }),
  useSaveMiConfig: () => ({ isPending: false, mutate: vi.fn() }),
}));
vi.mock('../../hooks/useDeployments', () => ({ useEnvEndpoints: () => ({ data: [] }) }));
vi.mock('../../hooks/useEnvironments', () => ({
  useEnvironments: () => ({
    data: [
      { id: 'development', name: 'Development' },
      { id: 'production', name: 'Production' },
    ],
  }),
}));
vi.mock('../../nav', () => ({ useScope: () => ({}), navUrl: () => null }));
vi.mock('../Overview/integration-as-api/ApiSettingsDrawer', () => ({ default: () => null }));
// On devant-migration the drawer guards unsaved changes through this context.
vi.mock('../../contexts/UnsavedChangesContext', () => ({ useUnsavedChanges: () => () => {}, useLeaveGuard: () => (proceed: () => void) => proceed() }));

let root: Root;
let container: HTMLDivElement;
const render = (envId: string) => act(async () => root.render(<MiConfigureDrawer open onClose={vi.fn()} projectId="default" componentId="orders-mi" envId={envId} versionId="v" releaseId="r" />));
const supplied = (name: string) => (document.querySelector(`input[aria-label="${name} is supplied by GitHub Acme"]`) as HTMLInputElement | null)?.value;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  writes.length = 0;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('the MI Configure form', () => {
  it('shows a linked variable as a row, and links another from its link icon, a used key disabled', async () => {
    await render('development');
    expect(supplied('GITHUB_TOKEN')).toBe('from GitHub Acme · GITHUB_AUTH_TOKEN');
    expect(document.body.textContent).toContain('Links apply to all environments; values are per environment.');

    await act(async () => (document.querySelector('[aria-label="Link DB_URL"]') as HTMLElement).click());
    const items = Array.from(document.querySelectorAll('[aria-label="Source of DB_URL"] li'));
    expect(items.map((li) => [li.textContent, li.getAttribute('aria-disabled')])).toEqual([
      ['Enter a value', null],
      ['GitHub Acme', null],
      ['GITHUB_AUTH_TOKENused by GITHUB_TOKEN', 'true'],
      ['orders-db', null],
      ['URL', null],
    ]);
    await act(async () => (items[4] as HTMLElement).click());
    expect(writes).toEqual([{ env: 'DB_URL', ref: 'orders-db', key: 'URL' }]);
  });

  it("removes a linked row's link", async () => {
    await render('development');
    await act(async () => (document.querySelector('[aria-label="Remove GITHUB_TOKEN"]') as HTMLElement).click());
    expect(writes).toEqual([{ env: 'GITHUB_TOKEN' }]);
  });

  it('shows the links read-only outside the first environment, with no values there flagged', async () => {
    await render('production');
    expect(supplied('GITHUB_TOKEN')).toBe('from GitHub Acme · GITHUB_AUTH_TOKEN');
    expect(document.querySelector('[aria-label="Link GITHUB_TOKEN"]')).toBeNull();
    expect(document.querySelector('[aria-label="Link DB_URL"]')).toBeNull();
    expect(document.body.textContent).toContain('No Production values. Add them in WSO2 Cloud.');
    expect(document.body.textContent).toContain('Links apply to all environments. Change links in Development.');
  });
});
