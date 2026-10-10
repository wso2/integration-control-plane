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

import { choreoClient } from './httpClients';
import { HttpError } from '../../types/http';
import { ScalingMethod } from '../../types/scaling';
import type { Autoscaling, AutoscalingWriteData, ClusterPod, ClusterQueryResponse, Hpa, HpaMetric, HpaWriteData, HttpScaler, HttpScalerWriteData, PodMetrics, ScalingMethodToggle, ScalingPath, ScalingState } from '../../types/scaling';

// Per-environment autoscaling is the cloud model; wip scales through the release-scoped HPA below.
const cloudOnly = (name: string): Promise<never> => Promise.reject(new Error(`[wip] scaling.${name}: not implemented`));

export const getAutoscaling = (_orgUuid: string, _projectId: string, _componentId: string, _environmentId: string): Promise<Autoscaling> => cloudOnly('getAutoscaling');
export const updateAutoscaling = (_orgUuid: string, _projectId: string, _componentId: string, _environmentId: string, _data: AutoscalingWriteData): Promise<void> => cloudOnly('updateAutoscaling');

const BASE = '/devops/1.0.0/api/v1';
type Wrapped<T> = { data: T };

function dq(orgUuid: string, projectId: string, extra?: Record<string, string>): string {
  return new URLSearchParams({ organization_id: orgUuid, project_id: projectId, ...(extra ?? {}) }).toString();
}

function releaseBase(componentId: string, releaseId: string): string {
  return `${BASE}/components/${encodeURIComponent(componentId)}/release/${encodeURIComponent(releaseId)}`;
}

// Raw shape of the release-detail response — private to this file.
interface RawRelease {
  app?: { app_environments?: Array<{ ID: string; replicas?: number; scale_to_zero_enabled?: boolean; scaling_method?: string; version_id?: string }> };
}

function normalizeMethod(value: string | undefined): ScalingMethod {
  switch ((value ?? '').toLowerCase()) {
    case 'hpa':
      return ScalingMethod.HPA;
    case 'scaletozero':
      return ScalingMethod.ScaleToZero;
    case 'none':
      return ScalingMethod.None;
    default:
      return ScalingMethod.Undefined;
  }
}

export async function getScalingState(orgUuid: string, projectId: string, componentId: string, releaseId: string): Promise<ScalingState> {
  const res = await choreoClient.get<Wrapped<RawRelease>>(`${releaseBase(componentId, releaseId)}?${dq(orgUuid, projectId)}`);
  const env = res.data?.app?.app_environments?.find((e) => e.ID === releaseId);
  return { method: normalizeMethod(env?.scaling_method), scaleToZeroEnabled: !!env?.scale_to_zero_enabled, replicas: env?.replicas ?? 0, version: env?.version_id ?? '' };
}

export async function getHttpScaler(orgUuid: string, projectId: string, componentId: string, releaseId: string): Promise<HttpScaler | null> {
  try {
    const res = await choreoClient.get<Wrapped<HttpScaler>>(`${releaseBase(componentId, releaseId)}/http-scaler?${dq(orgUuid, projectId)}`);
    return res.data ?? null;
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) return null;
    throw e;
  }
}

export async function getHpa(orgUuid: string, projectId: string, componentId: string, releaseId: string): Promise<Hpa | null> {
  const res = await choreoClient.get<Wrapped<Hpa[]>>(`${releaseBase(componentId, releaseId)}/hpa?${dq(orgUuid, projectId)}`);
  return res.data?.[0] ?? null;
}

export async function setScalingMethod(orgUuid: string, projectId: string, path: ScalingPath, data: ScalingMethodToggle): Promise<void> {
  await choreoClient.post(`${BASE}/components/${encodeURIComponent(path.componentId)}/releases/${encodeURIComponent(path.releaseId)}/scaling-method?${dq(orgUuid, projectId)}`, data);
}

export async function updateHttpScaler(orgUuid: string, projectId: string, path: ScalingPath, data: HttpScalerWriteData): Promise<HttpScaler> {
  const res = await choreoClient.patch<Wrapped<HttpScaler>>(`${releaseBase(path.componentId, path.releaseId)}/http-scaler?${dq(orgUuid, projectId)}`, data);
  return res.data;
}

export async function createHpa(orgUuid: string, projectId: string, path: ScalingPath, data: HpaWriteData): Promise<Hpa> {
  const res = await choreoClient.post<Wrapped<Hpa>>(`${releaseBase(path.componentId, path.releaseId)}/hpa?${dq(orgUuid, projectId)}`, data);
  return res.data;
}

export async function updateHpa(orgUuid: string, projectId: string, path: ScalingPath, hpaId: string, data: HpaWriteData): Promise<Hpa> {
  const res = await choreoClient.put<Wrapped<Hpa>>(`${releaseBase(path.componentId, path.releaseId)}/hpa/${encodeURIComponent(hpaId)}?${dq(orgUuid, projectId)}`, { ...data, ID: hpaId });
  return res.data;
}

export async function createHpaMetric(orgUuid: string, projectId: string, path: ScalingPath, hpaId: string, data: HpaMetric): Promise<HpaMetric> {
  const res = await choreoClient.post<Wrapped<HpaMetric>>(`${releaseBase(path.componentId, path.releaseId)}/hpa/${encodeURIComponent(hpaId)}/metric?${dq(orgUuid, projectId)}`, data);
  return res.data;
}

export async function updateHpaMetric(orgUuid: string, projectId: string, path: ScalingPath, hpaId: string, metricId: string, data: HpaMetric): Promise<HpaMetric> {
  const res = await choreoClient.put<Wrapped<HpaMetric>>(`${releaseBase(path.componentId, path.releaseId)}/hpa/${encodeURIComponent(hpaId)}/metric/${encodeURIComponent(metricId)}?${dq(orgUuid, projectId)}`, data);
  return res.data;
}

export async function deleteHpaMetric(orgUuid: string, projectId: string, path: ScalingPath, hpaId: string, metricId: string): Promise<void> {
  await choreoClient.delete(`${releaseBase(path.componentId, path.releaseId)}/hpa/${encodeURIComponent(hpaId)}/metric/${encodeURIComponent(metricId)}?${dq(orgUuid, projectId)}`);
}

export async function listPods(orgUuid: string, projectId: string, clusterId: string, releaseId: string): Promise<ClusterPod[]> {
  const res = await choreoClient.get<ClusterQueryResponse<ClusterPod>>(`${BASE}/clusters/${encodeURIComponent(clusterId)}/query/v1/Pod?${dq(orgUuid, projectId, { labelSelector: `release_id=${releaseId}` })}`);
  return res.payload ?? [];
}

export async function listPodMetrics(orgUuid: string, projectId: string, clusterId: string, releaseId: string): Promise<PodMetrics[]> {
  const res = await choreoClient.get<ClusterQueryResponse<PodMetrics>>(`${BASE}/clusters/${encodeURIComponent(clusterId)}/query/metrics.k8s.io%252Fv1beta1/PodMetrics?${dq(orgUuid, projectId, { labelSelector: `release_id=${releaseId}` })}`);
  return res.payload ?? [];
}
