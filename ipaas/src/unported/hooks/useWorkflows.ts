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
import { cancelWorkflowInstance, createWorkflowConfig, fetchPastWorkflowInstances, fetchWorkflowConfigs, fetchWorkflowDefinitions, fetchWorkflowInstances, fetchWorkflowReviewData, reviewWorkflowInstance, updateWorkflowConfig } from '#api/workflows';
import type { OrgWorkflowConfig, ReviewerDecisionRequest, WorkflowConfigRequest, WorkflowDefinition, WorkflowInstanceResponse, WorkflowReviewData } from '../../types/workflow';

const ROOT_KEY = 'workflows';

export function useWorkflowDefinitions() {
  return useQuery<WorkflowDefinition[]>({
    queryKey: [ROOT_KEY, 'definitions'],
    queryFn: fetchWorkflowDefinitions,
  });
}

export function useWorkflowConfigs() {
  return useQuery<OrgWorkflowConfig[]>({
    queryKey: [ROOT_KEY, 'configs'],
    queryFn: fetchWorkflowConfigs,
  });
}

export function useCreateWorkflowConfig() {
  const qc = useQueryClient();
  return useMutation<OrgWorkflowConfig, Error, WorkflowConfigRequest>({
    mutationFn: (input) => createWorkflowConfig(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ROOT_KEY] }),
  });
}

export function useUpdateWorkflowConfig() {
  const qc = useQueryClient();
  return useMutation<OrgWorkflowConfig, Error, { configId: string; input: WorkflowConfigRequest }>({
    mutationFn: ({ configId, input }) => updateWorkflowConfig(configId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ROOT_KEY] }),
  });
}

// --- Approval requests (workflow instances) ---

export function useWorkflowInstances() {
  return useQuery<WorkflowInstanceResponse[]>({
    queryKey: [ROOT_KEY, 'instances', 'pending'],
    queryFn: fetchWorkflowInstances,
    retry: false,
  });
}

export function usePastWorkflowInstances() {
  return useQuery<WorkflowInstanceResponse[]>({
    queryKey: [ROOT_KEY, 'instances', 'past'],
    queryFn: fetchPastWorkflowInstances,
    retry: false,
  });
}

export function useWorkflowReviewData(workflowId: string | null) {
  return useQuery<WorkflowReviewData>({
    queryKey: [ROOT_KEY, 'review', workflowId],
    queryFn: () => fetchWorkflowReviewData(workflowId!),
    enabled: !!workflowId,
    retry: false,
  });
}

export function useReviewWorkflow() {
  const qc = useQueryClient();
  return useMutation<void, Error, { workflowId: string; input: ReviewerDecisionRequest }>({
    mutationFn: ({ workflowId, input }) => reviewWorkflowInstance(workflowId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ROOT_KEY, 'instances'] }),
  });
}

export function useCancelWorkflowInstance() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (workflowId) => cancelWorkflowInstance(workflowId),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ROOT_KEY, 'instances'] }),
  });
}
