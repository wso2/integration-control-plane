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
import { buildEgressRequest, createEgressRule, detectRuleType, modeOfPolicy, rulesForMode } from './egressPolicy';
import type { EgressPolicy, EgressRule } from '../../types/egressPolicy';

const makeRule = (overrides: Partial<EgressRule> = {}): EgressRule => ({
  rule_id: 'r1',
  name: 'rule',
  value: '10.0.0.0/24',
  type: 'CIDR',
  scope: 'Organization',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const makePolicy = (overrides: Partial<EgressPolicy> = {}): EgressPolicy => ({
  id: 'p1',
  organization_id: 'org1',
  name: 'policy',
  egress: [],
  egress_deny: [],
  status: 'ACTIVE',
  is_deleted: false,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

describe('detectRuleType', () => {
  it('detects a CIDR range', () => {
    expect(detectRuleType('10.0.0.0/24')).toBe('CIDR');
  });

  it('detects an FQDN', () => {
    expect(detectRuleType('api.example.com')).toBe('FQDN');
  });

  it('returns null for a value that is neither', () => {
    expect(detectRuleType('not a value')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(detectRuleType('')).toBeNull();
  });
});

describe('modeOfPolicy', () => {
  it('returns deny-all when there are allow rules', () => {
    expect(modeOfPolicy(makePolicy({ egress: [makeRule()] }))).toBe('deny-all');
  });

  it('returns allow-all when there are no allow rules', () => {
    expect(modeOfPolicy(makePolicy({ egress: [] }))).toBe('allow-all');
  });
});

describe('rulesForMode', () => {
  it('returns an empty array when policy is null', () => {
    expect(rulesForMode(null, 'allow-all')).toEqual([]);
  });

  it('returns egress_deny for allow-all mode', () => {
    const denyRule = makeRule({ rule_id: 'deny1' });
    expect(rulesForMode(makePolicy({ egress_deny: [denyRule] }), 'allow-all')).toEqual([denyRule]);
  });

  it('returns egress for deny-all mode', () => {
    const allowRule = makeRule({ rule_id: 'allow1' });
    expect(rulesForMode(makePolicy({ egress: [allowRule] }), 'deny-all')).toEqual([allowRule]);
  });
});

describe('buildEgressRequest', () => {
  it('places rules in egress_deny for allow-all mode', () => {
    const rules = [makeRule()];
    expect(buildEgressRequest('allow-all', rules)).toEqual({ egress: [], egress_deny: rules });
  });

  it('places rules in egress for deny-all mode', () => {
    const rules = [makeRule()];
    expect(buildEgressRequest('deny-all', rules)).toEqual({ egress: rules, egress_deny: [] });
  });

  it('includes policy_id when provided', () => {
    expect(buildEgressRequest('allow-all', [], 'p1')).toEqual({ egress: [], egress_deny: [], policy_id: 'p1' });
  });

  it('omits policy_id when not provided', () => {
    const result = buildEgressRequest('deny-all', []);
    expect(result).not.toHaveProperty('policy_id');
  });
});

describe('createEgressRule', () => {
  it('creates a CIDR rule for allow-all mode', () => {
    const rule = createEgressRule('my-rule', '10.0.0.0/24', 'allow-all');
    expect(rule.name).toBe('my-rule');
    expect(rule.value).toBe('10.0.0.0/24');
    expect(rule.type).toBe('CIDR');
    expect(rule.scope).toBe('Organization');
    expect(rule.rule_id).toBeTruthy();
    expect(rule.created_at).toBe(rule.updated_at);
  });

  it('creates an FQDN rule for deny-all mode', () => {
    const rule = createEgressRule('my-rule', 'api.example.com', 'deny-all');
    expect(rule.type).toBe('FQDN');
  });

  it('creates a CIDR rule for deny-all mode', () => {
    const rule = createEgressRule('my-rule', '10.0.0.0/24', 'deny-all');
    expect(rule.type).toBe('CIDR');
  });

  it('throws for a value that is neither CIDR nor FQDN', () => {
    expect(() => createEgressRule('my-rule', 'not a value', 'allow-all')).toThrow('Enter a valid CIDR range (e.g. 10.0.0.0/24) or domain (e.g. api.example.com).');
  });

  it('throws for an FQDN value in allow-all mode', () => {
    expect(() => createEgressRule('my-rule', 'api.example.com', 'allow-all')).toThrow('Allow-all policies accept CIDR ranges only.');
  });
});
