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
import { createHpa, createHpaMetric, deleteHpaMetric, getAutoscaling, getHpa, getHttpScaler, getScalingState, listPodMetrics, listPods, setScalingMethod, updateAutoscaling, updateHpa, updateHpaMetric, updateHttpScaler } from '#api/scaling';
import { IS_CLOUD, IS_WIP } from '../features';
import { useOrgUuid } from './useOrgUuid';
import { pollsAutoscaling } from '../utils/scaling';
import type { AutoscalingWriteData, HpaMetric, HpaWriteData, HttpScalerWriteData, ScalingMethodToggle, ScalingPath } from '../types/scaling';

const ROOT = 'scaling';

/** The devops-API scaling surface is wip-only (the cloud stubs throw). */
export function isScalingEnabled(): boolean {
  return IS_WIP;
}

/** Per-environment autoscaling is cloud-only (the wip stubs throw). */
export function isAutoscalingEnabled(): boolean {
  return IS_CLOUD;
}

const AUTOSCALING_POLL_MS = 10_000;

export function useAutoscaling(projectId: string, componentId: string | undefined, environmentId: string) {
  const orgUuid = useOrgUuid();
  return useQuery({
    queryKey: [ROOT, 'autoscaling', orgUuid, projectId, componentId, environmentId],
    queryFn: () => getAutoscaling(orgUuid!, projectId, componentId!, environmentId),
    enabled: isAutoscalingEnabled() && !!orgUuid && !!projectId && !!componentId && !!environmentId,
    retry: false,
    refetchInterval: (query) => (pollsAutoscaling(query.state.data) ? AUTOSCALING_POLL_MS : false),
  });
}

export function useUpdateAutoscaling(projectId: string) {
  const orgUuid = useOrgUuid();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ componentId, environmentId, data }: { componentId: string; environmentId: string; data: AutoscalingWriteData }) => {
      if (!orgUuid) throw new Error('Organization is not available.');
      return updateAutoscaling(orgUuid, projectId, componentId, environmentId, data);
    },
    // Resync after failures too: a rejected write leaves the saved setting as the truth to show.
    onSettled: () => qc.invalidateQueries({ queryKey: [ROOT, 'autoscaling'] }),
  });
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
