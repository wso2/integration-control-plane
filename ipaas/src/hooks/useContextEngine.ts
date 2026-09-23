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
  createContextEngine,
  deleteContextEngine,
  deleteContextGrant,
  getContextEngine,
  getContextJob,
  getContextPrincipal,
  listContextEngines,
  listContextGrants,
  putContextGrant,
  queryContextEngine,
  rebuildContextEngine,
  updateContextEngineExposure,
} from '#api/contextEngine';
import { IS_WIP } from '../features';
import { CONTEXT_JOB_TERMINAL_STATES } from '../constants/contextEngine';
import type { ContextEngineExposure, ContextQueryInput, CreateContextEngineInput, PutContextGrantInput } from '../types/contextEngine';

const ROOT_KEY = 'contextEngines';

/** Context Engines: wip build with the engine URL configured and the feature flag on. */
export function isContextEngineEnabled(): boolean {
  return IS_WIP && !!window.API_CONFIG?.enableContextEngineFeature && !!window.API_CONFIG?.contextEngineApiUrl;
}

export function useContextEngines() {
  return useQuery({
    queryKey: [ROOT_KEY, 'list'],
    queryFn: () => listContextEngines(),
    enabled: isContextEngineEnabled(),
    retry: false,
  });
}

export function useContextEngine(engineId: string) {
  return useQuery({
    queryKey: [ROOT_KEY, 'detail', engineId],
    queryFn: () => getContextEngine(engineId),
    enabled: isContextEngineEnabled() && !!engineId,
    retry: false,
  });
}

export function useCreateContextEngine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateContextEngineInput) => createContextEngine(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ROOT_KEY, 'list'] }),
  });
}

export function useDeleteContextEngine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (engineId: string) => deleteContextEngine(engineId),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ROOT_KEY, 'list'] }),
  });
}

export function useUpdateContextEngineExposure(engineId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (exposure: ContextEngineExposure) => updateContextEngineExposure(engineId, exposure),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ROOT_KEY, 'detail', engineId] }),
  });
}

export function useRebuildContextEngine(engineId: string) {
  return useMutation({ mutationFn: () => rebuildContextEngine(engineId) });
}

/** Poll a build job every few seconds until it reaches a terminal state. */
export function useContextJob(jobId: string | null) {
  return useQuery({
    queryKey: [ROOT_KEY, 'job', jobId],
    queryFn: () => getContextJob(jobId!),
    enabled: isContextEngineEnabled() && !!jobId,
    refetchInterval: (query) => (query.state.data && CONTEXT_JOB_TERMINAL_STATES.has(query.state.data.state) ? false : 3000),
    retry: false,
  });
}

/** Natural-language query — a mutation because each question is a new request, not cached state. */
export function useQueryContextEngine() {
  return useMutation({ mutationFn: (input: ContextQueryInput) => queryContextEngine(input) });
}

export function useContextGrants(engineId: string) {
  return useQuery({
    queryKey: [ROOT_KEY, 'grants', engineId],
    queryFn: () => listContextGrants(engineId),
    enabled: isContextEngineEnabled() && !!engineId,
    retry: false,
  });
}

export function usePutContextGrant(engineId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<PutContextGrantInput, 'engineId'>) => putContextGrant({ ...input, engineId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [ROOT_KEY, 'grants', engineId] });
      qc.invalidateQueries({ queryKey: [ROOT_KEY, 'detail', engineId] });
    },
  });
}

export function useDeleteContextGrant(engineId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (grantId: string) => deleteContextGrant(engineId, grantId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [ROOT_KEY, 'grants', engineId] });
      qc.invalidateQueries({ queryKey: [ROOT_KEY, 'detail', engineId] });
    },
  });
}

/** Who the engine thinks the caller is — surfaced on the Access tab so grants can be reasoned about. */
export function useContextPrincipal() {
  return useQuery({
    queryKey: [ROOT_KEY, 'principal'],
    queryFn: () => getContextPrincipal(),
    enabled: isContextEngineEnabled(),
    retry: false,
    staleTime: 60_000,
  });
}
