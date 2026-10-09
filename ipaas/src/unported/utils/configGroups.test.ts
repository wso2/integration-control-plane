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
import { buildConfigurations, buildCreatePayload, configGroupToFormValues, isValidConfigKey, keyToValueType, slugifyGroupName } from './configGroups';
import type { ConfigGroup, KeyDefinition, ValueSetDraft } from '../../types/configGroups';

describe('slugifyGroupName', () => {
  it('lowercases and hyphenates, trimming stray separators', () => {
    expect(slugifyGroupName('Test Config Group')).toBe('test-config-group');
    expect(slugifyGroupName('  Payment  Service!! ')).toBe('payment-service');
  });
});

describe('isValidConfigKey', () => {
  it('accepts env-style keys and rejects invalid ones', () => {
    expect(isValidConfigKey('MY_KEY')).toBe(true);
    expect(isValidConfigKey('1KEY')).toBe(false);
    expect(isValidConfigKey('dash-key')).toBe(false);
  });
});

describe('buildConfigurations', () => {
  const keys: KeyDefinition[] = [
    { key: 'TOKEN', isFile: false, isSensitive: true },
    { key: 'CERT', isFile: true, isSensitive: false },
  ];

  it('fans each value-set value out to its environments, per key', () => {
    const sets: ValueSetDraft[] = [
      { environmentIds: ['e1', 'e2'], values: { TOKEN: 'abc', CERT: 'base64==' } },
      { environmentIds: ['e3'], values: { TOKEN: 'xyz' } },
    ];
    const cfg = buildConfigurations(keys, sets);
    expect(cfg[0]).toEqual({
      keyUuid: '',
      key: 'TOKEN',
      isSensitive: true,
      isFile: false,
      values: [
        { environmentUuid: 'e1', value: 'abc' },
        { environmentUuid: 'e2', value: 'abc' },
        { environmentUuid: 'e3', value: 'xyz' },
      ],
    });
    expect(cfg[1].values).toEqual([
      { environmentUuid: 'e1', value: 'base64==' },
      { environmentUuid: 'e2', value: 'base64==' },
    ]);
  });

  it('omits empty values and keeps keys with no values', () => {
    const cfg = buildConfigurations(keys, [{ environmentIds: ['e1'], values: { TOKEN: '  ' } }]);
    expect(cfg[0].values).toEqual([]);
    expect(cfg[1].values).toEqual([]);
  });
});

describe('buildCreatePayload', () => {
  it('slugifies the handle fallback and always includes the org scope', () => {
    const payload = buildCreatePayload('org-123', '', 'My Group', ' desc ', []);
    expect(payload.groupName).toBe('my-group');
    expect(payload.groupDisplayName).toBe('My Group');
    expect(payload.description).toBe('desc');
    expect(payload.scopes).toEqual([{ organizationUuid: 'org-123' }]);
  });

  it('prefers an explicit handle over the derived slug', () => {
    expect(buildCreatePayload('o', 'custom-handle', 'My Group', '', []).groupName).toBe('custom-handle');
  });

  it('throws when the org scope is missing or blank', () => {
    expect(() => buildCreatePayload('', 'h', 'My Group', '', [])).toThrow();
    expect(() => buildCreatePayload('   ', 'h', 'My Group', '', [])).toThrow();
  });
});

describe('keyToValueType', () => {
  it('maps file/secret/text flags to the value-input type', () => {
    expect(keyToValueType({ isFile: true, isSensitive: true })).toBe('file');
    expect(keyToValueType({ isFile: false, isSensitive: true })).toBe('secret');
    expect(keyToValueType({ isFile: false, isSensitive: false })).toBe('text');
  });
});

describe('configGroupToFormValues', () => {
  const group: ConfigGroup = {
    groupUuid: 'g1',
    groupName: 'my-group',
    groupDisplayName: 'My Group',
    description: 'd',
    configurations: [
      {
        keyUuid: 'k1',
        key: 'TOKEN',
        isSensitive: false,
        isFile: false,
        values: [
          { environmentUuid: 'e1', value: 'a' },
          { environmentUuid: 'e2', value: 'a' },
        ],
      },
      {
        keyUuid: 'k2',
        key: 'OTHER',
        isSensitive: false,
        isFile: false,
        values: [
          { environmentUuid: 'e1', value: 'x' },
          { environmentUuid: 'e2', value: 'y' },
        ],
      },
    ],
  };

  it('restores keys and collapses envs with identical value maps into one set', () => {
    const form = configGroupToFormValues(group);
    expect(form.handle).toBe('my-group');
    expect(form.keys.map((k) => k.key)).toEqual(['TOKEN', 'OTHER']);
    // e1 has {TOKEN:a,OTHER:x}; e2 has {TOKEN:a,OTHER:y} → different signatures → two sets
    expect(form.valueSets).toHaveLength(2);
    expect(form.valueSets.every((s) => s.environmentIds.length === 1)).toBe(true);
  });
});
