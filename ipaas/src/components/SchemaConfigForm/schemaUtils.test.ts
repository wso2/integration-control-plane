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
import { getRequiredPathsAtLevel, getSchemasAtLevel } from './schemaUtils';
import type { JSONSchema } from '../../types/schema';

// What `bal build --generate-config-schema` writes for package wso2/sfdemo: the root module's
// configurables beside module sfdemo.support's node (no description, no name), and a record
// configurable (with both).
const schema = {
  type: 'object',
  requiredLevel: 3,
  properties: {
    wso2: {
      type: 'object',
      properties: {
        sfdemo: {
          type: 'object',
          required: ['sfSalesBaseUrl'],
          properties: {
            sfSalesBaseUrl: { type: 'string', description: '' },
            greeting: { type: 'string', description: '' },
            proxy: { type: 'object', name: 'wso2/sfdemo:0.1.0:Proxy', description: '', required: ['host'], properties: { host: { type: 'string' } } },
            support: {
              type: 'object',
              required: ['sfSupportBaseUrl'],
              properties: { sfSupportBaseUrl: { type: 'string', description: '' }, sfSupportRegion: { type: 'string', description: '' } },
            },
          },
        },
      },
    },
  },
} as unknown as JSONSchema;

describe('getSchemasAtLevel', () => {
  it('gives each submodule its own schema', () => {
    const levels = getSchemasAtLevel(schema, 3);
    expect(levels.map(({ path, schema: s }) => [path, Object.keys(s.properties ?? {}), s.required])).toEqual([
      ['wso2.sfdemo', ['sfSalesBaseUrl', 'greeting', 'proxy'], ['sfSalesBaseUrl']],
      ['wso2.sfdemo.support', ['sfSupportBaseUrl', 'sfSupportRegion'], ['sfSupportBaseUrl']],
    ]);
  });
});

describe('getRequiredPathsAtLevel', () => {
  it("includes a submodule's required configurables", () => {
    expect(getRequiredPathsAtLevel(schema)).toEqual(['wso2.sfdemo.sfSalesBaseUrl', 'wso2.sfdemo.support.sfSupportBaseUrl']);
  });
});
