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

// Governance: the list endpoints no-op to empty on cloud so the read-only listing
// pages render; the remaining get/create/update/delete/compliance functions stay
// ni() stubs until the BFF exposes them.
import type {
  Ruleset,
  RulesetList,
  DocumentInfo,
  DocumentList,
  GovernancePolicyInfo,
  GovernancePolicyList,
  ProjectComplianceResponse,
  PolicyAdherenceResponse,
  ProjectPolicyAdherenceResponse,
  ComponentComplianceResponse,
  EndpointPolicyAdherenceResponse,
  EndpointRulesetAdherenceResponse,
  RuleAdherenceResponse as GovernanceRuleAdherenceResponse,
} from '../types/governance';

const ni = (name: string): Promise<never> => Promise.reject(new Error(`[cloud] governance.${name}: not implemented`));

// awaits: governance list endpoints. Empty defaults keep the read-only listing
// pages rendering (with an empty state) instead of throwing on cloud.
export const listRulesets = (): Promise<RulesetList> => Promise.resolve({ count: 0, list: [] });
export const getRuleset = (_rulesetId: string): Promise<Ruleset> => ni('getRuleset');
export const getRulesetContent = (_rulesetId: string): Promise<string> => ni('getRulesetContent');
export const createRuleset = (_ruleset: Ruleset): Promise<Ruleset> => ni('createRuleset');
export const updateRuleset = (_rulesetId: string, _ruleset: Ruleset): Promise<Ruleset> => ni('updateRuleset');
export const deleteRuleset = (_rulesetId: string): Promise<void> => ni('deleteRuleset');

export const listDocuments = (): Promise<DocumentList> => Promise.resolve({ count: 0, list: [] });
export const getDocument = (_documentId: string): Promise<DocumentInfo> => ni('getDocument');
export const createDocument = (_document: DocumentInfo): Promise<DocumentInfo> => ni('createDocument');
export const updateDocument = (_documentId: string, _document: DocumentInfo): Promise<DocumentInfo> => ni('updateDocument');
export const deleteDocument = (_documentId: string): Promise<void> => ni('deleteDocument');

export const listPolicies = (): Promise<GovernancePolicyList> => Promise.resolve({ count: 0, list: [] });
export const getPolicy = (_policyId: string): Promise<GovernancePolicyInfo> => ni('getPolicy');
export const createPolicy = (_policy: GovernancePolicyInfo): Promise<GovernancePolicyInfo> => ni('createPolicy');
export const updatePolicy = (_policyId: string, _policy: GovernancePolicyInfo): Promise<GovernancePolicyInfo> => ni('updatePolicy');
export const deletePolicy = (_policyId: string): Promise<void> => ni('deletePolicy');

export const fetchProjectCompliance = (): Promise<ProjectComplianceResponse> => ni('fetchProjectCompliance');
export const fetchPolicyAdherence = (): Promise<PolicyAdherenceResponse> => ni('fetchPolicyAdherence');
export const fetchProjectPolicyAdherence = (_projectId: string): Promise<ProjectPolicyAdherenceResponse> => ni('fetchProjectPolicyAdherence');
export const fetchComponentCompliance = (_projectId: string): Promise<ComponentComplianceResponse> => ni('fetchComponentCompliance');
export const fetchEndpointPolicyAdherence = (_projectId: string, _componentId: string, _apimId: string): Promise<EndpointPolicyAdherenceResponse> => ni('fetchEndpointPolicyAdherence');
export const fetchEndpointRulesetAdherence = (_projectId: string, _componentId: string, _apimId: string): Promise<EndpointRulesetAdherenceResponse> => ni('fetchEndpointRulesetAdherence');
export const fetchEndpointRuleAdherence = (_projectId: string, _componentId: string, _apimId: string): Promise<GovernanceRuleAdherenceResponse> => ni('fetchEndpointRuleAdherence');
