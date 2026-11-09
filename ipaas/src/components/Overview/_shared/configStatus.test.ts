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
import { hasMissingRequiredConfigs, missingConfigsReason } from './configStatus';
import type { IntegrationLinks, SchemaConfigData } from '../../../types/configuration';

// Package wso2/sftask: two required configurables of connection sfSales, and an optional one.
const jsonSchema = btoa(
  JSON.stringify({
    type: 'object',
    requiredLevel: 3,
    properties: {
      wso2: {
        type: 'object',
        properties: {
          sftask: {
            type: 'object',
            required: ['sfSalesBaseUrl', 'sfSalesAuthClientId'],
            properties: { sfSalesBaseUrl: { type: 'string', description: '' }, sfSalesAuthClientId: { type: 'string', description: '' }, greeting: { type: 'string', description: '' } },
          },
        },
      },
    },
  }),
);
const value = (key: string, v: string) => ({ key, values: [{ environmentUuid: 'development', value: v }] });
// ipaas-service's answer: development's release links configurables to salesforce-sales's keys.
const link = (configurables: Record<string, string>, hasValues = true): IntegrationLinks => ({
  kind: 'ballerina',
  resources: [{ id: 'salesforce-sales', displayName: 'salesforce-sales', keys: [], valuesIn: hasValues ? ['development'] : [] }],
  used: {},
  usedByOrphaned: {},
  connections: [],
  fieldLinks: {},
  endpointLinks: {},
  orphaned: [],
  env: {},
  environments: [
    {
      name: 'development',
      deployed: true,
      resources: [{ ref: 'salesforce-sales', state: 'in_use' }],
      valuesChanged: false,
      linksNeedDeploy: false,
      connections: {},
      configurables: Object.fromEntries(Object.entries(configurables).map(([k, key]) => [k.replace('wso2.sftask.', 'wso2/sftask:'), { ref: 'salesforce-sales', key }])),
      env: {},
    },
  ],
});
const sales = link({ 'wso2.sftask.sfSalesBaseUrl': 'SALESFORCE_BASE_URL', 'wso2.sftask.sfSalesAuthClientId': 'SALESFORCE_AUTH_CLIENT_ID' });

describe('hasMissingRequiredConfigs', () => {
  it('asks for required configurables with no value', () => {
    const config: SchemaConfigData = { jsonSchema, configurations: [value('wso2.sftask.sfSalesBaseUrl', 'http://sf')] };
    expect(hasMissingRequiredConfigs(config)).toBe(true);
  });

  it('counts the configurables a link supplies as filled where its release carries it with values', () => {
    expect(hasMissingRequiredConfigs({ jsonSchema, configurations: [] }, sales, 'development')).toBe(false);
    expect(hasMissingRequiredConfigs({ jsonSchema, configurations: [] }, sales, 'production')).toBe(true);
    const noValues = link({ 'wso2.sftask.sfSalesBaseUrl': 'SALESFORCE_BASE_URL', 'wso2.sftask.sfSalesAuthClientId': 'SALESFORCE_AUTH_CLIENT_ID' }, false);
    expect(hasMissingRequiredConfigs({ jsonSchema, configurations: [] }, noValues, 'development')).toBe(true);
  });

  // An endpoint fills a configurable with an address the platform resolves in each environment: there
  // is no resource behind it and no value of ours, so asking for one would keep the card on Configure
  // to Continue for a setting that is already supplied.
  it('counts the configurables an endpoint fills as filled', () => {
    const endpoints = {
      ...link({}),
      endpointLinks: { 'wso2/sftask:sfSalesBaseUrl': 'shop/basket/items', 'wso2/sftask:sfSalesAuthClientId': 'shop/basket/items' },
    };
    expect(hasMissingRequiredConfigs({ jsonSchema, configurations: [] }, endpoints, 'development')).toBe(false);
    expect(hasMissingRequiredConfigs({ jsonSchema, configurations: [] }, endpoints, 'production')).toBe(false);
  });

  it('still asks for a required configurable an endpoint fills only in part', () => {
    const one = { ...link({}), endpointLinks: { 'wso2/sftask:sfSalesBaseUrl': 'shop/basket/items' } };
    expect(hasMissingRequiredConfigs({ jsonSchema, configurations: [] }, one, 'development')).toBe(true);
  });

  it('still asks for a required configurable no link supplies', () => {
    const partial = link({ 'wso2.sftask.sfSalesBaseUrl': 'SALESFORCE_BASE_URL' });
    expect(hasMissingRequiredConfigs({ jsonSchema, configurations: [] }, partial, 'development')).toBe(true);
    expect(hasMissingRequiredConfigs({ jsonSchema, configurations: [value('wso2.sftask.sfSalesAuthClientId', 'id')] }, partial, 'development')).toBe(false);
  });

  it('counts a saved secret as set, though its value comes back empty', () => {
    const secret = { key: 'wso2.sftask.sfSalesAuthClientId', values: [{ value: '' }], isSensitive: true, isSet: true };
    expect(hasMissingRequiredConfigs({ jsonSchema, configurations: [value('wso2.sftask.sfSalesBaseUrl', 'http://sf'), secret] })).toBe(false);
    expect(hasMissingRequiredConfigs({ jsonSchema, configurations: [value('wso2.sftask.sfSalesBaseUrl', 'http://sf'), { ...secret, isSet: false }] })).toBe(true);
  });

  it('ignores a link that supplies no configurable', () => {
    expect(hasMissingRequiredConfigs({ jsonSchema, configurations: [] }, link({}), 'development')).toBe(true);
  });
});

describe('missingConfigsReason', () => {
  const noValues = link({ 'wso2.sftask.sfSalesBaseUrl': 'SALESFORCE_BASE_URL', 'wso2.sftask.sfSalesAuthClientId': 'SALESFORCE_AUTH_CLIENT_ID' }, false);

  it('names the linked resource without values', () => {
    expect(missingConfigsReason({ jsonSchema, configurations: [] }, noValues, 'development')).toBe('salesforce-sales has no values in development. Add them on WSO2 Cloud.');
  });

  it('names only a resource that feeds a required configurable without a value', () => {
    // greeting is optional: its resource without values keeps it at its default and doesn't hold development back.
    const optional = link({ 'wso2.sftask.greeting': 'GREETING' }, false);
    expect(missingConfigsReason({ jsonSchema, configurations: [] }, optional, 'development')).toBe('Required configurables have no values in development.');
    const filled = [value('wso2.sftask.sfSalesBaseUrl', 'http://sf'), value('wso2.sftask.sfSalesAuthClientId', 'id')];
    expect(missingConfigsReason({ jsonSchema, configurations: filled }, optional, 'development')).toBeUndefined();
  });

  it('says required configurables have no values when no link is the cause', () => {
    expect(missingConfigsReason({ jsonSchema, configurations: [] }, undefined, 'development')).toBe('Required configurables have no values in development.');
  });

  it('is undefined when nothing is missing', () => {
    expect(missingConfigsReason({ jsonSchema, configurations: [] }, sales, 'development')).toBeUndefined();
  });
});
