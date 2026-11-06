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
import { ARTIFACT_QUERY_MAP, fetchArtifactTypes, fetchArtifacts, fetchArtifactSource, fetchLocalEntryValue, fetchArtifactParams, fetchArtifactWsdl, updateArtifactStatus, updateListenerState } from '../api/artifacts';
import type { Artifact, ArtifactStatusInput, ListenerStateInput } from '../types/artifact';

export { ARTIFACT_QUERY_MAP };

export function useArtifactTypes(componentId: string, envId: string) {
  return useQuery({
    queryKey: ['artifactTypes', componentId, envId],
    queryFn: () => fetchArtifactTypes(componentId, envId),
    enabled: !!componentId && !!envId,
  });
}

export function useArtifacts(artifactType: string, envId: string, componentId: string, options?: { enabled?: boolean }) {
  const mapping = ARTIFACT_QUERY_MAP[artifactType];
  return useQuery({
    queryKey: ['artifacts', artifactType, envId, componentId],
    queryFn: () => fetchArtifacts(artifactType, envId, componentId),
    enabled: !!artifactType && !!envId && !!componentId && !!mapping && (options?.enabled ?? true),
    retry: false,
  });
}

export function useArtifactSource(envId: string, componentId: string, artifactType: string, artifactName: string) {
  return useQuery({
    queryKey: ['artifactSource', envId, componentId, artifactType, artifactName],
    queryFn: () => fetchArtifactSource(envId, componentId, artifactType, artifactName),
    enabled: !!envId && !!componentId && !!artifactType && !!artifactName,
  });
}

export function useLocalEntryValue(componentId: string, entryName: string, envId: string) {
  return useQuery({
    queryKey: ['localEntryValue', componentId, entryName, envId],
    queryFn: () => fetchLocalEntryValue(componentId, entryName, envId),
    enabled: !!componentId && !!entryName && !!envId,
  });
}

export function useArtifactParams(componentId: string, artifactType: string, artifactName: string, envId: string, runtimeId?: string) {
  return useQuery({
    queryKey: ['artifactParams', componentId, artifactType, artifactName, envId, runtimeId],
    queryFn: () => fetchArtifactParams(componentId, artifactType, artifactName, envId, runtimeId),
    enabled: !!componentId && !!artifactType && !!artifactName && !!envId,
  });
}

export function useArtifactWsdl(componentId: string, artifactType: string, artifactName: string, envId: string, runtimeId?: string) {
  return useQuery({
    queryKey: ['artifactWsdl', componentId, artifactType, artifactName, envId, runtimeId],
    queryFn: () => fetchArtifactWsdl(componentId, artifactType, artifactName, envId, runtimeId),
    enabled: !!componentId && !!artifactType && !!artifactName && !!envId,
  });
}

export function useUpdateArtifactStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ArtifactStatusInput) => updateArtifactStatus(input),
    onMutate: async (input) => {
      const scope = (q: { queryKey: readonly unknown[] }) => q.queryKey[2] === input.envId && q.queryKey[3] === input.componentId;
      await qc.cancelQueries({ queryKey: ['artifacts', input.artifactType], predicate: scope });
      const previousArtifacts = qc.getQueriesData<Artifact[]>({ queryKey: ['artifacts', input.artifactType], predicate: scope });
      const newState = input.status === 'active' ? 'enabled' : 'disabled';
      qc.setQueriesData<Artifact[]>({ queryKey: ['artifacts', input.artifactType], predicate: scope }, (old) => old?.map((a) => (a.name === input.artifactName ? { ...a, state: newState } : a)));
      return { previousArtifacts, scope };
    },
    onError: (_err, _input, context) => {
      if (context?.previousArtifacts) {
        for (const [queryKey, data] of context.previousArtifacts) {
          qc.setQueryData<Artifact[]>(queryKey, data);
        }
      }
    },
    onSettled: (_data, _err, input) => {
      const scope = (q: { queryKey: readonly unknown[] }) => q.queryKey[2] === input.envId && q.queryKey[3] === input.componentId;
      qc.invalidateQueries({ queryKey: ['artifacts', input.artifactType], predicate: scope });
    },
  });
}

export function useUpdateListenerState() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ListenerStateInput) => updateListenerState(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['artifacts', 'Listener'] });
    },
  });
}
