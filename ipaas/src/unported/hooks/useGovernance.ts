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

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listRulesets,
  getRuleset,
  getRulesetContent,
  createRuleset,
  updateRuleset,
  deleteRuleset,
  listDocuments,
  getDocument,
  createDocument,
  updateDocument,
  deleteDocument,
  listPolicies,
  getPolicy,
  createPolicy,
  updatePolicy,
  deletePolicy,
  fetchProjectCompliance,
  fetchPolicyAdherence,
  fetchProjectPolicyAdherence,
  fetchComponentCompliance,
  fetchEndpointPolicyAdherence,
  fetchEndpointRulesetAdherence,
  fetchEndpointRuleAdherence,
} from '#api/governance';
import type { Ruleset, DocumentInfo, GovernancePolicyInfo } from '../../types/governance';

const ROOT_KEY = 'governance';

// Rulesets
export function useRulesets() {
  return useQuery({
    queryKey: [ROOT_KEY, 'rulesets'],
    queryFn: () => listRulesets(),
    retry: false,
  });
}

export function useRuleset(rulesetId: string) {
  return useQuery({
    queryKey: [ROOT_KEY, 'ruleset', rulesetId],
    queryFn: () => getRuleset(rulesetId),
    enabled: !!rulesetId,
    retry: false,
  });
}

export function useRulesetContent(rulesetId: string) {
  return useQuery({
    queryKey: [ROOT_KEY, 'ruleset', rulesetId, 'content'],
    queryFn: () => getRulesetContent(rulesetId),
    enabled: !!rulesetId,
    retry: false,
  });
}

export function useCreateRuleset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ruleset: Ruleset) => createRuleset(ruleset),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ROOT_KEY] }),
  });
}

export function useUpdateRuleset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ rulesetId, ruleset }: { rulesetId: string; ruleset: Ruleset }) => updateRuleset(rulesetId, ruleset),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ROOT_KEY] }),
  });
}

export function useDeleteRuleset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rulesetId: string) => deleteRuleset(rulesetId),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ROOT_KEY] }),
  });
}

// Documents
export function useDocuments() {
  return useQuery({
    queryKey: [ROOT_KEY, 'documents'],
    queryFn: () => listDocuments(),
    retry: false,
  });
}

export function useDocument(documentId: string) {
  return useQuery({
    queryKey: [ROOT_KEY, 'document', documentId],
    queryFn: () => getDocument(documentId),
    enabled: !!documentId,
    retry: false,
  });
}

export function useCreateDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (document: DocumentInfo) => createDocument(document),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ROOT_KEY] }),
  });
}

export function useUpdateDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ documentId, document }: { documentId: string; document: DocumentInfo }) => updateDocument(documentId, document),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ROOT_KEY] }),
  });
}

export function useDeleteDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (documentId: string) => deleteDocument(documentId),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ROOT_KEY] }),
  });
}

// Policies
export function usePolicies() {
  return useQuery({
    queryKey: [ROOT_KEY, 'policies'],
    queryFn: () => listPolicies(),
    retry: false,
  });
}

export function usePolicy(policyId: string) {
  return useQuery({
    queryKey: [ROOT_KEY, 'policy', policyId],
    queryFn: () => getPolicy(policyId),
    enabled: !!policyId,
    retry: false,
  });
}

export function useCreatePolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (policy: GovernancePolicyInfo) => createPolicy(policy),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ROOT_KEY] }),
  });
}

export function useUpdatePolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ policyId, policy }: { policyId: string; policy: GovernancePolicyInfo }) => updatePolicy(policyId, policy),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ROOT_KEY] }),
  });
}

export function useDeletePolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (policyId: string) => deletePolicy(policyId),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ROOT_KEY] }),
  });
}

// Compliance dashboards

export function useProjectCompliance() {
  return useQuery({
    queryKey: [ROOT_KEY, 'project-compliance'],
    queryFn: () => fetchProjectCompliance(),
    retry: false,
    staleTime: 60_000,
  });
}

export function usePolicyAdherence() {
  return useQuery({
    queryKey: [ROOT_KEY, 'policy-adherence'],
    queryFn: () => fetchPolicyAdherence(),
    retry: false,
    staleTime: 60_000,
  });
}

export function useProjectPolicyAdherence(projectId: string) {
  return useQuery({
    queryKey: [ROOT_KEY, 'project-policy-adherence', projectId],
    queryFn: () => fetchProjectPolicyAdherence(projectId),
    enabled: !!projectId,
    retry: false,
    staleTime: 60_000,
  });
}

export function useComponentCompliance(projectId: string) {
  return useQuery({
    queryKey: [ROOT_KEY, 'component-compliance', projectId],
    queryFn: () => fetchComponentCompliance(projectId),
    enabled: !!projectId,
    retry: false,
    staleTime: 60_000,
  });
}

export function useEndpointPolicyAdherence(projectId: string, componentId: string, apimId: string) {
  return useQuery({
    queryKey: [ROOT_KEY, 'endpoint-policy-adherence', projectId, componentId, apimId],
    queryFn: () => fetchEndpointPolicyAdherence(projectId, componentId, apimId),
    enabled: !!projectId && !!componentId && !!apimId,
    retry: false,
    staleTime: 60_000,
  });
}

export function useEndpointRulesetAdherence(projectId: string, componentId: string, apimId: string) {
  return useQuery({
    queryKey: [ROOT_KEY, 'endpoint-ruleset-adherence', projectId, componentId, apimId],
    queryFn: () => fetchEndpointRulesetAdherence(projectId, componentId, apimId),
    enabled: !!projectId && !!componentId && !!apimId,
    retry: false,
    staleTime: 60_000,
  });
}

export function useEndpointRuleAdherence(projectId: string, componentId: string, apimId: string) {
  return useQuery({
    queryKey: [ROOT_KEY, 'endpoint-rule-adherence', projectId, componentId, apimId],
    queryFn: () => fetchEndpointRuleAdherence(projectId, componentId, apimId),
    enabled: !!projectId && !!componentId && !!apimId,
    retry: false,
    staleTime: 60_000,
  });
}
