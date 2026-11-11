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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ConfigEditor, { type EditorContext } from './ConfigEditor';
import { BffError } from '../../api/_client';
import { button, renderWithScopes } from '../../test/renderWithScopes';
import type { ConfigRow } from '../../types/devopsConfigs';
import type { PlanAccess } from '../../utils/billing';

let plan: PlanAccess | null = { state: 'free' };
const mutate = vi.fn();
vi.mock('../../hooks/useBillingOrg', () => ({ usePlanAccess: () => plan }));
vi.mock('../../hooks/useDevopsConfigs', () => ({
  useConfigMapDetails: () => ({ data: undefined }),
  useSaveConfig: () => ({ mutate, isPending: false }),
}));
vi.mock('../../contexts/UnsavedChangesContext', () => ({ useUnsavedChanges: () => () => {}, useLeaveGuard: () => (proceed: () => void) => proceed() }));

const ctx: EditorContext = { projectId: 'p', componentId: 'c', releaseId: 'r', containerId: 'dev', envId: 'dev', deploymentTrackId: 't' };

let unmount = () => {};
let container: HTMLElement;
beforeEach(() => {
  plan = { state: 'free' };
  mutate.mockReset();
});
afterEach(() => unmount());

async function render(props: Partial<Parameters<typeof ConfigEditor>[0]> = {}) {
  const r = await renderWithScopes(<ConfigEditor ctx={ctx} onBack={() => {}} onSaved={() => {}} onError={() => {}} {...props} />, []);
  unmount = r.unmount;
  container = r.container;
}

const input = (label: string) =>
  container.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[aria-label="${label}"]`) ?? [...container.querySelectorAll('label')].find((l) => l.textContent?.replace('*', '').trim() === label)?.parentElement?.querySelector<HTMLInputElement>('input');

function type(el: HTMLInputElement | HTMLTextAreaElement | null | undefined, value: string) {
  if (!el) throw new Error('no such field');
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  act(() => {
    Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

const click = (el: Element | null | undefined) => act(() => (el as HTMLElement).click());
const text = () => container.textContent ?? '';
const chooseFileMount = () => click([...container.querySelectorAll('[role="radio"]')].find((c) => c.textContent?.includes('File mount')));
const upgradeLink = () => [...container.querySelectorAll('a')].find((a) => a.textContent === 'Upgrade');

const envRow = (name: string, keys: string[]): ConfigRow => ({
  mount: { ID: name, configmap_id: name, secret_id: null, container_id: 'dev', app_environment_id: 'r', mount_path: '', config_key: '', mount_type: 'ENVFile', mount_permissions: '0000' },
  isSecret: false,
  kind: 'envVars',
  name,
  keys,
});

const fileRow = (name: string, dir: string): ConfigRow => ({
  mount: { ID: name, configmap_id: name, secret_id: null, container_id: 'dev', app_environment_id: 'r', mount_path: dir, config_key: 'data', mount_type: 'File', mount_permissions: '0644' },
  isSecret: false,
  kind: 'fileMount',
  name,
  keys: [],
});

const keys = (n: number) => Array.from({ length: n }, (_, i) => `K${i}`);

describe('ConfigEditor plan limits', () => {
  it('stops a sixth env-var group on the free plan and links to the upgrade', async () => {
    await render({ envGroupCount: 5 });
    expect(text()).toContain('The free plan allows 5 environment variable groups per environment');
    expect(upgradeLink()).toBeDefined();
    type(input('Group name'), 'db');
    type(input('New key'), 'HOST');
    expect(button(container, 'Add variables')?.disabled).toBe(true);
  });

  it('lets a paid plan add a sixth group', async () => {
    plan = { state: 'paid' };
    await render({ envGroupCount: 5 });
    type(input('Group name'), 'db');
    type(input('New key'), 'HOST');
    expect(text()).not.toContain('The free plan allows');
    expect(button(container, 'Add variables')?.disabled).toBe(false);
  });

  it('leaves the limits to the service while the plan is unknown', async () => {
    plan = null;
    await render({ envGroupCount: 5, plainFileCount: 2 });
    expect(text()).not.toContain('The free plan allows');
  });

  it('stops adding a 21st variable to a group on the free plan', async () => {
    await render({ existing: envRow('db', keys(20)) });
    expect(text()).toContain('20 / 20');
    expect(input('New key')?.disabled).toBe(true);
    expect(text()).toContain('This group has the most variables the plan allows (20).');
  });

  it('lets a group stored with more variables than the limit be saved, but not grow', async () => {
    await render({ existing: envRow('db', keys(25)) });
    expect(text()).toContain('25 / 25');
    expect(text()).not.toContain('The free plan allows');
  });

  it('refuses a value over 4 KB on any plan', async () => {
    plan = { state: 'paid' };
    await render();
    type(input('Group name'), 'certs');
    type(input('New key'), 'CERT');
    type(input('New value'), 'x'.repeat(4 * 1024 + 1));
    click(button(container, 'Add'));
    expect(text()).toContain('Longer than 4 KB');
    expect(button(container, 'Add variables')?.disabled).toBe(true);
  });

  it('stops a third non-secret file on the free plan, but not a secret one', async () => {
    await render({ plainFileCount: 2 });
    chooseFileMount();
    expect(text()).toContain("The free plan allows 2 non-secret files per environment; secret files don't count.");
    click(container.querySelector('[aria-labelledby="config-secret-label"]'));
    expect(text()).not.toContain('The free plan allows');
  });

  it('refuses a file over 150 KB', async () => {
    plan = { state: 'paid' };
    await render();
    chooseFileMount();
    type(input('File name'), 'big.json');
    type(input('Mount directory'), '/app');
    type(input('File content'), 'x'.repeat(150 * 1024 + 1));
    expect(text()).toContain('150.0 KB of 150 KB — too large');
    expect(button(container, 'Add file')?.disabled).toBe(true);
  });

  it('shows a limit the service refuses with 402 next to the form, with the upgrade link', async () => {
    plan = null;
    mutate.mockImplementation((_input, opts: { onError: (e: unknown) => void }) =>
      opts.onError(new BffError(402, JSON.stringify({ message: 'plan limit reached: the free plan allows at most 5 environment variable groups per environment. Upgrade your subscription for more' }))),
    );
    const onError = vi.fn();
    await render({ onError });
    type(input('Group name'), 'db');
    type(input('New key'), 'HOST');
    click(button(container, 'Add variables'));
    expect(text()).toContain('Plan limit reached: the free plan allows at most 5 environment variable groups per environment.');
    expect(upgradeLink()).toBeDefined();
    expect(onError).not.toHaveBeenCalled();
  });
});

describe('ConfigEditor file mounts', () => {
  it('asks for a file name and a directory, and shows where the file lands', async () => {
    await render();
    chooseFileMount();
    expect(text()).not.toContain('Display name');
    type(input('File name'), 'config.json');
    type(input('Mount directory'), '/app/configs');
    expect(text()).toContain('Mounted at/app/configs/config.json');
    type(input('File content'), '{}');
    click(button(container, 'Add file'));
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ kind: 'fileMount', name: 'config.json', mountPath: '/app/configs', data: { data: '{}' } }), expect.anything());
  });

  it('refuses a file name Kubernetes would refuse', async () => {
    await render();
    chooseFileMount();
    type(input('File name'), 'File Size Exceed');
    expect(text()).toContain('Use letters, numbers, dots, hyphens and underscores, e.g. config.json.');
  });

  it('keeps an existing file where it is, and says how to move it', async () => {
    await render({ existing: fileRow('config.json', '/app/configs') });
    expect(input('File name')?.disabled).toBe(true);
    expect(input('Mount directory')?.disabled).toBe(true);
    expect(text()).toContain('Mounted at/app/configs/config.json');
    expect(text()).toContain('To rename or move the file, remove it and add it again.');
  });

  it('says a stored file with an invalid name has to be removed', async () => {
    await render({ existing: fileRow('File Size Exceed', '/stranger/things/build.txt') });
    expect(text()).toContain('is not a valid file name');
    type(input('File content'), 'new');
    expect(button(container, 'Save changes')?.disabled).toBe(true);
  });
});
