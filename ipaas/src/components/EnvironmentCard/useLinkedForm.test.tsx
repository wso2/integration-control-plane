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
import type { ConnectableEndpoint, IntegrationLinks } from '../../types/configuration';
import type { JSONSchema } from '../../types/schema';
import { ConfigForm } from '../SchemaConfigForm/ConfigForm';
import { addressableFields, linkableFields, schemaFields } from '../SchemaConfigForm/schemaUtils';
import { useLinkedForm } from './useLinkedForm';

// ipaas-service's answer: github linked to GitHub Acme; ordersDbUrl's link lost its target when the code renamed it.
const id = (name: string) => `acme/ghdemo:${name}`;
const links: IntegrationLinks = {
  kind: 'ballerina',
  resources: [
    { id: 'github-acme', displayName: 'GitHub Acme', keys: [{ name: 'GITHUB_AUTH_TOKEN', secret: true }], valuesIn: ['development'] },
    { id: 'orders-db', displayName: 'orders-db', keys: [{ name: 'URL', secret: false }], valuesIn: ['development'] },
    { id: 'github-sandbox', displayName: 'GitHub Sandbox', keys: [{ name: 'GITHUB_AUTH_TOKEN', secret: true }], valuesIn: ['development'] },
    { id: 'github-corp', displayName: 'GitHub Corp', keys: [{ name: 'GITHUB_AUTH_TOKEN', secret: true }], valuesIn: ['development'] },
  ],
  used: { 'github-acme|GITHUB_AUTH_TOKEN': id('githubAuthToken'), 'github-corp|GITHUB_AUTH_TOKEN': id('otherToken') },
  usedByOrphaned: { 'orders-db|URL': id('ordersDbUrl') },
  connections: [
    { id: id('github'), link: 'github-acme', suggestions: ['github-acme', 'github-sandbox', 'github-corp'], fields: [{ configurable: id('githubAuthToken'), key: 'GITHUB_AUTH_TOKEN' }] },
    { id: id('backup'), suggestions: ['github-sandbox', 'github-corp'], fields: [{ configurable: id('backupToken') }] },
  ],
  fieldLinks: {},
  endpointLinks: {},
  orphaned: [{ target: id('ordersDbUrl'), kind: 'configurable', ref: 'orders-db', key: 'URL' }],
  env: {},
  environments: [{ name: 'development', deployed: true, resources: [], valuesChanged: false, linksNeedDeploy: false, connections: {}, configurables: {}, env: {} }],
};
const writes = vi.hoisted(() => [] as unknown[]);
const answer = vi.hoisted(() => ({ links: undefined as IntegrationLinks | undefined, pending: false, readFailed: false, cached: true, refetches: 0, connectable: [] as ConnectableEndpoint[], connectableFailed: false }));
const failed = vi.hoisted(() => ({ current: undefined as { error: Error; variables: { target: unknown } } | undefined }));
vi.mock('../../hooks/useConfiguration', () => ({
  useIntegrationLinks: () => ({
    data: answer.cached ? (answer.links ?? links) : undefined,
    isError: answer.readFailed,
    isLoading: false,
    isFetching: false,
    refetch: async () => void answer.refetches++,
  }),
  useConnectableEndpoints: () => ({ data: answer.connectable, isError: answer.connectableFailed, isFetching: false, refetch: async () => undefined }),
  useLinkWrite: () => ({ isPending: answer.pending, isError: !!failed.current, ...failed.current, mutateAsync: async (input: { target: unknown }) => void writes.push(input.target) }),
}));
vi.mock('../../hooks/useEnvironments', () => ({ useEnvironments: () => ({ data: [{ id: 'development', name: 'Development' }] }) }));

const schema = {
  type: 'object',
  requiredLevel: 3,
  properties: {
    acme: {
      type: 'object',
      properties: {
        ghdemo: {
          type: 'object',
          required: ['githubAuthToken', 'ordersDatabaseUrl'],
          properties: { githubAuthToken: { type: 'string', description: '' }, ordersDatabaseUrl: { type: 'string', description: '' }, backupToken: { type: 'string', description: '' } },
        },
      },
    },
  },
} as unknown as JSONSchema;

function Form({ env = 'development', form = schema }: { env?: string; form?: JSONSchema }) {
  const linked = useLinkedForm('default', 'ghdemo', env, true, linkableFields(form), addressableFields(form));
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

// linkedKeys decides which fields the form treats as supplied: it skips their validation and
// does not save a value for them. Only the set is of interest, so nothing else is rendered.
function LinkedKeys({ form = schema }: { form?: JSONSchema }) {
  const linked = useLinkedForm('default', 'ghdemo', 'development', true, linkableFields(form), addressableFields(form));
  return <span data-testid="linked-keys">{[...linked.linkedKeys].sort().join(' ')}</span>;
}

let container: HTMLDivElement;
let root: Root;
const button = (label: string) => Array.from(document.querySelectorAll('button')).find((b) => b.getAttribute('aria-label') === label || b.textContent === label) as HTMLButtonElement;

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  writes.length = 0;
  failed.current = undefined;
  answer.links = undefined;
  Object.assign(answer, { pending: false, readFailed: false, cached: true, refetches: 0, connectableFailed: false });
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
  // A configurable filled from an endpoint has no value of its own: its address comes from the
  // Workload dependency, so the form must not ask for one or keep an earlier one.
  it('counts a configurable filled from an endpoint as linked', async () => {
    answer.links = { ...links, endpointLinks: { [id('ordersDatabaseUrl')]: 'default/basket/items' } };
    await act(async () => root.render(<LinkedKeys />));

    expect(container.querySelector('[data-testid="linked-keys"]')?.textContent?.split(' ')).toContain('acme.ghdemo.ordersDatabaseUrl');
  });

  it("shows a connection's box with its link and Unlink, and fills its field from the link", async () => {
    expect(container.textContent).toContain('githubLinked to GitHub Acme');
    expect((container.querySelector('input[aria-label="githubAuthToken is supplied by GitHub Acme"]') as HTMLInputElement).value).toBe('from GitHub Acme · GITHUB_AUTH_TOKEN');
    await act(async () => button('Unlink github').click());
    expect(writes).toEqual([{ connection: id('github') }]);
  });

  it("offers the resources that suit an unlinked connection in its title bar, leaving a used key to the service's refusal", async () => {
    const select = container.querySelector('[aria-label="Link backup"]') as HTMLElement;
    expect(select.textContent).toBe('Link… (2 match)');
    await act(async () => select.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
    const options = Array.from(document.querySelectorAll('[role="option"]'));
    expect(options.map((o) => [o.textContent, o.getAttribute('aria-disabled')])).toEqual([
      ['GitHub Sandbox', null],
      ['GitHub Corp', null],
    ]);
    await act(async () => (options[0] as HTMLElement).click());
    expect(writes).toEqual([{ connection: id('backup'), ref: 'github-sandbox' }]);
  });

  it("offers a linked connection's other resources, except one whose key another target uses", async () => {
    await act(async () => (container.querySelector('[aria-label="Link github"]') as HTMLElement).dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
    expect(Array.from(document.querySelectorAll('[role="option"]')).map((o) => [o.textContent, o.getAttribute('aria-disabled')])).toEqual([
      ['GitHub Acme', null],
      ['GitHub Sandbox', null],
      ['GitHub Corp (key in use)', 'true'],
    ]);
  });

  it('offers a resource whose key only a link the build lost holds, as for a renamed connection', async () => {
    const [used, usedByOrphaned] = [links.used, links.usedByOrphaned];
    const { 'github-corp|GITHUB_AUTH_TOKEN': _, ...rest } = used;
    Object.assign(links, { used: rest, usedByOrphaned: { ...usedByOrphaned, 'github-corp|GITHUB_AUTH_TOKEN': id('ordersDbUrl') } });
    try {
      await act(async () => root.render(<Form />));
      await act(async () => (container.querySelector('[aria-label="Link github"]') as HTMLElement).dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
      expect(Array.from(document.querySelectorAll('[role="option"]')).map((o) => [o.textContent, o.getAttribute('aria-disabled')])).toEqual([
        ['GitHub Acme', null],
        ['GitHub Sandbox', null],
        ['GitHub Corp', null],
      ]);
    } finally {
      Object.assign(links, { used, usedByOrphaned });
    }
  });

  it('offers no link action while a link write is on its way', async () => {
    answer.pending = true;
    await act(async () => root.render(<Form />));
    const actions = ['Link githubAuthToken', 'Link ordersDatabaseUrl', 'Unlink github', 'Move', 'Remove'].map(button);
    expect(actions.map((b) => [b.getAttribute('aria-label') ?? b.textContent, b.disabled])).toEqual([
      ['Link githubAuthToken', true],
      ['Link ordersDatabaseUrl', true],
      ['Unlink github', true],
      ['Move', true],
      ['Remove', true],
    ]);
    expect(container.querySelector('[aria-label="Link backup"]')?.getAttribute('aria-disabled')).toBe('true');
  });

  it("says the links couldn't be read, with Try again, and offers no link action or save", async () => {
    Object.assign(answer, { readFailed: true, cached: false });
    const Read = () => {
      const linked = useLinkedForm('default', 'ghdemo', 'development', true, [], []);
      return (
        <>
          {linked.top}
          <span>{`missing ${linked.linksMissing} unread ${linked.linksUnread}`}</span>
        </>
      );
    };
    await act(async () => root.render(<Read />));
    expect(container.textContent).toBe("Couldn't read this integration's links.Try againmissing true unread true");
    await act(async () => button('Try again').click());
    expect(answer.refetches).toBe(1);
  });

  it('keeps the links of the last read, marked as not refreshed, with no link action', async () => {
    answer.readFailed = true;
    await act(async () => root.render(<Form />));
    expect(container.textContent).toContain("Couldn't refresh this integration's links. These are from the last read.");
    expect(container.textContent).toContain('githubLinked to GitHub Acme');
    expect(['Link githubAuthToken', 'Link ordersDatabaseUrl', 'Unlink github', 'Move', 'Remove'].map((l) => button(l).disabled)).toEqual([true, true, true, true, true]);
    expect(container.querySelector('[aria-label="Link backup"]')?.getAttribute('aria-disabled')).toBe('true');
  });

  it("offers a link icon on a simple-typed configurable only, not on a record's members", async () => {
    const withRecord = {
      type: 'object',
      requiredLevel: 3,
      properties: {
        acme: {
          type: 'object',
          properties: {
            ghdemo: {
              type: 'object',
              required: ['ordersDatabaseUrl', 'database'],
              properties: {
                ordersDatabaseUrl: { type: 'string', description: '' },
                database: { type: 'object', description: '', required: ['host'], properties: { host: { type: 'string', description: '' } } },
              },
            },
          },
        },
      },
    } as unknown as JSONSchema;
    await act(async () => root.render(<Form form={withRecord} />));
    expect(linkableFields(withRecord)).toEqual(['acme.ghdemo.ordersDatabaseUrl']);
    // The record's member renders as a value box of its own.
    expect(container.textContent).toContain('host');
    expect(Array.from(container.querySelectorAll('button[aria-label^="Link "]')).map((b) => b.getAttribute('aria-label'))).toEqual(['Link ordersDatabaseUrl']);
  });

  it('links a boolean configurable from its link icon', async () => {
    const withBoolean = {
      type: 'object',
      requiredLevel: 3,
      properties: { acme: { type: 'object', properties: { ghdemo: { type: 'object', required: ['ordersVerbose'], properties: { ordersVerbose: { type: 'boolean', description: '' } } } } } },
    } as unknown as JSONSchema;
    await act(async () => root.render(<Form form={withBoolean} />));
    await act(async () => button('Link ordersVerbose').click());
    await act(async () => (Array.from(document.querySelectorAll('[aria-label="Source of ordersVerbose"] li')).find((li) => li.textContent?.startsWith('URL')) as HTMLElement).click());
    expect(writes).toEqual([{ configurable: id('ordersVerbose'), ref: 'orders-db', key: 'URL' }]);
  });

  // An endpoint supplies one address. A boolean cannot hold one, so offering it would only ever
  // produce a write that puts a URL where the build expects true or false.
  it('offers no endpoint for a key that cannot hold an address', async () => {
    answer.connectable = [{ project: 'shop', component: 'basket', endpoint: 'items', displayName: 'Basket', scope: 'project', environments: [{ name: 'development', connectable: true }] }];
    const withBoolean = {
      type: 'object',
      requiredLevel: 3,
      properties: { acme: { type: 'object', properties: { ghdemo: { type: 'object', required: ['ordersVerbose'], properties: { ordersVerbose: { type: 'boolean', description: '' } } } } } },
    } as unknown as JSONSchema;
    try {
      await act(async () => root.render(<Form form={withBoolean} />));
      await act(async () => button('Link ordersVerbose').click());
      const options = Array.from(document.querySelectorAll('[aria-label="Source of ordersVerbose"] li')).map((o) => o.textContent);
      expect(options).not.toContain('Basket \u00b7 items');
      expect(options.some((o) => o?.startsWith('URL'))).toBe(true);
    } finally {
      answer.connectable = [];
    }
  });

  // A library's settings configure the runtime, not the integration, so no link fills one.
  it('offers no link for a library setting, and still shows one it holds', async () => {
    const withLibrary = {
      type: 'object',
      requiredLevel: 3,
      properties: {
        acme: { type: 'object', properties: { ghdemo: { type: 'object', required: ['ordersDatabaseUrl'], properties: { ordersDatabaseUrl: { type: 'string', description: '' } } } } },
        ballerina: { type: 'object', properties: { log: { type: 'object', properties: { level: { type: 'string', description: '' } } } } },
      },
    } as unknown as JSONSchema;
    expect(linkableFields(withLibrary)).toEqual(['acme.ghdemo.ordersDatabaseUrl']);

    answer.links = { ...links, fieldLinks: { 'ballerina/log:level': { ref: 'orders-db', key: 'URL' } } };
    await act(async () => root.render(<Form form={withLibrary} />));
    expect(Array.from(container.querySelectorAll('button[aria-label^="Link "]')).map((b) => b.getAttribute('aria-label'))).toEqual(['Link ordersDatabaseUrl']);
    expect(container.textContent).toContain('from orders-db \u00b7 URL');
  });

  // Another project's endpoint is reached as a connection feeding several values, and no name says
  // which one a field wants, so the pick names it. Picking makes the connection and links in one step.
  it("fills a field from another project's integration by the output it picks", async () => {
    answer.connectable = [
      {
        project: 'library',
        component: 'catalog',
        endpoint: 'books',
        displayName: 'Catalog',
        scope: 'organization',
        outputs: [
          { name: 'url', secret: false },
          { name: 'apiKeyHeader', secret: false },
          { name: 'apiKey', secret: true },
        ],
        environments: [{ name: 'development', connectable: true }],
      },
    ];
    try {
      await act(async () => root.render(<Form />));
      await act(async () => button('Link ordersDatabaseUrl').click());
      const options = Array.from(document.querySelectorAll('[aria-label="Source of ordersDatabaseUrl"] li')).map((o) => o.textContent);
      expect(options).toContain('Catalog \u00b7 books');
      expect(options).toEqual(expect.arrayContaining(['url', 'apiKeyHeader', 'apiKey']));

      await act(async () => (Array.from(document.querySelectorAll('[aria-label="Source of ordersDatabaseUrl"] li')).find((li) => li.textContent === 'url') as HTMLElement).click());
      expect(writes).toEqual([{ configurable: id('ordersDatabaseUrl'), endpoint: 'library/catalog/books', key: 'url' }]);
    } finally {
      answer.connectable = [];
    }
  });

  // Once a connection stands for it, the endpoint is an ordinary resource with its outputs as keys:
  // offering it here as well would list the same integration twice.
  it("offers no endpoint for another project's integration a connection already stands for", async () => {
    answer.connectable = [
      { project: 'library', component: 'catalog', endpoint: 'books', displayName: 'Catalog', scope: 'organization', ref: 'library-catalog-f1fe', outputs: [{ name: 'url', secret: false }], environments: [{ name: 'development', connectable: true }] },
    ];
    try {
      await act(async () => root.render(<Form />));
      await act(async () => button('Link ordersDatabaseUrl').click());
      const options = Array.from(document.querySelectorAll('[aria-label="Source of ordersDatabaseUrl"] li')).map((o) => o.textContent);
      expect(options).not.toContain('Catalog \u00b7 books');
    } finally {
      answer.connectable = [];
    }
  });

  // A link write replaces what feeds the field, so a value typed while one is on its way would be
  // overwritten by it or overwrite it, depending which landed last.
  it('takes no value and no link while a link write is on its way', async () => {
    answer.pending = true;
    try {
      await act(async () => root.render(<Form />));
      expect(button('Link ordersDatabaseUrl').disabled).toBe(true);
      const values = Array.from(container.querySelectorAll('input[placeholder="Enter a value"]'));
      expect(values.length).toBeGreaterThan(0);
      expect(values.filter((i) => !(i as HTMLInputElement).disabled)).toEqual([]);
    } finally {
      answer.pending = false;
    }
  });

  // Both groups render empty on a failed read, which otherwise reads as having no integration to call —
  // the shape of a bug nobody reports.
  it("says it couldn't read the integrations this one can call", async () => {
    answer.connectableFailed = true;
    await act(async () => root.render(<Form />));
    expect(container.textContent).toContain("Couldn't read the integrations this one can call");
  });

  it('links a field to the key picked from its link icon', async () => {
    await act(async () => button('Link ordersDatabaseUrl').click());
    await act(async () => (Array.from(document.querySelectorAll('[aria-label="Source of ordersDatabaseUrl"] li')).find((li) => li.textContent === 'Enter a value') as HTMLElement).click());
    expect(writes).toEqual([{ configurable: id('ordersDatabaseUrl') }]);
  });

  it('fills a field from an integration of this project, which takes no key', async () => {
    answer.connectable = [
      { project: 'shop', component: 'basket', endpoint: 'items', displayName: 'Basket', scope: 'project', environments: [{ name: 'development', connectable: true }] },
      { project: 'library', component: 'catalog', endpoint: 'books', displayName: 'Catalog', scope: 'organization', environments: [{ name: 'development', connectable: true }] },
    ];
    try {
      await act(async () => root.render(<Form />));
      await act(async () => button('Link ordersDatabaseUrl').click());
      const options = Array.from(document.querySelectorAll('[aria-label="Source of ordersDatabaseUrl"] li'));
      expect(options.map((o) => o.textContent)).toContain('Basket \u00b7 items');
      await act(async () => (options.find((o) => o.textContent === 'Basket \u00b7 items') as HTMLElement).click());
      expect(writes).toEqual([{ configurable: id('ordersDatabaseUrl'), endpoint: 'shop/basket/items' }]);
    } finally {
      answer.connectable = [];
    }
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

  // An endpoint link holds no resource key, so a Move could only produce a write the BFF refuses.
  it('offers only Remove for an endpoint link the build lost', async () => {
    answer.links = { ...links, usedByOrphaned: {}, orphaned: [{ target: id('ordersDbUrl'), kind: 'endpoint', ref: 'default/basket/items' }] };
    await act(async () => root.render(<Form />));

    expect(container.textContent).toContain('ordersDbUrl is no longer in the code');
    expect(container.querySelector('[aria-label="Move ordersDbUrl to"]')).toBeNull();
    expect(button('Move')).toBeUndefined();
    await act(async () => button('Remove').click());
    expect(writes).toEqual([{ configurable: id('ordersDbUrl') }]);
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
    const Unread = ({ env }: { env: string }) => <>{useLinkedForm('default', 'ghdemo', env, true, [], []).unread ?? 'none'}</>;
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
