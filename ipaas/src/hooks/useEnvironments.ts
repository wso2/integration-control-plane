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
import { getOrgUuidFromToken } from '../auth';
import { fetchAllEnvironments, fetchCloudDataPlanes, fetchEnvironmentIdentityProvider, fetchEnvironments, fetchEnvironmentTemplates, fetchLoggers, updateLogLevel } from '../api/environments';

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

/** The org's identity platform in an environment, where OAuth clients of its integrations' APIs are created. */
export function useEnvironmentIdentityProvider(environmentName: string, enabled = true) {
  return useQuery({
    queryKey: ['environment-identity-provider', environmentName],
    queryFn: () => fetchEnvironmentIdentityProvider(environmentName),
    enabled: enabled && !!environmentName,
    // Changes only when the org's identity platform is provisioned or moved.
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export function useLoggers(environmentId: string, componentId: string) {
  return useQuery({
    queryKey: ['loggers', environmentId, componentId],
    queryFn: () => fetchLoggers(environmentId, componentId),
    enabled: !!environmentId && !!componentId,
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
    retry: false,
  });
}
