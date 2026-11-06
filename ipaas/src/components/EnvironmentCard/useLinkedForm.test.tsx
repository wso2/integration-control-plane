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
import { BffError } from '../../api/_client';
import type { IntegrationLinks } from '../../types/configuration';
import type { JSONSchema } from '../../types/schema';
import { ConfigForm } from '../SchemaConfigForm/ConfigForm';
import { schemaFields } from '../SchemaConfigForm/schemaUtils';
import { useLinkedForm } from './useLinkedForm';

// ipaas-service's answer: github linked to GitHub Acme; ordersDbUrl's link lost its target when the code renamed it.
const id = (name: string) => `acme/ghdemo:${name}`;
const links: IntegrationLinks = {
  kind: 'ballerina',
  resources: [
    { id: 'github-acme', displayName: 'GitHub Acme', keys: [{ name: 'GITHUB_AUTH_TOKEN', secret: true }], valuesIn: ['development'] },
    { id: 'orders-db', displayName: 'orders-db', keys: [{ name: 'URL', secret: false }], valuesIn: ['development'] },
  ],
  used: { 'github-acme|GITHUB_AUTH_TOKEN': id('githubAuthToken') },
  usedByOrphaned: { 'orders-db|URL': id('ordersDbUrl') },
  connections: [{ id: id('github'), link: 'github-acme', suggestions: [], fields: [{ configurable: id('githubAuthToken'), key: 'GITHUB_AUTH_TOKEN' }] }],
  fieldLinks: {},
  orphaned: [{ target: id('ordersDbUrl'), kind: 'configurable', ref: 'orders-db', key: 'URL' }],
  env: {},
  environments: [{ name: 'development', deployed: true, resources: [], valuesChanged: false, linksNeedDeploy: false, connections: {}, configurables: {}, env: {} }],
};
const writes = vi.hoisted(() => [] as unknown[]);
const answer = vi.hoisted(() => ({ links: undefined as IntegrationLinks | undefined }));
const failed = vi.hoisted(() => ({ current: undefined as { error: Error; variables: { target: unknown } } | undefined }));
vi.mock('../../hooks/useConfiguration', () => ({
  useIntegrationLinks: () => ({ data: answer.links ?? links }),
  useLinkWrite: () => ({ isPending: false, isError: !!failed.current, ...failed.current, mutateAsync: async (input: { target: unknown }) => void writes.push(input.target) }),
}));
vi.mock('../../hooks/useEnvironments', () => ({ useEnvironments: () => ({ data: [{ id: 'development', name: 'Development' }] }) }));

const schema = {
  type: 'object',
  requiredLevel: 3,
  properties: {
    acme: { type: 'object', properties: { ghdemo: { type: 'object', required: ['githubAuthToken', 'ordersDatabaseUrl'], properties: { githubAuthToken: { type: 'string', description: '' }, ordersDatabaseUrl: { type: 'string', description: '' } } } } },
  },
} as unknown as JSONSchema;

function Form({ env = 'development', form = schema }: { env?: string; form?: JSONSchema }) {
  const linked = useLinkedForm(
    'default',
    'ghdemo',
    env,
    true,
    schemaFields(form).map((f) => f.path),
  );
  return (
    <>
      {linked.top}
      <ConfigForm
        schema={form}
        valueMap={new Map()}
        validationMap={new Map()}
        linkingMap={new Map()}
        setLinkingMap={vi.fn()}
        sensitiveMap={new Map()}
        setSensitiveMap={vi.fn()}
        handleValueChange={vi.fn()}
        handleValidationChange={vi.fn()}
        groups={linked.groups}
        fieldLinks={linked.fieldLinks}
      />
    </>
  );
}

let container: HTMLDivElement;
let root: Root;
const button = (label: string) => Array.from(document.querySelectorAll('button')).find((b) => b.getAttribute('aria-label') === label || b.textContent === label) as HTMLButtonElement;

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  writes.length = 0;
  failed.current = undefined;
  answer.links = undefined;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<Form />));
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('the Configure form with links', () => {
  it("shows a connection's box with its link and Unlink, and fills its field from the link", async () => {
    expect(container.textContent).toContain('githubLinked to GitHub Acme');
    expect((container.querySelector('input[aria-label="githubAuthToken is supplied by GitHub Acme"]') as HTMLInputElement).value).toBe('from GitHub Acme · GITHUB_AUTH_TOKEN');
    await act(async () => button('Unlink github').click());
    expect(writes).toEqual([{ connection: id('github') }]);
  });

  it('links a field to the key picked from its link icon', async () => {
    await act(async () => button('Link ordersDatabaseUrl').click());
    await act(async () => (Array.from(document.querySelectorAll('[aria-label="Source of ordersDatabaseUrl"] li')).find((li) => li.textContent === 'Enter a value') as HTMLElement).click());
    expect(writes).toEqual([{ configurable: id('ordersDatabaseUrl') }]);
  });

  it('offers a key a link the build lost holds, and takes it in one write', async () => {
    await act(async () => button('Link ordersDatabaseUrl').click());
    const url = Array.from(document.querySelectorAll('[aria-label="Source of ordersDatabaseUrl"] li')).find((li) => li.textContent?.startsWith('URL')) as HTMLElement;
    expect([url.textContent, url.getAttribute('aria-disabled')]).toEqual(['URLfrom ordersDbUrl, no longer in the code', null]);
    await act(async () => url.click());
    expect(writes).toEqual([{ configurable: id('ordersDatabaseUrl'), ref: 'orders-db', key: 'URL' }]);
  });

  it('tries a write that failed partway again', async () => {
    failed.current = { error: new Error("Unlinking didn't finish."), variables: { target: { connection: id('github') } } };
    await act(async () => root.render(<Form />));
    expect(container.textContent).toContain("Unlinking didn't finish.");
    await act(async () => button('Try again').click());
    expect(writes).toEqual([{ connection: id('github') }]);
  });

  it('offers no retry of a refusal', async () => {
    failed.current = { error: new BffError(409, JSON.stringify({ message: 'GitHub Acme · GITHUB_AUTH_TOKEN is already used by githubAuthToken.' })), variables: { target: { connection: id('github'), ref: 'github-acme' } } };
    await act(async () => root.render(<Form />));
    expect(container.textContent).toContain('GitHub Acme · GITHUB_AUTH_TOKEN is already used by githubAuthToken.');
    expect(button('Try again')).toBeUndefined();
  });

  it('moves a link the build lost to the field it names now', async () => {
    expect(container.textContent).toContain('ordersDbUrl is no longer in the code');
    await act(async () => (container.querySelector('[aria-label="Move ordersDbUrl to"]') as HTMLElement).dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
    await act(async () => (Array.from(document.querySelectorAll('li')).find((li) => li.textContent === 'ordersDatabaseUrl') as HTMLElement).click());
    await act(async () => button('Move').click());
    expect(writes).toEqual([{ configurable: id('ordersDatabaseUrl'), ref: 'orders-db', key: 'URL' }]);
  });

  it("shows production's sections from the build it runs, not the Workload's renamed one", async () => {
    // Development's build renamed github to gh; production runs the build with github and ordersDbUrl, linked to GitHub Acme.
    answer.links = {
      ...links,
      used: { 'github-acme|GITHUB_AUTH_TOKEN': id('ghAuthToken') },
      usedByOrphaned: {},
      connections: [{ id: id('gh'), link: 'github-acme', suggestions: [], fields: [{ configurable: id('ghAuthToken'), key: 'GITHUB_AUTH_TOKEN' }] }],
      orphaned: [{ target: id('github'), kind: 'connection', ref: 'github-acme' }],
      environments: [links.environments[0], { ...links.environments[0], name: 'production', connections: { [id('github')]: 'github-acme' }, configurables: { [id('githubAuthToken')]: { ref: 'github-acme', key: 'GITHUB_AUTH_TOKEN' } } }],
    };
    const released = {
      type: 'object',
      requiredLevel: 3,
      properties: { acme: { type: 'object', properties: { ghdemo: { type: 'object', required: ['githubAuthToken'], properties: { githubAuthToken: { type: 'string', description: '' }, ordersDbUrl: { type: 'string', description: '' } } } } } },
    } as unknown as JSONSchema;
    await act(async () => root.render(<Form env="production" form={released} />));
    const titles = Array.from(container.querySelectorAll('.MuiTypography-subtitle2')).map((t) => t.textContent);
    expect(titles).toEqual(['github', 'Other configurables']);
    expect(container.textContent).toContain('This release uses GitHub Acme. Change links in Development.');
    expect(container.textContent).not.toContain('The link is now');
    // githubAuthToken sits in the github section, before Other configurables.
    const [section, other] = ['github', 'Other configurables'].map((t) => Array.from(container.querySelectorAll('.MuiTypography-subtitle2')).find((x) => x.textContent === t)!);
    const field = container.querySelector('input[aria-label="githubAuthToken is supplied by GitHub Acme"]') as HTMLInputElement;
    expect(field.value).toBe('from GitHub Acme · GITHUB_AUTH_TOKEN');
    expect(section.compareDocumentPosition(field) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(field.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("says production's schema couldn't be read, naming the environment, and not the first environment's", async () => {
    const Unread = ({ env }: { env: string }) => <>{useLinkedForm('default', 'ghdemo', env, true, []).unread ?? 'none'}</>;
    answer.links = { ...links, environments: [links.environments[0], { ...links.environments[0], name: 'production' }] };
    await act(async () => root.render(<Unread env="production" />));
    expect(container.textContent).toBe("Couldn't read the configurables of the build production runs.");
    await act(async () => root.render(<Unread env="development" />));
    expect(container.textContent).toBe('none');
  });

  it("shows workload.yaml's declarations read-only, with no link icons or link selects, when the repository declares the resources", async () => {
    answer.links = { ...links, sourceDefined: true, declared: { [id('githubAuthToken')]: { ref: 'github-acme', key: 'GITHUB_AUTH_TOKEN' } }, orphaned: [], usedByOrphaned: {} };
    await act(async () => root.render(<Form />));
    expect(container.textContent).toContain('Links come from workload.yaml in the repository.');
    expect((container.querySelector('input[aria-label="githubAuthToken is supplied by GitHub Acme"]') as HTMLInputElement).value).toBe('from workload.yaml (GitHub Acme · GITHUB_AUTH_TOKEN)');
    expect(container.querySelector('[aria-label="Link github"]')).toBeNull();
    expect(container.querySelector('[aria-label="Unlink github"]')).toBeNull();
    expect(container.querySelectorAll('button[aria-label^="Link "]')).toHaveLength(0);
    // Every field but the declared one keeps its value box.
    expect(Array.from(container.querySelectorAll('input')).filter((i) => !i.disabled && i.placeholder === 'Enter a value')).toHaveLength(schemaFields(schema).length - 1);
  });
});
