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
import {
  complianceStatusLabel,
  complianceStatusColor,
  isFailedStatus,
  formatRuleMessage,
  sortNestedItems,
  mapPolicyNestedItems,
  countViolated,
  complianceEntryToRow,
  adherenceEntryToRow,
  buildPolicyTypeMap,
  groupRulesBySeverity,
  complianceSlices,
  adherenceSlices,
} from './compliance';
import type { ComplianceNestedItem } from '../../types/compliance';
import type { CompliancePolicyEntry, RuleAdherenceRulesetEntry } from '../../types/governance';

describe('complianceStatusLabel', () => {
  it('maps known statuses to their display labels', () => {
    expect(complianceStatusLabel('compliant')).toBe('Compliant');
    expect(complianceStatusLabel('non-compliant')).toBe('Non-Compliant');
    expect(complianceStatusLabel('not-applicable')).toBe('Not Applicable');
    expect(complianceStatusLabel('adhered')).toBe('Adhered');
    expect(complianceStatusLabel('violated')).toBe('Violated');
    expect(complianceStatusLabel('unapplied')).toBe('Unapplied');
  });

  it('falls back to the raw status when unrecognized', () => {
    expect(complianceStatusLabel('mystery')).toBe('mystery');
  });
});

describe('complianceStatusColor', () => {
  it('returns success for compliant/adhered statuses', () => {
    expect(complianceStatusColor('compliant')).toBe('success');
    expect(complianceStatusColor('adhered')).toBe('success');
  });

  it('returns error for non-compliant/violated statuses', () => {
    expect(complianceStatusColor('non-compliant')).toBe('error');
    expect(complianceStatusColor('violated')).toBe('error');
  });

  it('returns default for any other status', () => {
    expect(complianceStatusColor('not-applicable')).toBe('default');
    expect(complianceStatusColor('unapplied')).toBe('default');
  });
});

describe('isFailedStatus', () => {
  it('identifies failed statuses', () => {
    expect(isFailedStatus('non-compliant')).toBe(true);
    expect(isFailedStatus('violated')).toBe(true);
  });

  it('returns false for non-failed statuses', () => {
    expect(isFailedStatus('compliant')).toBe(false);
    expect(isFailedStatus('unknown')).toBe(false);
  });
});

describe('formatRuleMessage', () => {
  it('renders a single placeholder', () => {
    expect(formatRuleMessage('Missing {{title}} field')).toBe('Missing [title] field');
  });

  it('renders multiple placeholders', () => {
    expect(formatRuleMessage('{{a}} and {{b}}')).toBe('[a] and [b]');
  });

  it('leaves messages without placeholders unchanged', () => {
    expect(formatRuleMessage('No placeholders here')).toBe('No placeholders here');
  });
});

describe('sortNestedItems', () => {
  it('puts failed entries first, then sorts alphabetically', () => {
    const items: ComplianceNestedItem[] = [
      { id: '1', name: 'Zebra', status: 'compliant' },
      { id: '2', name: 'Alpha', status: 'non-compliant' },
      { id: '3', name: 'Beta', status: 'compliant' },
      { id: '4', name: 'Charlie', status: 'violated' },
    ];
    expect(sortNestedItems(items).map((i) => i.name)).toEqual(['Alpha', 'Charlie', 'Beta', 'Zebra']);
  });

  it('treats missing names as empty strings without throwing', () => {
    const items: ComplianceNestedItem[] = [
      { id: '1', name: null, status: 'compliant' },
      { id: '2', name: 'Alpha', status: 'compliant' },
    ];
    expect(sortNestedItems(items).map((i) => i.name)).toEqual([null, 'Alpha']);
  });

  it('does not mutate the input array', () => {
    const items: ComplianceNestedItem[] = [
      { id: '1', name: 'B', status: 'compliant' },
      { id: '2', name: 'A', status: 'compliant' },
    ];
    const original = [...items];
    sortNestedItems(items);
    expect(items).toEqual(original);
  });

  it('handles an empty array', () => {
    expect(sortNestedItems([])).toEqual([]);
  });
});

describe('mapPolicyNestedItems', () => {
  it('projects policies with nested rulesets', () => {
    const policies: CompliancePolicyEntry[] = [
      {
        policyId: 'p1',
        policyName: 'Policy One',
        status: 'non-compliant',
        rulesets: {
          count: 1,
          list: [{ rulesetId: 'r1', rulesetName: 'Ruleset One', status: 'violated', ruleViolations: { error: 1, warn: 0, info: 0 } }],
        },
      },
    ];
    expect(mapPolicyNestedItems(policies)).toEqual([
      {
        id: 'p1',
        name: 'Policy One',
        status: 'non-compliant',
        subItems: [{ id: 'r1', name: 'Ruleset One', status: 'violated', violations: { error: 1, warn: 0, info: 0 } }],
      },
    ]);
  });

  it('returns an empty subItems array when there are no rulesets', () => {
    const policies: CompliancePolicyEntry[] = [{ policyId: 'p1', policyName: 'Policy One', status: 'compliant', rulesets: { count: 0, list: [] } }];
    expect(mapPolicyNestedItems(policies)[0].subItems).toEqual([]);
  });

  it('returns an empty array for no policies', () => {
    expect(mapPolicyNestedItems([])).toEqual([]);
  });
});

describe('countViolated', () => {
  it('counts entries with a violated status', () => {
    expect(countViolated([{ status: 'violated' }, { status: 'adhered' }, { status: 'violated' }])).toBe(2);
  });

  it('returns 0 when nothing is violated', () => {
    expect(countViolated([{ status: 'adhered' }])).toBe(0);
  });

  it('returns 0 for an empty list', () => {
    expect(countViolated([])).toBe(0);
  });
});

describe('complianceEntryToRow', () => {
  it('projects a compliance summary entry into a table row', () => {
    const entry = {
      status: 'non-compliant',
      ruleViolations: { error: 1, warn: 0, info: 0 },
      policies: {
        count: 2,
        list: [
          { policyId: 'p1', policyName: 'P1', status: 'violated', rulesets: { count: 0, list: [] } },
          { policyId: 'p2', policyName: 'P2', status: 'adhered', rulesets: { count: 0, list: [] } },
        ] as CompliancePolicyEntry[],
      },
    };
    const row = complianceEntryToRow(entry, 'proj-1', 'My Project');
    expect(row.id).toBe('proj-1');
    expect(row.name).toBe('My Project');
    expect(row.status).toBe('non-compliant');
    expect(row.violations).toEqual({ error: 1, warn: 0, info: 0 });
    expect(row.failed).toBe(1);
    expect(row.total).toBe(2);
    expect(row.searchText).toBe(JSON.stringify(entry));
    expect(row.items).toEqual(mapPolicyNestedItems(entry.policies.list));
  });
});

describe('adherenceEntryToRow', () => {
  it('projects a policy-adherence entry using its group roll-up', () => {
    const entry = { policyId: 'p1', policyName: 'Policy One', status: 'violated' };
    const group = { count: 5, summary: { nonCompliant: 2 } };
    const items: ComplianceNestedItem[] = [{ id: 'proj-1', name: 'Project 1', status: 'non-compliant' }];
    const row = adherenceEntryToRow(entry, group, items);
    expect(row).toEqual({
      id: 'p1',
      name: 'Policy One',
      status: 'violated',
      failed: 2,
      total: 5,
      searchText: JSON.stringify(entry),
      items,
    });
  });

  it('defaults failed/total to 0 when there is no group', () => {
    const entry = { policyId: 'p1', policyName: 'Policy One', status: 'adhered' };
    const row = adherenceEntryToRow(entry, undefined, []);
    expect(row.failed).toBe(0);
    expect(row.total).toBe(0);
  });
});

describe('buildPolicyTypeMap', () => {
  it('merges policy types from both policy entries and compliance entries', () => {
    const policyEntries = [
      { policyId: 'p1', policyType: 'ai' },
      { policyId: 'p2', policyType: 'ruleset' },
    ];
    const complianceEntries = [
      {
        policies: {
          list: [{ policyId: 'p3', policyName: 'P3', status: 'compliant', policyType: 'ruleset', rulesets: { count: 0, list: [] } }] as CompliancePolicyEntry[],
        },
      },
    ];
    expect(buildPolicyTypeMap(policyEntries, complianceEntries)).toEqual({ p1: 'ai', p2: 'ruleset', p3: 'ruleset' });
  });

  it('skips entries missing a policyId or policyType', () => {
    const policyEntries = [
      { policyId: null, policyType: 'ai' },
      { policyId: 'p1', policyType: undefined },
    ];
    expect(buildPolicyTypeMap(policyEntries, [])).toEqual({});
  });

  it('lets compliance entries override policy entries for the same id', () => {
    const policyEntries = [{ policyId: 'p1', policyType: 'ai' }];
    const complianceEntries = [
      {
        policies: {
          list: [{ policyId: 'p1', policyName: 'P1', status: 'compliant', policyType: 'ruleset', rulesets: { count: 0, list: [] } }] as CompliancePolicyEntry[],
        },
      },
    ];
    expect(buildPolicyTypeMap(policyEntries, complianceEntries)).toEqual({ p1: 'ruleset' });
  });

  it('returns an empty map for empty inputs', () => {
    expect(buildPolicyTypeMap([], [])).toEqual({});
  });
});

describe('groupRulesBySeverity', () => {
  const rulesets: RuleAdherenceRulesetEntry[] = [
    {
      rulesetId: 'r1',
      rulesetName: 'Ruleset One',
      status: 'violated',
      ruleViolations: { error: 1, warn: 1, info: 0 },
      violatedRules: {
        count: 2,
        list: [
          { ruleId: 'e1', ruleName: 'Error Rule', severity: 'error', message: 'bad thing' },
          { ruleId: 'w1', ruleName: 'Warn Rule', severity: 'warn', message: 'meh thing' },
        ],
      },
      adheredRules: {
        count: 1,
        list: [{ ruleId: 'p1', ruleName: 'Passed Rule', severity: 'info', message: 'all good' }],
      },
    },
  ];

  it('buckets violated rules by severity and adhered rules as passed', () => {
    const groups = groupRulesBySeverity(rulesets, '');
    const bySeverity = Object.fromEntries(groups.map((g) => [g.severity, g.rules.map((r) => r.rule.ruleId)]));
    expect(bySeverity.error).toEqual(['e1']);
    expect(bySeverity.warn).toEqual(['w1']);
    expect(bySeverity.info).toEqual([]);
    expect(bySeverity.passed).toEqual(['p1']);
  });

  it('ignores violated rules with an unrecognized severity', () => {
    const withBadSeverity: RuleAdherenceRulesetEntry[] = [
      {
        ...rulesets[0],
        violatedRules: { count: 1, list: [{ ruleId: 'c1', ruleName: 'Critical Rule', severity: 'critical', message: 'oh no' }] },
        adheredRules: { count: 0, list: [] },
      },
    ];
    const groups = groupRulesBySeverity(withBadSeverity, '');
    expect(groups.every((g) => g.rules.length === 0)).toBe(true);
  });

  it('defaults missing violatedRules/adheredRules to empty lists', () => {
    const minimal = [{ rulesetId: 'r2', rulesetName: 'Ruleset Two', status: 'adhered', ruleViolations: { error: 0, warn: 0, info: 0 }, violatedRules: { count: 0, list: [] } }] as RuleAdherenceRulesetEntry[];
    const groups = groupRulesBySeverity(minimal, '');
    expect(groups.every((g) => g.rules.length === 0)).toBe(true);
  });

  it('filters by rule name, message, or ruleset name (case-insensitive)', () => {
    expect(
      groupRulesBySeverity(rulesets, 'ERROR RULE')
        .flatMap((g) => g.rules)
        .map((r) => r.rule.ruleId),
    ).toEqual(['e1']);
    expect(
      groupRulesBySeverity(rulesets, 'meh')
        .flatMap((g) => g.rules)
        .map((r) => r.rule.ruleId),
    ).toEqual(['w1']);
    expect(
      groupRulesBySeverity(rulesets, 'ruleset one')
        .flatMap((g) => g.rules)
        .map((r) => r.rule.ruleId),
    ).toEqual(['e1', 'w1', 'p1']);
  });

  it('returns no matches for a search phrase that matches nothing', () => {
    const groups = groupRulesBySeverity(rulesets, 'nonexistent-phrase');
    expect(groups.every((g) => g.rules.length === 0)).toBe(true);
  });
});

describe('complianceSlices', () => {
  it('maps a summary into pie slices', () => {
    expect(complianceSlices({ total: 10, compliant: 6, nonCompliant: 3, notApplicable: 1 })).toEqual([
      { name: 'Compliant', value: 6, tone: 'success' },
      { name: 'Non-Compliant', value: 3, tone: 'error' },
      { name: 'Not Applicable', value: 1, tone: 'neutral' },
    ]);
  });

  it('defaults all values to 0 when no summary is given', () => {
    expect(complianceSlices(undefined)).toEqual([
      { name: 'Compliant', value: 0, tone: 'success' },
      { name: 'Non-Compliant', value: 0, tone: 'error' },
      { name: 'Not Applicable', value: 0, tone: 'neutral' },
    ]);
  });
});

describe('adherenceSlices', () => {
  it('maps a summary into pie slices', () => {
    expect(adherenceSlices({ total: 10, adhered: 7, violated: 2, unapplied: 1 })).toEqual([
      { name: 'Adhered', value: 7, tone: 'success' },
      { name: 'Violated', value: 2, tone: 'error' },
      { name: 'Unapplied', value: 1, tone: 'neutral' },
    ]);
  });

  it('defaults all values to 0 when no summary is given', () => {
    expect(adherenceSlices(undefined)).toEqual([
      { name: 'Adhered', value: 0, tone: 'success' },
      { name: 'Violated', value: 0, tone: 'error' },
      { name: 'Unapplied', value: 0, tone: 'neutral' },
    ]);
  });
});
