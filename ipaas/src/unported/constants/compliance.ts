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

import type { RuleSeverityGroup } from '../../types/compliance';

// The governance API mixes compliance statuses (projects/components) and
// adherence statuses (policies/rulesets); success/failure grouping is
// identical for both.
export const COMPLIANCE_SUCCESS_STATUSES: ReadonlySet<string> = new Set(['compliant', 'adhered']);
export const COMPLIANCE_FAILED_STATUSES: ReadonlySet<string> = new Set(['non-compliant', 'violated']);

export const COMPLIANCE_STATUS_LABELS: Record<string, string> = {
  compliant: 'Compliant',
  'non-compliant': 'Non-Compliant',
  'not-applicable': 'Not Applicable',
  adhered: 'Adhered',
  violated: 'Violated',
  unapplied: 'Unapplied',
};

export const RULE_SEVERITY_LABELS: Record<string, string> = {
  error: 'Error',
  warn: 'Warning',
  info: 'Info',
};

export const EMPTY_RULE_GROUP_MESSAGES: Record<RuleSeverityGroup, string> = {
  error: 'No errors found.',
  warn: 'No warnings found.',
  info: 'No info-level findings.',
  passed: 'No checks were passed.',
};

// The component-compliance responses emit a synthetic policy entry
// (policyId/policyName null, policyType 'ruleset') for standalone-ruleset
// checks; these render under this label and must not link anywhere.
export const STANDALONE_RULESET_LABEL = 'Ruleset checks';
export const STANDALONE_RULESET_ROW_ID = 'standalone-rulesets';
