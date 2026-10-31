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
import type { ResourceLink, ResourceLinkEnvironment } from '../types/configuration';
import { type LinkRow, linkRows, linkedConfigurables, promoteWithoutValues } from './resourceLinks';

const env = (name: string, inRelease: boolean, hasValues: boolean, configurables: Record<string, string> = {}, state: ResourceLinkEnvironment['state'] = inRelease ? 'linked' : 'next_release'): ResourceLinkEnvironment => ({
  name,
  state,
  inRelease,
  hasValues,
  configurables,
});

const sales: ResourceLink = {
  resourceType: 'salesforce-sales',
  connection: 'wso2.sfdemo.sfSales',
  linked: true,
  environments: [env('development', true, true, { 'wso2.sfdemo.sfSalesBaseUrl': 'BASE_URL' }), env('production', true, false, { 'wso2.sfdemo.sfSalesBaseUrl': 'BASE_URL' }), env('staging', false, true)],
};
const support: ResourceLink = { resourceType: 'support', linked: false, environments: [env('development', false, true), env('production', true, true, { 'wso2.sfdemo.supportUrl': 'URL' }, 'in_release')] };
const cloudLink: ResourceLink = { resourceType: 'orders-db', linked: true, environments: [env('development', true, true)] };
// Linked through sfCrm, while development and production still run builds whose releases use sfSales.
const ahead: ResourceLink = {
  resourceType: 'salesforce-crm',
  connection: 'wso2.sfdemo.sfCrm',
  linked: true,
  environments: [
    { ...env('development', true, true, { 'wso2.sfdemo.sfSalesBaseUrl': 'BASE_URL' }, 'next_release'), connection: 'wso2.sfdemo.sfSales' },
    { ...env('production', true, true, { 'wso2.sfdemo.sfSalesBaseUrl': 'BASE_URL' }, 'next_release'), connection: 'wso2.sfdemo.sfSales' },
  ],
};
const fromSource: ResourceLink = {
  resourceType: 'salesforce-desk',
  connection: 'wso2.sfdemo.sfDesk',
  linked: true,
  sourceDefined: true,
  environments: [env('development', true, true, { 'wso2.sfdemo.sfDeskBaseUrl': 'BASE_URL' }), env('production', false, false)],
};

describe('linkedConfigurables', () => {
  it("maps what each environment's release delivers, noting where the resource has no values", () => {
    expect(linkedConfigurables([sales, support], 'development')).toEqual(new Map([['wso2.sfdemo.sfSalesBaseUrl', { resource: 'salesforce-sales' }]]));
    expect(linkedConfigurables([sales, support], 'production')).toEqual(
      new Map([
        ['wso2.sfdemo.sfSalesBaseUrl', { resource: 'salesforce-sales', noValuesIn: 'production' }],
        ['wso2.sfdemo.supportUrl', { resource: 'support' }],
      ]),
    );
    expect(linkedConfigurables([sales], 'staging')).toEqual(new Map());
  });

  it('marks what workload.yaml supplies', () => {
    expect(linkedConfigurables([fromSource], 'development')).toEqual(new Map([['wso2.sfdemo.sfDeskBaseUrl', { resource: 'salesforce-desk', declared: true }]]));
  });
});

describe('linkRows', () => {
  // What a row shows: the connection line, then the notes, and the label for a link only the release still delivers.
  const shown = (r: LinkRow) => [r.connection, ...r.notes, ...(r.unlinked ? ['Unlinked in next release'] : [])].filter(Boolean);

  it('says what each link delivers in the environment, and where the resource has no values without a note of its own', () => {
    expect(linkRows([sales, support], 'production')).toEqual([
      { resourceType: 'salesforce-sales', name: 'salesforce-sales', connection: 'wso2.sfdemo.sfSales', notes: [], unlinked: false, noValues: true, canUnlink: true },
      { resourceType: 'support', name: 'support', connection: undefined, notes: [], unlinked: true, noValues: false, canUnlink: false },
    ]);
    expect(linkRows([sales, support], 'staging').map(shown)).toEqual([['wso2.sfdemo.sfSales', 'next release']]);
    expect(linkRows([cloudLink], 'development')).toMatchObject([{ connection: undefined, notes: ['linked from WSO2 Cloud'], canUnlink: false }]);
  });

  it("names a link by its resource's display name, with its package", () => {
    expect(linkRows([{ ...sales, displayName: 'Salesforce Sales', package: 'ballerinax/salesforce' }], 'development')[0]).toMatchObject({ name: 'Salesforce Sales', package: 'ballerinax/salesforce' });
  });

  it('labels a link only the release still delivers, with the connection that release follows', () => {
    const removed: ResourceLink = { ...support, environments: [{ ...env('production', true, true, { 'wso2.sfdemo.supportUrl': 'URL' }, 'in_release'), connection: 'wso2.sfdemo.sfSupport' }] };
    expect(linkRows([removed], 'production').map(shown)).toEqual([['wso2.sfdemo.sfSupport', 'Unlinked in next release']]);
  });

  it('calls a link made on WSO2 Cloud linked where the release carries it under earlier names', () => {
    const renamed: ResourceLink = {
      resourceType: 'salesforce-pilot',
      linked: true,
      environments: [env('development', true, true), env('production', true, true, { 'wso2.sfdemo.sfDeskBaseUrl': 'BASE_URL' }, 'next_release')],
    };
    expect(linkRows([renamed], 'development').map(shown)).toEqual([['linked from WSO2 Cloud']]);
    expect(linkRows([renamed], 'production').map(shown)).toEqual([['linked from WSO2 Cloud']]);
  });

  it("names the release's connection while the link is ahead of it, without calling the environment unlinked", () => {
    expect(linkRows([ahead], 'development').map(shown)).toEqual([['wso2.sfdemo.sfSales', 'link now uses wso2.sfdemo.sfCrm']]);
    expect(linkRows([ahead], 'production').map(shown)).toEqual([['wso2.sfdemo.sfSales', 'link now uses wso2.sfdemo.sfCrm']]);
  });

  it("names the release's connection after a rollback to a build before a Change link", () => {
    const rolledBack: ResourceLink = { ...ahead, environments: [{ ...env('development', true, true, { 'wso2.sfdemo.sfSalesBaseUrl': 'BASE_URL' }), connection: 'wso2.sfdemo.sfSales' }] };
    expect(linkRows([rolledBack], 'development').map(shown)).toEqual([['wso2.sfdemo.sfSales', 'link now uses wso2.sfdemo.sfCrm']]);
  });

  it("calls an environment linked where its release goes through the link's connection with other names", () => {
    const changed: ResourceLink = { ...sales, environments: [{ ...env('development', true, true, { 'wso2.sfdemo.sfSalesBaseUrl': 'BASE_URL' }, 'next_release'), connection: 'wso2.sfdemo.sfSales' }] };
    expect(linkRows([changed], 'development').map(shown)).toEqual([['wso2.sfdemo.sfSales']]);
  });

  it('says where names set on WSO2 Cloud override the connection, and offers to unlink only the connection', () => {
    expect(linkRows([{ ...sales, namesFromWso2Cloud: true }], 'development')).toMatchObject([{ connection: 'wso2.sfdemo.sfSales', notes: ['names overridden on WSO2 Cloud'], canUnlink: true }]);
  });

  it('says where workload.yaml overrides the link, and never waits for a release', () => {
    expect(linkRows([fromSource], 'development')).toMatchObject([{ connection: 'wso2.sfdemo.sfDesk', notes: ['overridden by workload.yaml'], canUnlink: true }]);
    expect(linkRows([fromSource], 'production')).toMatchObject([{ connection: 'wso2.sfdemo.sfDesk', notes: ['overridden by workload.yaml'], noValues: true }]);
  });

  it('lists a workload.yaml declaration, with nothing to unlink', () => {
    const declaration: ResourceLink = { resourceType: 'salesforce-desk', linked: false, sourceDefined: true, environments: [env('development', true, true), env('production', false, false)] };
    expect(linkRows([declaration], 'development')).toMatchObject([{ notes: ['declared in workload.yaml'], unlinked: false, noValues: false, canUnlink: false }]);
    expect(linkRows([declaration], 'production')).toMatchObject([{ notes: ['declared in workload.yaml'], unlinked: false, noValues: true, canUnlink: false }]);
  });
});

describe('promoteWithoutValues', () => {
  it('names what the source release delivers and the target has no values for', () => {
    expect(promoteWithoutValues([sales, support], 'development', 'production')).toEqual(['salesforce-sales']);
    expect(promoteWithoutValues([sales, support], 'staging', 'production')).toEqual([]);
  });
});
