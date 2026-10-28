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
  createDeploymentPipeline,
  deleteDeploymentPipeline,
  fetchEnvTemplates,
  fetchOrgDeploymentPipelines,
  fetchPipelineDeletionEligibility,
  fetchProjectDeploymentPipelines,
  setDefaultProjectDeploymentPipeline,
  updateDeploymentPipeline,
  updateProjectDeploymentPipelines,
} from '../api/deploymentPipelines';
import type { CreateDeploymentPipelineRequest, DeploymentPipeline, EnvTemplate, PipelineDeletionEligibility } from '../types/deploymentPipeline';
import { useOrgUuid } from './useOrgUuid';
import { useOrgs } from './useOrg';

const ROOT_KEY = 'deploymentPipelines';

/** Resolve an org's numeric id (env-templates are keyed by it) from its handle. */
function useOrgNumericId(orgHandle: string): number | undefined {
  const { data: orgs } = useOrgs();
  return orgs?.find((o) => o.handle === orgHandle)?.numericId;
}

export function useEnvTemplates(orgHandle: string) {
  const orgNumericId = useOrgNumericId(orgHandle);
  return useQuery<EnvTemplate[]>({
    queryKey: [ROOT_KEY, 'envTemplates', orgNumericId],
    queryFn: () => fetchEnvTemplates(orgNumericId!),
    enabled: orgNumericId != null,
  });
}

export function useOrgDeploymentPipelines() {
  const orgUuid = useOrgUuid();
  return useQuery<DeploymentPipeline[]>({
    queryKey: [ROOT_KEY, 'org', orgUuid],
    queryFn: () => fetchOrgDeploymentPipelines(orgUuid!),
    enabled: !!orgUuid,
  });
}

export function useProjectDeploymentPipelines(projectId: string) {
  const orgUuid = useOrgUuid();
  return useQuery<DeploymentPipeline[]>({
    queryKey: [ROOT_KEY, 'project', orgUuid, projectId],
    queryFn: () => fetchProjectDeploymentPipelines(orgUuid!, projectId),
    enabled: !!orgUuid && !!projectId,
  });
}

export function useCreateDeploymentPipeline() {
  const orgUuid = useOrgUuid();
  const qc = useQueryClient();
  return useMutation<DeploymentPipeline, Error, CreateDeploymentPipelineRequest>({
    mutationFn: (input) => {
      if (!orgUuid) throw new Error('Organization is not available.');
      return createDeploymentPipeline(orgUuid, input);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [ROOT_KEY] }),
  });
}

export function useUpdateDeploymentPipeline() {
  const orgUuid = useOrgUuid();
  const qc = useQueryClient();
  return useMutation<DeploymentPipeline, Error, { pipelineId: string; input: CreateDeploymentPipelineRequest }>({
    mutationFn: ({ pipelineId, input }) => {
      if (!orgUuid) throw new Error('Organization is not available.');
      return updateDeploymentPipeline(orgUuid, pipelineId, input);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [ROOT_KEY] }),
  });
}

export function useDeleteDeploymentPipeline() {
  const orgUuid = useOrgUuid();
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (pipelineId) => {
      if (!orgUuid) throw new Error('Organization is not available.');
      return deleteDeploymentPipeline(orgUuid, pipelineId);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [ROOT_KEY] }),
  });
}

/** Eligibility check for deleting a pipeline. Runs when `pipelineId` is set
 * (e.g. while the delete dialog is open). */
export function usePipelineDeletionEligibility(pipelineId: string | null) {
  const orgUuid = useOrgUuid();
  return useQuery<PipelineDeletionEligibility>({
    queryKey: [ROOT_KEY, 'deletionEligibility', orgUuid, pipelineId],
    queryFn: () => fetchPipelineDeletionEligibility(orgUuid!, pipelineId!),
    enabled: !!orgUuid && !!pipelineId,
  });
}

export function useUpdateProjectDeploymentPipelines(projectId: string) {
  const orgUuid = useOrgUuid();
  const qc = useQueryClient();
  return useMutation<string[], Error, string[]>({
    mutationFn: (deploymentPipelineIds) => {
      if (!orgUuid) throw new Error('Organization is not available.');
      return updateProjectDeploymentPipelines(orgUuid, projectId, deploymentPipelineIds);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [ROOT_KEY] }),
  });
}

export function useSetDefaultProjectDeploymentPipeline(projectId: string) {
  const orgUuid = useOrgUuid();
  const qc = useQueryClient();
  return useMutation<string, Error, string>({
    mutationFn: (defaultDeploymentPipelineId) => {
      if (!orgUuid) throw new Error('Organization is not available.');
      return setDefaultProjectDeploymentPipeline(orgUuid, projectId, defaultDeploymentPipelineId);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [ROOT_KEY] }),
  });
}
