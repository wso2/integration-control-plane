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
  usedByOrphaned: {},
  connections: [],
  fieldLinks: {},
  endpointLinks: {},
  orphaned: [],
  env: { GITHUB_TOKEN: github },
  environments: [environment('development'), environment('production')],
};
const writes = vi.hoisted(() => [] as unknown[]);
const answer = vi.hoisted(() => ({ links: undefined as IntegrationLinks | undefined, pending: false, readFailed: false, cached: true, refetches: 0, envVars: [{ key: 'DB_URL', value: 'jdbc:x' }] }));
vi.mock('../../hooks/useConfiguration', () => ({
  useIntegrationLinks: () => ({
    data: answer.cached ? (answer.links ?? links) : undefined,
    isError: answer.readFailed,
    isLoading: false,
    isFetching: false,
    refetch: async () => void answer.refetches++,
  }),
  useLinkWrite: () => ({ isError: false, isPending: answer.pending, mutate: (input: { target: unknown }) => writes.push(input.target) }),
}));
vi.mock('../../hooks/useMiConfig', () => ({
  useMiConfig: () => ({ data: { envVars: answer.envVars, secrets: [], legacySecrets: [], shadowedLegacySecrets: [] }, isLoading: false, isError: false }),
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
  Object.assign(answer, { links: undefined, pending: false, readFailed: false, cached: true, refetches: 0, envVars: [{ key: 'DB_URL', value: 'jdbc:x' }] });
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

  it("shows workload.yaml's declarations read-only, with no link icons, when the repository declares the resources", async () => {
    answer.links = { ...links, env: {}, used: {}, sourceDefined: true, declared: { GITHUB_TOKEN: github } };
    await render('development');
    expect(document.body.textContent).toContain('Links come from workload.yaml in the repository.');
    expect(document.body.textContent).not.toContain('Links apply to all environments');
    expect(supplied('GITHUB_TOKEN')).toBe('from workload.yaml (GitHub Acme · GITHUB_AUTH_TOKEN)');
    expect(document.querySelectorAll('[aria-label^="Link "]')).toHaveLength(0);
    expect((document.querySelector('[aria-label="Remove GITHUB_TOKEN"]') as HTMLButtonElement).disabled).toBe(true);
  });

  it("lists what production's release runs after development's workload.yaml renamed a variable", async () => {
    answer.links = { ...links, env: {}, used: {}, sourceDefined: true, declared: { NEW_TOKEN: github } };
    await render('production');
    expect(supplied('GITHUB_TOKEN')).toBe('from workload.yaml (GitHub Acme · GITHUB_AUTH_TOKEN)');
    expect(Array.from(document.querySelectorAll('input')).map((i) => i.value)).not.toContain('NEW_TOKEN');
  });

  it('opens clean, Save disabled, when a linked variable also has a stored empty value', async () => {
    answer.envVars = [
      { key: 'GITHUB_TOKEN', value: '' },
      { key: 'DB_URL', value: 'jdbc:x' },
    ];
    await render('development');
    expect(supplied('GITHUB_TOKEN')).toBe('from GitHub Acme · GITHUB_AUTH_TOKEN');
    expect(Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Save')?.disabled).toBe(true);
  });

  it('offers no link action while a link write is on its way', async () => {
    answer.pending = true;
    await render('development');
    const disabled = (label: string) => (document.querySelector(`[aria-label="${label}"]`) as HTMLButtonElement).disabled;
    expect(['Link GITHUB_TOKEN', 'Link DB_URL', 'Remove GITHUB_TOKEN'].map(disabled)).toEqual([true, true, true]);
  });

  it("says the links couldn't be read, with Try again, in place of the rows", async () => {
    Object.assign(answer, { readFailed: true, cached: false });
    await render('development');
    expect(document.body.textContent).toContain("Couldn't read this integration's links.");
    expect(document.querySelector('[aria-label="Link DB_URL"]')).toBeNull();
    const tryAgain = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Try again')!;
    await act(async () => tryAgain.click());
    expect(answer.refetches).toBe(1);
  });

  it('keeps the links of the last read, marked as not refreshed, with no link action', async () => {
    answer.readFailed = true;
    await render('development');
    expect(document.body.textContent).toContain("Couldn't refresh this integration's links. These are from the last read.");
    expect(supplied('GITHUB_TOKEN')).toBe('from GitHub Acme · GITHUB_AUTH_TOKEN');
    expect((document.querySelector('[aria-label="Link DB_URL"]') as HTMLButtonElement).disabled).toBe(true);
    // A changed value can't be saved until the links read.
    const value = Array.from(document.querySelectorAll('input')).find((i) => i.value === 'jdbc:x')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(value, 'jdbc:y');
      value.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Save')?.disabled).toBe(true);
  });
});
