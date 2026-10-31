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
import type { ResourceLink } from '../types/configuration';
import { linkRows, linkedConfigurables } from './resourceLinks';

const env = (name: string, inRelease: boolean, hasValues: boolean, configurables: Record<string, string> = {}) => ({ name, inRelease, hasValues, configurables, connectionInBuild: inRelease });

const sales: ResourceLink = {
  resourceType: 'salesforce-sales',
  connection: 'wso2.sfdemo.sfSales',
  linked: true,
  environments: [env('development', true, true, { 'wso2.sfdemo.sfSalesBaseUrl': 'BASE_URL' }), env('production', true, false, { 'wso2.sfdemo.sfSalesBaseUrl': 'BASE_URL' }), env('staging', false, true)],
};
const support: ResourceLink = { resourceType: 'support', linked: false, environments: [env('development', false, true), env('production', true, true, { 'wso2.sfdemo.supportUrl': 'URL' })] };
const cloudLink: ResourceLink = { resourceType: 'orders-db', linked: true, environments: [env('development', true, true)] };
// Linked through sfCrm, while development and production still run builds whose releases use sfSales.
const ahead: ResourceLink = {
  resourceType: 'salesforce-crm',
  connection: 'wso2.sfdemo.sfCrm',
  linked: true,
  environments: [
    { ...env('development', true, true, { 'wso2.sfdemo.sfSalesBaseUrl': 'BASE_URL' }), connection: 'wso2.sfdemo.sfSales' },
    { ...env('production', true, true, { 'wso2.sfdemo.sfSalesBaseUrl': 'BASE_URL' }), connection: 'wso2.sfdemo.sfSales' },
  ],
};
const declared: ResourceLink = {
  resourceType: 'salesforce-desk',
  linked: false,
  declared: true,
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
    expect(linkedConfigurables([declared], 'development')).toEqual(new Map([['wso2.sfdemo.sfDeskBaseUrl', { resource: 'salesforce-desk', declared: true }]]));
  });
});

describe('linkRows', () => {
  it('says what each link delivers in the environment', () => {
    expect(linkRows([sales, support], 'production')).toEqual([
      { resourceType: 'salesforce-sales', notes: ['through wso2.sfdemo.sfSales', 'no values in production'], canUnlink: true },
      { resourceType: 'support', notes: ["not linked · this environment's release still delivers it"], canUnlink: false },
    ]);
    expect(linkRows([sales, support], 'staging')).toEqual([{ resourceType: 'salesforce-sales', notes: ['through wso2.sfdemo.sfSales', 'next release'], canUnlink: true }]);
    expect(linkRows([cloudLink], 'development')).toEqual([{ resourceType: 'orders-db', notes: ['linked from WSO2 Cloud under its own key names'], canUnlink: true }]);
  });

  it("names the release's connection while the link is ahead of it, and when each environment gets the link's", () => {
    expect(linkRows([ahead], 'development')).toEqual([{ resourceType: 'salesforce-crm', notes: ['through wso2.sfdemo.sfSales', 'now goes through wso2.sfdemo.sfCrm; next build'], canUnlink: true }]);
    expect(linkRows([ahead], 'production')[0].notes).toEqual(['through wso2.sfdemo.sfSales', 'now goes through wso2.sfdemo.sfCrm; next release']);
  });

  it('lists a workload.yaml declaration, with nothing to unlink', () => {
    expect(linkRows([declared], 'development')).toEqual([{ resourceType: 'salesforce-desk', notes: ['declared in workload.yaml'], canUnlink: false }]);
    expect(linkRows([declared], 'production')).toEqual([{ resourceType: 'salesforce-desk', notes: ['declared in workload.yaml', 'next release', 'no values in production'], canUnlink: false }]);
  });
});
