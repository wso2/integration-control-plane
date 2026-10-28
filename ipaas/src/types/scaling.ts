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

// Component scaling, backed by the DevOps API (shared with Devant). Config lives across three
// sub-resources of a component release; the active method is a boolean toggle (scale-to-zero vs HPA).

export const ScalingMethod = {
  HPA: 'HPA',
  ScaleToZero: 'ScaleToZero',
  None: 'None',
  Undefined: 'Undefined',
} as const;
export type ScalingMethod = (typeof ScalingMethod)[keyof typeof ScalingMethod];

/** Effective scaling state read from the component release. */
export interface ScalingState {
  method: ScalingMethod;
  scaleToZeroEnabled: boolean;
  replicas: number;
  version: string;
}

export interface HttpScaler {
  min?: number;
  max: number;
  target_pending_requests: number;
}

export interface HttpScalerWriteData {
  max: number;
  target_pending_requests: number;
}

export type MetricResource = 'cpu' | 'memory';

export interface HpaMetric {
  ID?: string;
  type: 'Resource';
  rule: { resource: { name: MetricResource; value: string; type?: 'utilization' | 'value' } };
}

export interface Hpa {
  ID: string;
  min: number;
  max: number;
  version?: string;
  app_environment_id?: string;
  metrics?: HpaMetric[];
}

export interface HpaWriteData {
  organization_id: string;
  project_id: string;
  version: string;
  app_environment_id: string;
  min: number;
  max: number;
}

export interface ScalingMethodToggle {
  scale_to_zero_enabled: boolean;
}

/** Release path segments shared by the scaling sub-resource endpoints. */
export interface ScalingPath {
  componentId: string;
  releaseId: string;
}

/* ── cloud autoscaling ─────────────────────────────────────────────────────── */

// Cloud scales through one per-environment HPA setting rather than the devops API's
// release-scoped HPA, metric and HTTP-scaler resources: CPU is always a metric, memory
// an optional second one, and there is no scale to zero.

export interface AutoscalingCondition {
  type: string;
  status: string;
  reason: string;
  message: string;
  /** When the condition took its current status (RFC 3339); absent if the cluster did not report it. */
  lastTransitionTime?: string;
}

/** The live HPA, read from the data plane. Absent while autoscaling is off or before the HPA exists. */
export interface AutoscalingStatus {
  currentReplicas: number;
  desiredReplicas: number;
  currentCpuUtilizationPercentage?: number;
  /** Reported only while the HPA targets memory. */
  currentMemoryUtilizationPercentage?: number;
  conditions: AutoscalingCondition[];
}

export interface Autoscaling {
  environmentId: string;
  /** False for integration types that cannot autoscale; writes are rejected. */
  supported: boolean;
  /** False when the deployed release predates autoscaling support; enabling needs a redeploy first. */
  effective: boolean;
  /** False when the deployed release predates memory targets: it would drop one, so setting one needs a redeploy first. */
  memoryEffective: boolean;
  enabled: boolean;
  /** Unset until autoscaling is first configured for the environment. */
  minReplicas?: number;
  maxReplicas?: number;
  cpuUtilizationPercentage?: number;
  /** Set while the HPA also scales on memory, following whichever metric asks for more replicas. */
  memoryUtilizationPercentage?: number;
  /** Highest max replicas the platform accepts. */
  maxReplicasLimit: number;
  status?: AutoscalingStatus;
  /** Set when the last applied setting failed to render or apply; the message says why. */
  syncStatus?: string;
  syncMessage?: string;
}

/** Enabling replaces every bound, and an omitted memory target removes any stored one; disabling carries `enabled` alone. */
export type AutoscalingWriteData = { enabled: true; minReplicas: number; maxReplicas: number; cpuUtilizationPercentage: number; memoryUtilizationPercentage?: number } | { enabled: false };

/* ── pods / replicas (phase 4) ─────────────────────────────────────────────── */

/** Cluster-query envelope: `{ payload: [...raw k8s objects] }`. */
export interface ClusterQueryResponse<T> {
  payload: T[];
  status?: string;
}

// Pods and their metrics come from the same data-plane query proxy the Runtime surface
// uses, so both surfaces share one shape.
export type { ClusterPod, PodMetrics } from './runtime';

/** A row in the replicas table (derived from a pod + optional metrics). */
export interface PodRow {
  name: string;
  status: string;
  isRunning: boolean;
  readyContainers: number;
  totalContainers: number;
  restarts: number;
  lastActivity?: string;
  cpu?: string;
  memory?: string;
}
