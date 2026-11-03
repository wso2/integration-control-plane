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
import { linkRows, linkedConfigurables } from './resourceLinks';

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
  it('says what each link delivers in the environment', () => {
    expect(linkRows([sales, support], 'production')).toEqual([
      { resourceType: 'salesforce-sales', notes: ['through wso2.sfdemo.sfSales', 'no values in production'], canUnlink: true },
      { resourceType: 'support', notes: ["not linked · this environment's release still delivers it"], canUnlink: false },
    ]);
    expect(linkRows([sales, support], 'staging')).toEqual([{ resourceType: 'salesforce-sales', notes: ['through wso2.sfdemo.sfSales', 'next release'], canUnlink: true }]);
    expect(linkRows([cloudLink], 'development')).toEqual([{ resourceType: 'orders-db', notes: ['linked from WSO2 Cloud under its own key names'], canUnlink: false }]);
  });

  it('says where a link made on WSO2 Cloud is still delivered under its earlier names', () => {
    const renamed: ResourceLink = {
      resourceType: 'salesforce-pilot',
      linked: true,
      environments: [env('development', true, true), env('production', true, true, { 'wso2.sfdemo.sfDeskBaseUrl': 'BASE_URL' }, 'next_release')],
    };
    expect(linkRows([renamed], 'development')[0].notes).toEqual(['linked from WSO2 Cloud under its own key names']);
    expect(linkRows([renamed], 'production')[0].notes).toEqual(['linked from WSO2 Cloud · still delivered under its earlier names until the next release']);
  });

  it("names the release's connection while the link is ahead of it, and that the next release gets the link's", () => {
    expect(linkRows([ahead], 'development')).toEqual([{ resourceType: 'salesforce-crm', notes: ['through wso2.sfdemo.sfSales', 'now goes through wso2.sfdemo.sfCrm; next release'], canUnlink: true }]);
    expect(linkRows([ahead], 'production')[0].notes).toEqual(['through wso2.sfdemo.sfSales', 'now goes through wso2.sfdemo.sfCrm; next release']);
  });

  it('says a release has yet to carry the names a link has now', () => {
    const changed: ResourceLink = { ...sales, environments: [{ ...env('development', true, true, { 'wso2.sfdemo.sfSalesBaseUrl': 'BASE_URL' }, 'next_release'), connection: 'wso2.sfdemo.sfSales' }] };
    expect(linkRows([changed], 'development')[0].notes).toEqual(['through wso2.sfdemo.sfSales', 'next release']);
  });

  it('says where names set on WSO2 Cloud take precedence, and offers to unlink only the connection', () => {
    const both: ResourceLink = { ...sales, namesFromWso2Cloud: true };
    expect(linkRows([both], 'development')).toEqual([{ resourceType: 'salesforce-sales', notes: ['through wso2.sfdemo.sfSales', 'Names set on WSO2 Cloud take precedence'], canUnlink: true }]);
  });

  it('says where workload.yaml takes precedence, and never waits for a release', () => {
    expect(linkRows([fromSource], 'development')).toEqual([{ resourceType: 'salesforce-desk', notes: ['through wso2.sfdemo.sfDesk', 'workload.yaml takes precedence'], canUnlink: true }]);
    expect(linkRows([fromSource], 'production')[0].notes).toEqual(['through wso2.sfdemo.sfDesk', 'workload.yaml takes precedence', 'no values in production']);
  });

  it('lists a workload.yaml declaration, with nothing to unlink', () => {
    const declaration: ResourceLink = { resourceType: 'salesforce-desk', linked: false, sourceDefined: true, environments: [env('development', true, true), env('production', false, false)] };
    expect(linkRows([declaration], 'development')).toEqual([{ resourceType: 'salesforce-desk', notes: ['declared in workload.yaml'], canUnlink: false }]);
    expect(linkRows([declaration], 'production')).toEqual([{ resourceType: 'salesforce-desk', notes: ['declared in workload.yaml', 'no values in production'], canUnlink: false }]);
  });
});
