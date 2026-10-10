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

/** A container's declared cpu/memory on a release (devops units: cpu = vCPU, memory = MiB). */
export interface ReleaseContainerSpec {
  name: string;
  cpu: number;
  memory: number;
  cpu_limit: number;
  memory_limit: number;
}

/**
 * Runtime detail for a single deployed release (subset of the devops
 * AppEnvironmentDetails). Supplies the namespace + cluster needed to query pods,
 * the replica count, and the last-deployed timestamp.
 */
export interface RuntimeReleaseDetails {
  ID: string;
  namespace: string;
  replicas: number;
  undeployed: boolean;
  latest_deployment?: {
    deployment_history?: { CreatedAt?: string; change_message?: string } | null;
  } | null;
  environment: {
    environment_clusters: { cluster_id: string }[];
    namespace?: string;
  };
  containers?: ReleaseContainerSpec[];
  /** OpenChoreo component UUID and deployed image ref (cloud only — not on the wip devops shape). */
  componentId?: string;
  image?: string;
}

export interface PodResourceQuantities {
  cpu?: string;
  memory?: string;
}

export interface PodContainerState {
  running?: { startedAt?: string };
  waiting?: { reason?: string; message?: string };
  terminated?: { reason?: string; exitCode?: number };
}

export interface PodContainerStatus {
  name: string;
  ready: boolean;
  restartCount: number;
  state?: PodContainerState;
}

export interface PodSpecContainer {
  name: string;
  resources?: { requests?: PodResourceQuantities; limits?: PodResourceQuantities };
}

/** A Kubernetes Pod as returned by the data-plane resource query proxy. */
export interface ClusterPod {
  /** `deletionTimestamp` is set the moment a pod starts terminating — the phase still reads "Running". */
  metadata: { name: string; uid: string; namespace?: string; creationTimestamp?: string; deletionTimestamp?: string };
  spec: { containers: PodSpecContainer[]; nodeName?: string };
  status: {
    phase: string;
    startTime?: string;
    containerStatuses?: PodContainerStatus[];
    conditions?: { type: string; status: string; lastTransitionTime?: string; message?: string; reason?: string }[];
  };
}

export interface PodMetricsContainer {
  name: string;
  usage: { cpu: string; memory: string };
}

/** Live cpu/memory usage for a pod (metrics.k8s.io PodMetrics). */
export interface PodMetrics {
  metadata: { name: string; namespace?: string };
  timestamp?: string;
  window?: string;
  containers: PodMetricsContainer[];
}

/**
 * Server-computed cpu/memory aggregate for a release (cloud only). cpu in whole
 * cores (0.5 = 500m), memory in bytes — unlike PodMetrics, no quantity-string parsing needed.
 */
export interface ComponentLevelMetrics {
  cpu: { usedCores: number; limitCores: number };
  memory: { usedBytes: number; limitBytes: number };
}

/**
 * Pod-level metrics plus an optional pre-aggregated total. OpenChoreo has no
 * pod-level metrics source, so cloud always sends `podLevelMetrics: []` and
 * relies on `componentLevelMetrics` instead; WIP only ever fills podLevelMetrics.
 */
export interface RuntimeMetrics {
  podLevelMetrics: PodMetrics[];
  componentLevelMetrics?: ComponentLevelMetrics;
}

/**
 * An event the cluster published about a pod. The cluster keeps these for roughly an
 * hour, so an empty list is normal.
 */
export interface PodEvent {
  id: string;
  /** Kind of the object the event is about ("Pod"), shown as a chip beside the reason. */
  kind?: string;
  reason: string;
  message: string;
  count?: number;
  timestamp?: string;
}

/** Display metadata for one pod condition in the startup stepper. */
export interface PodConditionInfo {
  displayName: string;
  description: string;
  order: number;
}

/** Everything the pod drawers need to query one pod and link back to its Integration. */
export interface PodScope {
  projectId: string;
  clusterId: string;
  namespace: string;
  releaseId: string;
  orgHandler: string;
  projectHandler: string;
  componentHandler: string;
}

/** Query options for a single pod-logs fetch. */
export interface PodLogOptions {
  /** Logs from the previous container instance, available once the pod has restarted. */
  previous: boolean;
  sinceSeconds?: number;
  maxTailLines?: number;
  containerName?: string;
}

/** Aggregate usage vs. allocated, computed client-side from pods + pod metrics. */
export interface CalculatedUsage {
  /** cpu in millicores, memory in bytes. */
  cpu: { limits: number; used: number; usagePercent: number };
  memory: { limits: number; used: number; usagePercent: number };
}

/** A resource's utilization from a more direct source than {@link CalculatedUsage}, such as the autoscaler's own measurement. */
export interface UsageReading {
  /** Utilization in percent of the resource's request. */
  percent: number;
  /** The autoscaler's target for the resource, when it scales on it. */
  target?: number;
}
