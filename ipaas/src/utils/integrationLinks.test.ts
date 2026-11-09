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

import { describe, expect, it } from 'vitest';
import type { ConnectableEndpoint, EnvironmentLinks, IntegrationLinks } from '../types/configuration';
import { configKey, configurableId, formLinkView } from './integrationLinks';

// ipaas-service's answer for the mock's ghdemo: connection github; githubAuthToken is the connection's key, githubTimeout has none.
const id = (name: string) => `acme/ghdemo:${name}`;
const environment = (name: string, rest: Partial<EnvironmentLinks> = {}): EnvironmentLinks => ({ name, deployed: true, resources: [], valuesChanged: false, linksNeedDeploy: false, connections: {}, configurables: {}, env: {}, ...rest });
const base: IntegrationLinks = {
  kind: 'ballerina',
  resources: [
    { id: 'github-acme', displayName: 'GitHub Acme', package: 'ballerinax/github', keys: [{ name: 'GITHUB_AUTH_TOKEN', secret: true }], valuesIn: ['development', 'production'] },
    { id: 'github-sandbox', displayName: 'GitHub Sandbox', package: 'ballerinax/github', keys: [{ name: 'GITHUB_AUTH_TOKEN', secret: true }], valuesIn: ['development'] },
    { id: 'github-corp', displayName: 'GitHub Corp', package: 'ballerinax/github', keys: [{ name: 'GITHUB_AUTH_TOKEN', secret: true }], valuesIn: ['development'] },
    {
      id: 'orders-db',
      displayName: 'orders-db',
      keys: [
        { name: 'URL', secret: false },
        { name: 'PASSWORD', secret: true },
      ],
      valuesIn: ['development', 'production'],
    },
  ],
  used: {},
  usedByOrphaned: {},
  connections: [{ id: id('github'), suggestions: ['github-acme', 'github-sandbox', 'github-corp'], fields: [{ configurable: id('githubAuthToken'), key: 'GITHUB_AUTH_TOKEN' }, { configurable: id('githubTimeout') }] }],
  fieldLinks: {},
  endpointLinks: {},
  orphaned: [],
  env: {},
  environments: [environment('development'), environment('production')],
};
const linked: IntegrationLinks = { ...base, connections: [{ ...base.connections[0], link: 'github-acme' }], used: { 'github-acme|GITHUB_AUTH_TOKEN': id('githubAuthToken') } };
const envName = (e: string) => e[0].toUpperCase() + e.slice(1);
// What the project may call: its own basket, deployed in development only, and another project's catalog.
const connectable: ConnectableEndpoint[] = [
  {
    project: 'shop',
    component: 'basket',
    endpoint: 'items',
    displayName: 'Basket',
    scope: 'project',
    environments: [
      { name: 'development', connectable: true },
      { name: 'production', connectable: false, reason: 'not_deployed' },
    ],
  },
  { project: 'library', component: 'catalog', endpoint: 'books', displayName: 'Catalog', scope: 'organization', environments: [{ name: 'development', connectable: true }] },
];
const ghdemoFields = [id('githubAuthToken'), id('githubTimeout')];

describe('configurableId', () => {
  it('names a configurable by its module and name, a submodule joined to its package', () => {
    expect(configurableId('acme.ghdemo.githubAuthToken')).toBe('acme/ghdemo:githubAuthToken');
    expect(configurableId('wso2.sfdemo.support.sfDeskBaseUrl')).toBe('wso2/sfdemo.support:sfDeskBaseUrl');
    expect(configKey('wso2/sfdemo.support:sfDeskBaseUrl')).toBe('wso2.sfdemo.support.sfDeskBaseUrl');
  });
});

describe('formLinkView', () => {
  it("fills a connection's fields from its link, offering the link first in their pickers", () => {
    const view = formLinkView(linked, 'development', envName);
    expect(view.editable).toBe(true);
    expect(view.connections[0].linked?.displayName).toBe('GitHub Acme');
    expect(view.target(id('githubAuthToken')).source).toEqual({ ref: 'github-acme', key: 'GITHUB_AUTH_TOKEN', name: 'GitHub Acme', noValues: false });
    expect(view.target(id('githubAuthToken')).picker).toMatchObject({ first: 'Via selected Link', selected: 'Via selected Link' });
    expect(view.target(id('githubTimeout'))).toMatchObject({ picker: { first: 'Enter a value', selected: 'Enter a value' } });
    expect(view.target(id('githubTimeout')).source).toBeUndefined();
  });

  it('lets a field link beat its connection link, and disables a key another target uses', () => {
    const links: IntegrationLinks = {
      ...linked,
      fieldLinks: { [id('githubAuthToken')]: { ref: 'github-sandbox', key: 'GITHUB_AUTH_TOKEN' }, [id('ordersDbPassword')]: { ref: 'orders-db', key: 'PASSWORD' } },
      used: { 'github-sandbox|GITHUB_AUTH_TOKEN': id('githubAuthToken'), 'orders-db|PASSWORD': id('ordersDbPassword') },
    };
    const view = formLinkView(links, 'development', envName);
    expect(view.target(id('githubAuthToken')).source).toMatchObject({ ref: 'github-sandbox', overrides: true });
    expect(view.target(id('githubAuthToken')).picker?.selected).toBe('github-sandbox|GITHUB_AUTH_TOKEN');
    expect(view.target(id('ordersDbUrl')).picker?.resources.find((r) => r.id === 'orders-db')?.keys).toEqual([{ key: 'URL' }, { key: 'PASSWORD', usedBy: 'ordersDbPassword' }]);
    expect(view.target(id('ordersDbPassword')).picker?.resources.find((r) => r.id === 'orders-db')?.keys[1]).toEqual({ key: 'PASSWORD' });
  });

  it('offers the project\u2019s own integrations, and not another project\u2019s, as a field\u2019s source', () => {
    const view = formLinkView(linked, 'development', envName, ghdemoFields, connectable);
    expect(view.target(id('githubTimeout')).picker?.endpoints).toEqual([{ id: 'shop/basket/items', name: 'Basket \u00b7 items' }]);
  });

  it('offers an integration not deployed where links are changed disabled, saying so', () => {
    const notDeployed: ConnectableEndpoint[] = [{ ...connectable[0], environments: [{ name: 'development', connectable: false, reason: 'not_deployed' }] }];
    const view = formLinkView(linked, 'development', envName, ghdemoFields, notDeployed);
    expect(view.target(id('githubTimeout')).picker?.endpoints).toEqual([{ id: 'shop/basket/items', name: 'Basket \u00b7 items', unavailable: 'not deployed here' }]);
  });

  it('keeps the platform\u2019s own wording for a reason it does not shorten', () => {
    const refused: ConnectableEndpoint[] = [{ ...connectable[0], environments: [{ name: 'development', connectable: false, reason: 'upstream_error', detail: 'the release it runs cannot be read' }] }];
    const view = formLinkView(linked, 'development', envName, ghdemoFields, refused);
    expect(view.target(id('githubTimeout')).picker?.endpoints?.[0].unavailable).toBe('the release it runs cannot be read');
  });

  it('reads an endpoint name that holds a slash', () => {
    const nested: ConnectableEndpoint[] = [{ ...connectable[0], endpoint: 'v1/items' }];
    const links: IntegrationLinks = { ...linked, endpointLinks: { [id('githubTimeout')]: 'shop/basket/v1/items' } };
    const view = formLinkView(links, 'development', envName, ghdemoFields, nested);
    expect(view.target(id('githubTimeout')).source).toMatchObject({ ref: 'shop/basket/v1/items', key: 'v1/items', name: 'Basket' });
  });

  it('says a field filled from an endpoint comes from it, and selects it in the picker', () => {
    const links: IntegrationLinks = { ...linked, endpointLinks: { [id('githubTimeout')]: 'shop/basket/items' } };
    const view = formLinkView(links, 'development', envName, ghdemoFields, connectable);
    expect(view.target(id('githubTimeout')).source).toEqual({ ref: 'shop/basket/items', key: 'items', name: 'Basket', endpoint: true, noValues: false });
    expect(view.target(id('githubTimeout')).picker?.selected).toBe('shop/basket/items');
  });

  it('lets an endpoint beat the key a field\u2019s connection gives it', () => {
    const links: IntegrationLinks = { ...linked, endpointLinks: { [id('githubAuthToken')]: 'shop/basket/items' } };
    const view = formLinkView(links, 'development', envName, ghdemoFields, connectable);
    expect(view.target(id('githubAuthToken')).source).toMatchObject({ ref: 'shop/basket/items', endpoint: true });
  });

  it('shows another environment its release read-only, with the link now', () => {
    const links: IntegrationLinks = {
      ...base,
      connections: [{ ...base.connections[0], link: 'github-corp' }],
      environments: [environment('development'), environment('production', { connections: { [id('github')]: 'github-sandbox' }, configurables: { [id('githubAuthToken')]: { ref: 'github-sandbox', key: 'GITHUB_AUTH_TOKEN' } } })],
    };
    const view = formLinkView(links, 'production', envName, ghdemoFields);
    expect(view.editable).toBe(false);
    expect(view.connections[0].note).toBe('This release uses GitHub Sandbox. The link is now GitHub Corp. Change links in Development.');
    expect(view.target(id('githubAuthToken'))).toEqual({ source: { ref: 'github-sandbox', key: 'GITHUB_AUTH_TOKEN', name: 'GitHub Sandbox', noValues: true } });
  });

  it("names the resources a section's fields receive through their own links in another environment's release", () => {
    const links: IntegrationLinks = {
      ...base,
      environments: [environment('development'), environment('production', { configurables: { [id('githubAuthToken')]: { ref: 'github-sandbox', key: 'GITHUB_AUTH_TOKEN' }, [id('githubTimeout')]: { ref: 'orders-db', key: 'URL' } } })],
    };
    expect(formLinkView(links, 'production', envName, ghdemoFields).connections[0].note).toBe('This release uses GitHub Sandbox, orders-db. Change links in Development.');
    expect(formLinkView({ ...base, environments: [environment('development'), environment('production')] }, 'production', envName, ghdemoFields).connections[0].note).toBe('This release uses no resource. Change links in Development.');
  });

  it("builds another environment's sections from its release's build, where the Workload's build renamed a connection", () => {
    // Development's build renamed github to gh and links gh; production still runs the build with github, linked to GitHub Acme.
    const links: IntegrationLinks = {
      ...base,
      connections: [{ id: id('gh'), link: 'github-acme', suggestions: [], fields: [{ configurable: id('ghAuthToken'), key: 'GITHUB_AUTH_TOKEN' }] }],
      orphaned: [{ target: id('github'), kind: 'connection', ref: 'github-acme' }],
      environments: [environment('development'), environment('production', { connections: { [id('github')]: 'github-acme' }, configurables: { [id('githubAuthToken')]: { ref: 'github-acme', key: 'GITHUB_AUTH_TOKEN' } } })],
    };
    const view = formLinkView(links, 'production', envName, [id('githubAuthToken'), id('ordersDbUrl')]);
    expect(view.connections.map((c) => [c.connection.id, c.connection.fields.map((f) => f.configurable), c.note])).toEqual([[id('github'), [id('githubAuthToken')], 'This release uses GitHub Acme. Change links in Development.']]);
    expect(view.target(id('githubAuthToken')).source).toMatchObject({ ref: 'github-acme', name: 'GitHub Acme' });
  });

  it('names the resource of a link whose target the build lacks', () => {
    const view = formLinkView({ ...base, orphaned: [{ target: id('ordersDbUrl'), kind: 'configurable', ref: 'orders-db', key: 'URL' }] }, 'development', envName);
    expect(view.orphaned).toEqual([{ target: id('ordersDbUrl'), kind: 'configurable', ref: 'orders-db', key: 'URL', name: 'orders-db' }]);
  });

  it('offers a key held only by a link the build lost, naming that target', () => {
    const links: IntegrationLinks = {
      ...base,
      used: { 'orders-db|PASSWORD': id('ordersDbPassword') },
      usedByOrphaned: { 'orders-db|URL': id('ordersDbUrl') },
      orphaned: [{ target: id('ordersDbUrl'), kind: 'configurable', ref: 'orders-db', key: 'URL' }],
    };
    expect(
      formLinkView(links, 'development', envName)
        .target(id('ordersUrl'))
        .picker?.resources.find((r) => r.id === 'orders-db')?.keys,
    ).toEqual([
      { key: 'URL', orphanOf: 'ordersDbUrl' },
      { key: 'PASSWORD', usedBy: 'ordersDbPassword' },
    ]);
  });

  it("shows workload.yaml's declarations, with nothing to link, when the repository declares the resources", () => {
    // ipaas-service's answer for an integration whose workload.yaml declares GitHub Acme's token for githubAuthToken.
    const links: IntegrationLinks = { ...linked, sourceDefined: true, declared: { [id('githubAuthToken')]: { ref: 'github-acme', key: 'GITHUB_AUTH_TOKEN' } } };
    const view = formLinkView(links, 'development', envName);
    expect(view.sourceDefined).toBe(true);
    expect(view.target(id('githubAuthToken'))).toEqual({ source: { ref: 'github-acme', key: 'GITHUB_AUTH_TOKEN', name: 'GitHub Acme', noValues: false, declared: true } });
    expect(view.target(id('githubTimeout'))).toEqual({});
    expect(view.connections.map((c) => [c.connection.id, c.linked, c.note])).toEqual([[id('github'), undefined, undefined]]);
    expect(formLinkView(links, 'production', envName, ghdemoFields).target(id('githubAuthToken')).picker).toBeUndefined();
  });

  it("shows another environment the workload.yaml declarations its release uses, not the current Workload's", () => {
    // workload.yaml now declares GitHub Sandbox for githubAuthToken and nothing for githubTimeout; production's release still has GitHub Acme for both.
    const links: IntegrationLinks = {
      ...base,
      sourceDefined: true,
      declared: { [id('githubAuthToken')]: { ref: 'github-sandbox', key: 'GITHUB_AUTH_TOKEN' } },
      environments: [
        environment('development', { configurables: { [id('githubAuthToken')]: { ref: 'github-sandbox', key: 'GITHUB_AUTH_TOKEN' } } }),
        environment('production', { configurables: { [id('githubAuthToken')]: { ref: 'github-acme', key: 'GITHUB_AUTH_TOKEN' }, [id('githubTimeout')]: { ref: 'orders-db', key: 'URL' } } }),
      ],
    };
    const production = formLinkView(links, 'production', envName, ghdemoFields);
    expect(production.target(id('githubAuthToken'))).toEqual({ source: { ref: 'github-acme', key: 'GITHUB_AUTH_TOKEN', name: 'GitHub Acme', noValues: false, declared: true } });
    expect(production.target(id('githubTimeout'))).toEqual({ source: { ref: 'orders-db', key: 'URL', name: 'orders-db', noValues: false, declared: true } });
    expect(formLinkView(links, 'development', envName).target(id('githubAuthToken')).source).toMatchObject({ ref: 'github-sandbox', declared: true });
  });
});
