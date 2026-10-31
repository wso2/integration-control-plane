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
import { miConfigValues, schemaConfigValues } from './configValues';

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

  it("names a module's keys by their path, as the schema nests them", () => {
    const jsonSchema = btoa(JSON.stringify({ type: 'object', requiredLevel: 2, properties: { hello: { type: 'object', properties: { port: { type: 'integer' }, greeting: { type: 'string' } }, required: ['greeting'] } } }));
    expect(schemaConfigValues({ jsonSchema, configurations: [] })).toEqual([
      { key: 'hello.greeting', value: '', secret: false },
      { key: 'hello.port', value: '', secret: false, optional: true },
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
