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
import { createHpa, createHpaMetric, deleteHpaMetric, getHpa, getHttpScaler, getScalingState, listPodMetrics, listPods, setScalingMethod, updateHpa, updateHpaMetric, updateHttpScaler } from '../../api/scaling';
import { useOrgUuid } from '../../hooks/useOrgUuid';
import type { HpaMetric, HpaWriteData, HttpScalerWriteData, ScalingMethodToggle, ScalingPath } from '../../types/scaling';

const ROOT = 'scaling';

/** Scaling is not served by the BFF yet; flip this when the feature is ported. */
export function isScalingEnabled(): boolean {
  return false;
}

export function useScalingState(projectId: string, componentId: string, releaseId: string) {
  const orgUuid = useOrgUuid();
  return useQuery({
    queryKey: [ROOT, 'state', orgUuid, projectId, componentId, releaseId],
    queryFn: () => getScalingState(orgUuid!, projectId, componentId, releaseId),
    enabled: isScalingEnabled() && !!orgUuid && !!projectId && !!componentId && !!releaseId,
    retry: false,
  });
}

export function useHttpScaler(projectId: string, componentId: string, releaseId: string) {
  const orgUuid = useOrgUuid();
  return useQuery({
    queryKey: [ROOT, 'http-scaler', orgUuid, projectId, componentId, releaseId],
    queryFn: () => getHttpScaler(orgUuid!, projectId, componentId, releaseId),
    enabled: isScalingEnabled() && !!orgUuid && !!projectId && !!componentId && !!releaseId,
    retry: false,
  });
}

export function useHpa(projectId: string, componentId: string, releaseId: string) {
  const orgUuid = useOrgUuid();
  return useQuery({
    queryKey: [ROOT, 'hpa', orgUuid, projectId, componentId, releaseId],
    queryFn: () => getHpa(orgUuid!, projectId, componentId, releaseId),
    enabled: isScalingEnabled() && !!orgUuid && !!projectId && !!componentId && !!releaseId,
    retry: false,
  });
}

export function useSetScalingMethod(projectId: string) {
  const orgUuid = useOrgUuid();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { path: ScalingPath; data: ScalingMethodToggle }) => setScalingMethod(orgUuid!, projectId, vars.path, vars.data),
    // Resync after every attempt: a timed-out request may still have applied server-side,
    // so a retry would 400 with "already set" while the state has actually changed.
    onSettled: () => qc.invalidateQueries({ queryKey: [ROOT] }),
  });
}

export function useUpdateHttpScaler(projectId: string) {
  const orgUuid = useOrgUuid();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { path: ScalingPath; data: HttpScalerWriteData }) => updateHttpScaler(orgUuid!, projectId, vars.path, vars.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ROOT] }),
  });
}

export function useCreateHpa(projectId: string) {
  const orgUuid = useOrgUuid();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { path: ScalingPath; data: HpaWriteData }) => createHpa(orgUuid!, projectId, vars.path, vars.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ROOT] }),
  });
}

export function useUpdateHpa(projectId: string) {
  const orgUuid = useOrgUuid();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { path: ScalingPath; hpaId: string; data: HpaWriteData }) => updateHpa(orgUuid!, projectId, vars.path, vars.hpaId, vars.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: [ROOT] }),
  });
}

export function useHpaMetricMutations(projectId: string) {
  const orgUuid = useOrgUuid();
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: [ROOT] });
  return {
    create: useMutation({ mutationFn: (v: { path: ScalingPath; hpaId: string; data: HpaMetric }) => createHpaMetric(orgUuid!, projectId, v.path, v.hpaId, v.data), onSuccess: invalidate }),
    update: useMutation({ mutationFn: (v: { path: ScalingPath; hpaId: string; metricId: string; data: HpaMetric }) => updateHpaMetric(orgUuid!, projectId, v.path, v.hpaId, v.metricId, v.data), onSuccess: invalidate }),
    remove: useMutation({ mutationFn: (v: { path: ScalingPath; hpaId: string; metricId: string }) => deleteHpaMetric(orgUuid!, projectId, v.path, v.hpaId, v.metricId), onSuccess: invalidate }),
  };
}

export function usePods(projectId: string, clusterId: string, releaseId: string) {
  const orgUuid = useOrgUuid();
  return useQuery({
    queryKey: [ROOT, 'pods', orgUuid, projectId, clusterId, releaseId],
    queryFn: () => listPods(orgUuid!, projectId, clusterId, releaseId),
    enabled: isScalingEnabled() && !!orgUuid && !!projectId && !!clusterId && !!releaseId,
    retry: false,
    staleTime: 30_000,
  });
}

export function usePodMetrics(projectId: string, clusterId: string, releaseId: string, enabled = true) {
  const orgUuid = useOrgUuid();
  return useQuery({
    queryKey: [ROOT, 'pod-metrics', orgUuid, projectId, clusterId, releaseId],
    queryFn: () => listPodMetrics(orgUuid!, projectId, clusterId, releaseId),
    enabled: isScalingEnabled() && enabled && !!orgUuid && !!projectId && !!clusterId && !!releaseId,
    retry: false,
    staleTime: 30_000,
  });
}
