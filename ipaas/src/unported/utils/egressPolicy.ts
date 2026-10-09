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

import type { EgressMode, EgressPolicy, EgressPolicyRequest, EgressRule, EgressRuleType } from '../../types/egressPolicy';

const CIDR_RE = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/;
const FQDN_RE = /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

/** Classify a rule value as a CIDR range or FQDN, or null if it is neither. */
export function detectRuleType(value: string): EgressRuleType | null {
  if (CIDR_RE.test(value)) return 'CIDR';
  if (FQDN_RE.test(value)) return 'FQDN';
  return null;
}

/** Infer a saved policy's mode: any allow (`egress`) rules ⇒ deny-all; otherwise allow-all. */
export function modeOfPolicy(policy: EgressPolicy): EgressMode {
  return policy.egress.length > 0 ? 'deny-all' : 'allow-all';
}

/** The rules that belong to the given mode (allow-all → deny list, deny-all → allow list). */
export function rulesForMode(policy: EgressPolicy | null, mode: EgressMode): EgressRule[] {
  if (!policy) return [];
  return mode === 'allow-all' ? policy.egress_deny : policy.egress;
}

/** Build a create/update body placing `rules` in the array that matches the mode. */
export function buildEgressRequest(mode: EgressMode, rules: EgressRule[], policyId?: string): EgressPolicyRequest {
  const idPart = policyId ? { policy_id: policyId } : {};
  return mode === 'allow-all' ? { egress: [], egress_deny: rules, ...idPart } : { egress: rules, egress_deny: [], ...idPart };
}

/**
 * Build a new egress rule, validating the value against the mode. Allow-all
 * policies accept CIDR ranges only; deny-all accepts CIDR or FQDN.
 */
export function createEgressRule(name: string, value: string, mode: EgressMode): EgressRule {
  const type = detectRuleType(value);
  if (!type) throw new Error('Enter a valid CIDR range (e.g. 10.0.0.0/24) or domain (e.g. api.example.com).');
  if (mode === 'allow-all' && type !== 'CIDR') throw new Error('Allow-all policies accept CIDR ranges only.');
  const now = new Date().toISOString();
  return { rule_id: crypto.randomUUID(), name, value, type, scope: 'Organization', created_at: now, updated_at: now };
}
