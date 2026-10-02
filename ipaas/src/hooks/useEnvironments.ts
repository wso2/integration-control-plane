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
import { getOrgUuidFromToken } from '#auth';
import { createOrgEnvironment, deleteEnvironmentTemplate, fetchAllEnvironments, fetchCloudDataPlanes, fetchEnvironments, fetchEnvironmentTemplates, fetchLoggers, getEnvDeleteEligibility, updateEnvironment, updateLogLevel } from '#api/environments';
import { IS_CLOUD } from '../features';
import type { CreateEnvironmentData, EnvironmentInput } from '../types/environment';

export function useEnvironments(orgUuid: string, projectId: string) {
  const effectiveOrgUuid = getOrgUuidFromToken() ?? orgUuid;
  return useQuery({
    queryKey: ['environments', effectiveOrgUuid, projectId],
    queryFn: () => fetchEnvironments(effectiveOrgUuid, projectId),
    enabled: !!effectiveOrgUuid && !!projectId,
  });
}

export function useAllEnvironments() {
  return useQuery({
    queryKey: ['environments'],
    queryFn: fetchAllEnvironments,
    retry: false,
  });
}

export function useCloudDataPlanes(orgUuid: string) {
  return useQuery({
    queryKey: ['cloud-data-planes', orgUuid],
    queryFn: () => fetchCloudDataPlanes(orgUuid),
    enabled: !!orgUuid,
    staleTime: 5 * 60 * 1000,
  });
}

export function useLoggers(environmentId: string, componentId: string) {
  return useQuery({
    queryKey: ['loggers', environmentId, componentId],
    queryFn: () => fetchLoggers(environmentId, componentId),
    enabled: !!environmentId && !!componentId,
  });
}

export function useUpdateEnvironment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: EnvironmentInput & { environmentId: string }) => updateEnvironment(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['environments'] }),
  });
}

export function useUpdateLogLevel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: updateLogLevel,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['loggers'] });
    },
  });
}

// --- Org environment templates + REST create/delete (devops API) ---

export function useEnvironmentTemplates(orgId: string) {
  return useQuery({
    queryKey: ['environment-templates', orgId],
    queryFn: () => fetchEnvironmentTemplates(orgId),
    enabled: IS_CLOUD || !!orgId, // orgid is false in the cloud path, thus adding the IS_CLOUD
    retry: false,
  });
}

export function useAddEnvironment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateEnvironmentData & { orgUuid: string; vhost: string }) => {
      const { orgUuid, ...request } = input;
      return createOrgEnvironment(orgUuid, request);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['environment-templates'] });
      // In cloud a template *is* an environment, so the environment lists and the
      // pipeline the new environment was appended to go stale too.
      qc.invalidateQueries({ queryKey: ['environments'] });
      qc.invalidateQueries({ queryKey: ['deploymentPipelines'] });
    },
  });
}

export function useEnvDeleteEligibility(orgUuid: string, templateId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['env-delete-eligibility', orgUuid, templateId],
    queryFn: () => getEnvDeleteEligibility(orgUuid, templateId!),
    enabled: enabled && !!orgUuid && !!templateId,
    retry: false,
  });
}

export function useDeleteEnvironmentTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { orgUuid: string; templateId: string }) => deleteEnvironmentTemplate(input.orgUuid, input.templateId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['environment-templates'] });
      qc.invalidateQueries({ queryKey: ['environments'] });
    },
  });
}
