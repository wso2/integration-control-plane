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

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { TOGGLE_CONFIG, updateArtifactToggleStatus } from '../api/artifactToggleMutations';
import type { Artifact, ArtifactToggleStatusInput, ArtifactTracingInput, ArtifactStatisticsInput, ArtifactToggleKind } from '../types/artifact';

export function useUpdateArtifactToggleStatus(kind: ArtifactToggleKind) {
  const qc = useQueryClient();
  const config = TOGGLE_CONFIG[kind];

  return useMutation({
    mutationFn: (input: ArtifactToggleStatusInput) => updateArtifactToggleStatus(kind, input),
    onMutate: async (input) => {
      const scope = (q: { queryKey: readonly unknown[] }) => q.queryKey[2] === input.envId && q.queryKey[3] === input.componentId;
      const filters = { queryKey: ['artifacts', input.artifactType] as const, predicate: scope };
      await qc.cancelQueries(filters);
      const previous = qc.getQueriesData<Artifact[]>(filters);
      const newValue = input.value === 'enable' ? 'enabled' : 'disabled';
      qc.setQueriesData<Artifact[]>(filters, (old) => old?.map((a) => (a.name === input.artifactName ? { ...a, [config.cacheField]: newValue } : a)));
      return { previous };
    },
    onError: (_err, _input, context) => {
      if (context?.previous) {
        for (const [key, data] of context.previous) {
          qc.setQueryData(key, data);
        }
      }
    },
  });
}

export function useUpdateArtifactTracingStatus() {
  const mutation = useUpdateArtifactToggleStatus('tracing');

  return {
    ...mutation,
    mutate: (input: ArtifactTracingInput, options?: Parameters<typeof mutation.mutate>[1]) => mutation.mutate({ ...input, value: input.trace }, options),
    mutateAsync: (input: ArtifactTracingInput, options?: Parameters<typeof mutation.mutateAsync>[1]) => mutation.mutateAsync({ ...input, value: input.trace }, options),
  };
}

export function useUpdateArtifactStatisticsStatus() {
  const mutation = useUpdateArtifactToggleStatus('statistics');

  return {
    ...mutation,
    mutate: (input: ArtifactStatisticsInput, options?: Parameters<typeof mutation.mutate>[1]) => mutation.mutate({ ...input, value: input.statistics }, options),
    mutateAsync: (input: ArtifactStatisticsInput, options?: Parameters<typeof mutation.mutateAsync>[1]) => mutation.mutateAsync({ ...input, value: input.statistics }, options),
  };
}
