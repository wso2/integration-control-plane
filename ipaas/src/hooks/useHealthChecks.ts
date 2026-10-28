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
import { createHealthCheck, deleteHealthCheck, getHealthChecks, updateHealthCheck } from '../api/healthChecks';
import type { HealthCheck, HealthCheckWriteData } from '../types/healthChecks';
import { useOrgUuid } from './useOrgUuid';

const ROOT = 'healthChecks';

export function useHealthChecks(projectId: string, componentId: string | undefined, releaseId: string | undefined, environmentId: string | undefined) {
  const orgUuid = useOrgUuid();
  return useQuery<HealthCheck[]>({
    queryKey: [ROOT, orgUuid, projectId, componentId, releaseId, environmentId],
    queryFn: () => getHealthChecks(orgUuid!, projectId, componentId!, releaseId!, environmentId!),
    enabled: !!orgUuid && !!projectId && !!componentId && !!releaseId && !!environmentId,
  });
}

interface WritePath {
  componentId: string;
  releaseId: string;
  environmentId: string;
  containerId: string;
}

export function useCreateHealthCheck(projectId: string) {
  const orgUuid = useOrgUuid();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ componentId, releaseId, environmentId, containerId, data }: WritePath & { data: HealthCheckWriteData }) => {
      if (!orgUuid) throw new Error('Organization is not available.');
      return createHealthCheck(orgUuid, projectId, componentId, releaseId, environmentId, containerId, data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [ROOT] }),
  });
}

export function useUpdateHealthCheck(projectId: string) {
  const orgUuid = useOrgUuid();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ componentId, releaseId, environmentId, containerId, healthCheckId, data }: WritePath & { healthCheckId: string; data: HealthCheckWriteData }) => {
      if (!orgUuid) throw new Error('Organization is not available.');
      return updateHealthCheck(orgUuid, projectId, componentId, releaseId, environmentId, containerId, healthCheckId, data);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [ROOT] }),
  });
}

export function useDeleteHealthCheck(projectId: string) {
  const orgUuid = useOrgUuid();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ componentId, releaseId, environmentId, containerId, healthCheckId }: WritePath & { healthCheckId: string }) => {
      if (!orgUuid) throw new Error('Organization is not available.');
      return deleteHealthCheck(orgUuid, projectId, componentId, releaseId, environmentId, containerId, healthCheckId);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [ROOT] }),
  });
}
