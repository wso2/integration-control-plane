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
import type { SchemaConfigData } from '../../../types/configuration';
import { hasMissingRequiredConfigs } from './configStatus';

const schema = btoa(JSON.stringify({ type: 'object', properties: { apiKey: { type: 'secret' } }, required: ['apiKey'] }));

const schemaConfig = (value: string, isSensitive = false): SchemaConfigData => ({
  jsonSchema: schema,
  configurations: [{ key: 'apiKey', values: [{ value }], isSensitive }],
});

describe('hasMissingRequiredConfigs', () => {
  it('reports an empty non-sensitive required configuration as missing', () => {
    expect(hasMissingRequiredConfigs(schemaConfig(''))).toBe(true);
  });

  it('accepts a required configuration with a value', () => {
    expect(hasMissingRequiredConfigs(schemaConfig('value'))).toBe(false);
  });

  it('accepts a persisted secret whose value is redacted', () => {
    expect(hasMissingRequiredConfigs(schemaConfig('', true))).toBe(false);
  });

  it('reports a required configuration absent from the response as missing', () => {
    expect(hasMissingRequiredConfigs({ jsonSchema: schema, configurations: [] })).toBe(true);
  });
});
