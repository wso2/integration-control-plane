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
import { hasMissingRequiredConfigs } from './configStatus';
import type { ResourceLink, SchemaConfigData } from '../../../types/configuration';

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
const link = (configurables: Record<string, string>, hasValues = true): ResourceLink => ({
  resourceType: 'salesforce-sales',
  linked: true,
  environments: [{ name: 'development', inRelease: true, hasValues, connectionInBuild: true, configurables }],
});
const sales = link({ 'wso2.sftask.sfSalesBaseUrl': 'SALESFORCE_BASE_URL', 'wso2.sftask.sfSalesAuthClientId': 'SALESFORCE_AUTH_CLIENT_ID' });

describe('hasMissingRequiredConfigs', () => {
  it('asks for required configurables with no value', () => {
    const config: SchemaConfigData = { jsonSchema, configurations: [value('wso2.sftask.sfSalesBaseUrl', 'http://sf')] };
    expect(hasMissingRequiredConfigs(config)).toBe(true);
  });

  it('counts the configurables a link supplies as filled where its release carries it with values', () => {
    expect(hasMissingRequiredConfigs({ jsonSchema, configurations: [] }, [sales], 'development')).toBe(false);
    expect(hasMissingRequiredConfigs({ jsonSchema, configurations: [] }, [sales], 'production')).toBe(true);
    const noValues = link({ 'wso2.sftask.sfSalesBaseUrl': 'SALESFORCE_BASE_URL', 'wso2.sftask.sfSalesAuthClientId': 'SALESFORCE_AUTH_CLIENT_ID' }, false);
    expect(hasMissingRequiredConfigs({ jsonSchema, configurations: [] }, [noValues], 'development')).toBe(true);
  });

  it('still asks for a required configurable no link supplies', () => {
    const partial = link({ 'wso2.sftask.sfSalesBaseUrl': 'SALESFORCE_BASE_URL' });
    expect(hasMissingRequiredConfigs({ jsonSchema, configurations: [] }, [partial], 'development')).toBe(true);
    expect(hasMissingRequiredConfigs({ jsonSchema, configurations: [value('wso2.sftask.sfSalesAuthClientId', 'id')] }, [partial], 'development')).toBe(false);
  });

  it('ignores a link that supplies no configurable', () => {
    expect(hasMissingRequiredConfigs({ jsonSchema, configurations: [] }, [link({})], 'development')).toBe(true);
  });
});
