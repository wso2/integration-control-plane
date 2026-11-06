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
import type { SchemaConfigData } from '../types/configuration';
import { configureControl, miConfigValues, schemaConfigValues } from './configValues';

describe('schemaConfigValues', () => {
  it('carries plain values and drops secret values', () => {
    const data = {
      configurations: [
        { key: 'url', values: [{ environmentUuid: 'dev', value: 'https://x' }] },
        { key: 'token', isSensitive: true, values: [{ environmentUuid: 'dev', value: 's3cret' }] },
        { key: 'unset', values: [] },
      ],
    };
    expect(schemaConfigValues(data)).toEqual([
      { key: 'url', value: 'https://x', secret: false },
      { key: 'token', value: '', secret: true },
      { key: 'unset', value: '', secret: false },
    ]);
  });

  it("lists the editor's fields, required before optional, with their stored values", () => {
    const jsonSchema = btoa(JSON.stringify({ type: 'object', properties: { d: { type: 'integer' }, a: { type: 'string' }, b: { type: 'string' }, c: { type: 'string' } }, required: ['a', 'b'] }));
    const data = { jsonSchema, configurations: [{ key: 'a', values: [{ environmentUuid: 'dev', value: '1' }] }] };
    expect(schemaConfigValues(data)).toEqual([
      { key: 'a', label: 'a', value: '1', secret: false, section: 'Required' },
      { key: 'b', label: 'b', value: '', secret: false, section: 'Required' },
      { key: 'd', label: 'd', value: '', secret: false, optional: true, section: 'Optional' },
      { key: 'c', label: 'c', value: '', secret: false, optional: true, section: 'Optional' },
    ]);
  });

  it("puts each field under its module, labels an object's fields as the editor does, and shows a list or map as JSON", () => {
    const module = (properties: object, required: string[] = []) => ({ type: 'object', properties, required });
    const jsonSchema = btoa(
      JSON.stringify({
        type: 'object',
        requiredLevel: 3,
        properties: {
          acme: { type: 'object', properties: { hello: module({ token: { type: 'string' } }, ['token']) } },
          ballerina: {
            type: 'object',
            properties: {
              log: module({
                accessLog: { type: 'object', properties: { console: { type: 'boolean' } } },
                keyValues: { type: 'object', additionalProperties: { type: 'string' } },
                paths: { type: 'array', items: { type: 'string' } },
              }),
            },
          },
        },
      }),
    );
    const value = (key: string, v: string, isSensitive = false) => ({ key, isSensitive, values: [{ environmentUuid: 'dev', value: v }] });
    const data = {
      jsonSchema,
      configurations: [value('acme.hello.token', 's3cret', true), value('ballerina.log.keyValues.icp\\.runtimeId', 'r1'), value('ballerina.log.keyValues.key', 'k', true), value('ballerina.log.paths.[1]', '/b'), value('ballerina.log.paths.[0]', '/a')],
    };
    expect(schemaConfigValues(data)).toEqual([
      { key: 'acme.hello.token', label: 'token', value: '', secret: true, section: 'Required', module: 'acme.hello' },
      { key: 'ballerina.log.accessLog.console', label: 'accessLog / console', value: '', secret: false, optional: true, section: 'Optional', module: 'ballerina.log' },
      { key: 'ballerina.log.keyValues', label: 'keyValues', value: '{"icp.runtimeId": "r1", "key": "••••••••"}', secret: false, optional: true, section: 'Optional', module: 'ballerina.log' },
      { key: 'ballerina.log.paths', label: 'paths', value: '["/a", "/b"]', secret: false, optional: true, section: 'Optional', module: 'ballerina.log' },
    ]);
  });

  // ipaas-service sends null when nothing is set, though the type says otherwise.
  it('gives no values for a null list', () => {
    expect(schemaConfigValues({ configurations: null } as unknown as SchemaConfigData)).toEqual([]);
  });
});

describe('miConfigValues', () => {
  it('lists the variables, then the secrets without values', () => {
    const none = { legacySecrets: [], shadowedLegacySecrets: [], envVarsGroupIsSecret: false, secretsGroupIsPlain: false, otherGroupKeys: {}, otherPlainGroupKeys: {}, otherSecretGroupKeys: {} };
    expect(miConfigValues({ envVars: [{ key: 'A', value: '1' }], secrets: ['S'], ...none })).toEqual([
      { key: 'A', value: '1', secret: false },
      { key: 'S', value: '', secret: true },
    ]);
  });
});

describe('configureControl', () => {
  it('offers a read-only role a view, without urging it to act', () => {
    expect(configureControl(true, true)).toEqual({ label: 'View configuration', color: 'primary' });
    expect(configureControl(true, false)).toEqual({ label: 'View configuration', color: 'primary' });
  });

  it('urges a role that may edit to set missing values', () => {
    expect(configureControl(false, true)).toEqual({ label: 'Configure to continue', color: 'error' });
    expect(configureControl(false, false)).toEqual({ label: 'Configure', color: 'primary' });
  });
});
