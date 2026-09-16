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
  fetchComponents,
  fetchComponentByHandler,
  fetchComponentEndpoints,
  fetchComponentEndpointSpec,
  createComponent,
  deleteComponent,
  generateComponentEnvironmentJwtSecret,
  rotateComponentEnvironmentJwtSecret,
  updateAutoDeployEnabled,
  updateComponent,
  updateEndpoint,
  generateComponentEndpoints,
  createDeploymentTrack,
  deleteDeploymentTrack,
  checkDeploymentTrackDeletable,
} from '#api/components';
import { pollWhileDeleting } from '../utils/deletionPolling';
import type { Component, CreateComponentInput, UpdateComponentInput, UpdateAutoDeployInput, UpdateEndpointInput, GenerateComponentEndpointsInput, CreateDeploymentTrackInput } from '../types/component';
import { trackEvent } from '../utils/tracking';

export function useComponents(orgHandler: string, projectId: string) {
  return useQuery({
    queryKey: ['components', orgHandler, projectId],
    queryFn: () => fetchComponents(orgHandler, projectId),
    enabled: !!orgHandler && !!projectId,
    refetchInterval: pollWhileDeleting,
  });
}

export function useComponentByHandler(projectId: string, handler: string | undefined) {
  return useQuery({
    queryKey: ['component', projectId, handler],
    queryFn: () => fetchComponentByHandler(projectId, handler!),
    enabled: !!projectId && !!handler,
  });
}

export function useComponentEndpoints(componentId: string, versionId: string) {
  return useQuery({
    queryKey: ['componentEndpoints', componentId, versionId],
    queryFn: () => fetchComponentEndpoints(componentId, versionId),
    enabled: !!componentId && !!versionId,
    staleTime: 60_000,
  });
}

export function useCreateComponent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateComponentInput) => {
      trackEvent('component-create-start');
      return createComponent(input);
    },
    onSuccess: () => {
      trackEvent('component-create-end');
      qc.invalidateQueries({ queryKey: ['components'] });
    },
  });
}

export function useDeleteComponent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { orgHandler: string; componentId: string; projectId: string }) => deleteComponent(input),
    onSuccess: async (result, input) => {
      // The backend refuses some deletions without throwing, reporting `canDelete: false`.
      if (!result.canDelete) return;
      // Scoped per org+project — names repeat across orgs.
      const listKey = ['components', input.orgHandler, input.projectId];
      // An in-flight fetch would resolve after the mark below and overwrite it.
      await qc.cancelQueries({ queryKey: listKey });
      // The delete is only accepted here, so mark the row rather than dropping it.
      qc.setQueriesData<Component[]>({ queryKey: listKey }, (list) => list?.map((c) => (c.id === input.componentId ? { ...c, deleting: true } : c)));
      qc.invalidateQueries({ queryKey: listKey, refetchType: 'none' });
    },
  });
}

export function useGenerateComponentEnvironmentJwtSecret() {
  return useMutation({
    mutationFn: ({ componentId, environmentId }: { componentId: string; environmentId: string }) => generateComponentEnvironmentJwtSecret(componentId, environmentId),
  });
}

export function useRotateComponentEnvironmentJwtSecret() {
  return useMutation({
    mutationFn: ({ componentId, environmentId }: { componentId: string; environmentId: string }) => rotateComponentEnvironmentJwtSecret(componentId, environmentId),
  });
}

export function useUpdateAutoDeployEnabled() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateAutoDeployInput) => updateAutoDeployEnabled(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['component'] });
      qc.invalidateQueries({ queryKey: ['componentDeployment'] });
    },
  });
}

export function useUpdateComponent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateComponentInput) => updateComponent(input),
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: ['component', input.projectId, input.handler] });
      qc.invalidateQueries({ queryKey: ['components'] });
    },
  });
}

export function useCreateDeploymentTrack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateDeploymentTrackInput) => createDeploymentTrack(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['component'] }),
  });
}

export function useDeleteDeploymentTrack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { orgHandler: string; componentId: string; projectId: string; deploymentTrackId: string }) => deleteDeploymentTrack(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['component'] }),
  });
}

/** Pre-flight check (mutation, not a query) for whether a track/version can be deleted. */
export function useCheckDeploymentTrackDeletable() {
  return useMutation({
    mutationFn: (input: { orgHandler: string; componentId: string; projectId: string; deploymentTrackId: string }) => checkDeploymentTrackDeletable(input),
  });
}

export function useUpdateEndpoint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateEndpointInput) => updateEndpoint(input),
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: ['envEndpoints'] });
      qc.invalidateQueries({ queryKey: ['componentEndpoints', input.componentId, input.versionId] });
    },
  });
}

export function useFetchComponentEndpointSpec() {
  return useMutation({
    mutationFn: ({ componentId, versionId, endpointId }: { componentId: string; versionId: string; endpointId: string }) => fetchComponentEndpointSpec(componentId, versionId, endpointId),
  });
}

export function useGenerateComponentEndpoints() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: GenerateComponentEndpointsInput) => generateComponentEndpoints(input),
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: ['envEndpoints', input.componentId] });
      qc.invalidateQueries({ queryKey: ['componentEndpoints', input.componentId, input.versionId] });
    },
  });
}
