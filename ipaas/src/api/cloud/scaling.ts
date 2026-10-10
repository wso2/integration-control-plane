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

/**
 * The BFF keeps one autoscaling setting per (component, environment). The devops API's
 * release-scoped HPA, metric and HTTP-scaler resources have no cloud counterpart, so those
 * functions stay stubs.
 */

import { bff, seg } from './_client';
import type { Autoscaling, AutoscalingCondition, AutoscalingStatus, AutoscalingWriteData, ClusterPod, Hpa, HpaMetric, HpaWriteData, HttpScaler, HttpScalerWriteData, PodMetrics, ScalingMethodToggle, ScalingPath, ScalingState } from '../../types/scaling';

const ni = (name: string): Promise<never> => Promise.reject(new Error(`[cloud] scaling.${name}: not implemented`));

interface BffAutoscalingCondition {
  type: string;
  status: string;
  reason?: string;
  message?: string;
  lastTransitionTime?: string;
}

interface BffAutoscalingStatus {
  currentReplicas: number;
  desiredReplicas: number;
  currentCpuUtilizationPercentage?: number;
  currentMemoryUtilizationPercentage?: number;
  conditions?: BffAutoscalingCondition[];
}

interface BffAutoscaling {
  environment: string;
  supported: boolean;
  effective: boolean;
  memoryEffective: boolean;
  enabled: boolean;
  minReplicas?: number;
  maxReplicas?: number;
  cpuUtilizationPercentage?: number;
  memoryUtilizationPercentage?: number;
  maxReplicasLimit: number;
  status?: BffAutoscalingStatus;
  syncStatus?: string;
  syncMessage?: string;
}

const autoscalingPath = (componentId: string, env: string): string => `/components/${seg(componentId)}/environments/${seg(env)}/autoscaling`;

const toCondition = (c: BffAutoscalingCondition): AutoscalingCondition => ({ type: c.type, status: c.status, reason: c.reason ?? '', message: c.message ?? '', lastTransitionTime: c.lastTransitionTime });

function toStatus(s: BffAutoscalingStatus): AutoscalingStatus {
  return {
    currentReplicas: s.currentReplicas,
    desiredReplicas: s.desiredReplicas,
    currentCpuUtilizationPercentage: s.currentCpuUtilizationPercentage,
    currentMemoryUtilizationPercentage: s.currentMemoryUtilizationPercentage,
    conditions: (s.conditions ?? []).map(toCondition),
  };
}

function toAutoscaling(environmentId: string, a: BffAutoscaling): Autoscaling {
  return {
    environmentId,
    supported: a.supported,
    effective: a.effective,
    memoryEffective: a.memoryEffective,
    enabled: a.enabled,
    minReplicas: a.minReplicas,
    maxReplicas: a.maxReplicas,
    cpuUtilizationPercentage: a.cpuUtilizationPercentage,
    memoryUtilizationPercentage: a.memoryUtilizationPercentage,
    maxReplicasLimit: a.maxReplicasLimit,
    status: a.status ? toStatus(a.status) : undefined,
    syncStatus: a.syncStatus || undefined,
    syncMessage: a.syncMessage || undefined,
  };
}

export const getAutoscaling = async (_orgUuid: string, _projectId: string, componentId: string, environmentId: string): Promise<Autoscaling> => toAutoscaling(environmentId, await bff.get<BffAutoscaling>(autoscalingPath(componentId, environmentId)));

// PUT replaces the whole setting and the BFF rejects unknown fields, so the body carries exactly
// the chosen fields: an unset memory target is left out, which removes any stored one. A 409 means
// the deployed release predates autoscaling, or memory targets: its message says to redeploy.
function toBffWrite(data: AutoscalingWriteData): Record<string, boolean | number> {
  if (!data.enabled) return { enabled: false };
  const { minReplicas, maxReplicas, cpuUtilizationPercentage, memoryUtilizationPercentage } = data;
  const body: Record<string, boolean | number> = { enabled: true, minReplicas, maxReplicas, cpuUtilizationPercentage };
  if (memoryUtilizationPercentage !== undefined) body.memoryUtilizationPercentage = memoryUtilizationPercentage;
  return body;
}

export const updateAutoscaling = async (_orgUuid: string, _projectId: string, componentId: string, environmentId: string, data: AutoscalingWriteData): Promise<void> => {
  await bff.put(autoscalingPath(componentId, environmentId), toBffWrite(data));
};

export const getScalingState = (_orgUuid: string, _projectId: string, _componentId: string, _releaseId: string): Promise<ScalingState> => ni('getScalingState');
export const getHttpScaler = (_orgUuid: string, _projectId: string, _componentId: string, _releaseId: string): Promise<HttpScaler | null> => ni('getHttpScaler');
export const getHpa = (_orgUuid: string, _projectId: string, _componentId: string, _releaseId: string): Promise<Hpa | null> => ni('getHpa');
export const setScalingMethod = (_orgUuid: string, _projectId: string, _path: ScalingPath, _data: ScalingMethodToggle): Promise<void> => ni('setScalingMethod');
export const updateHttpScaler = (_orgUuid: string, _projectId: string, _path: ScalingPath, _data: HttpScalerWriteData): Promise<HttpScaler> => ni('updateHttpScaler');
export const createHpa = (_orgUuid: string, _projectId: string, _path: ScalingPath, _data: HpaWriteData): Promise<Hpa> => ni('createHpa');
export const updateHpa = (_orgUuid: string, _projectId: string, _path: ScalingPath, _hpaId: string, _data: HpaWriteData): Promise<Hpa> => ni('updateHpa');
export const createHpaMetric = (_orgUuid: string, _projectId: string, _path: ScalingPath, _hpaId: string, _data: HpaMetric): Promise<HpaMetric> => ni('createHpaMetric');
export const updateHpaMetric = (_orgUuid: string, _projectId: string, _path: ScalingPath, _hpaId: string, _metricId: string, _data: HpaMetric): Promise<HpaMetric> => ni('updateHpaMetric');
export const deleteHpaMetric = (_orgUuid: string, _projectId: string, _path: ScalingPath, _hpaId: string, _metricId: string): Promise<void> => ni('deleteHpaMetric');
export const listPods = (_orgUuid: string, _projectId: string, _clusterId: string, _releaseId: string): Promise<ClusterPod[]> => ni('listPods');
export const listPodMetrics = (_orgUuid: string, _projectId: string, _clusterId: string, _releaseId: string): Promise<PodMetrics[]> => ni('listPodMetrics');
