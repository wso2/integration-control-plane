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

  it('adds the keys that have no value, required before optional', () => {
    const jsonSchema = btoa(JSON.stringify({ type: 'object', properties: { d: { type: 'integer' }, a: { type: 'string' }, b: { type: 'string' }, c: { type: 'string' } }, required: ['a', 'b'] }));
    const data = { jsonSchema, configurations: [{ key: 'a', values: [{ environmentUuid: 'dev', value: '1' }] }] };
    expect(schemaConfigValues(data)).toEqual([
      { key: 'a', value: '1', secret: false },
      { key: 'b', value: '', secret: false },
      { key: 'd', value: '', secret: false, optional: true },
      { key: 'c', value: '', secret: false, optional: true },
    ]);
  });

  it("names a module's keys by their path, and an optional key's module as the editor groups it", () => {
    // As Ballerina nests them: organization, then module, then the module's configurables.
    const module = (properties: object, required: string[] = []) => ({ type: 'object', properties, required });
    const org = (modules: object) => ({ type: 'object', properties: modules });
    const jsonSchema = btoa(
      JSON.stringify({
        type: 'object',
        requiredLevel: 3,
        properties: { acme: org({ hello: module({ port: { type: 'integer' }, greeting: { type: 'string' } }, ['greeting']) }), ballerina: org({ log: module({ level: { type: 'string' }, format: { type: 'string' } }) }) },
      }),
    );
    expect(schemaConfigValues({ jsonSchema, configurations: [] })).toEqual([
      { key: 'acme.hello.greeting', value: '', secret: false },
      { key: 'ballerina.log.level', value: '', secret: false, optional: true, module: 'ballerina.log' },
      { key: 'ballerina.log.format', value: '', secret: false, optional: true, module: 'ballerina.log' },
      { key: 'acme.hello.port', value: '', secret: false, optional: true, module: 'acme.hello' },
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
