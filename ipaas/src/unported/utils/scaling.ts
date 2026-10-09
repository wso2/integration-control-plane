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

import { getPodStatus } from '../../utils/pods';
import type { PodRow } from '../../types/scaling';
import type { ClusterPod, PodMetrics } from '../../types/runtime';

/** Sum a pod's per-container CPU / memory usage (raw k8s quantity strings, joined for display). */
function podUsage(name: string, metrics: PodMetrics[]): { cpu?: string; memory?: string } {
  const m = metrics.find((x) => x.metadata.name === name);
  if (!m?.containers?.length) return {};
  const cpu =
    m.containers
      .map((c) => c.usage?.cpu)
      .filter(Boolean)
      .join(' + ') || undefined;
  const memory =
    m.containers
      .map((c) => c.usage?.memory)
      .filter(Boolean)
      .join(' + ') || undefined;
  return { cpu, memory };
}

export function derivePodRows(pods: ClusterPod[], metrics: PodMetrics[]): PodRow[] {
  return pods.map((pod) => {
    const { status, isRunning } = getPodStatus(pod);
    const containerStatuses = pod.status?.containerStatuses ?? [];
    const totalContainers = pod.spec?.containers?.length ?? containerStatuses.length;
    const usage = podUsage(pod.metadata.name, metrics);
    return {
      name: pod.metadata.name,
      status,
      isRunning,
      readyContainers: containerStatuses.filter((c) => c.ready).length,
      totalContainers,
      restarts: containerStatuses.reduce((sum, c) => sum + (c.restartCount ?? 0), 0),
      lastActivity: pod.status?.startTime ?? pod.metadata.creationTimestamp,
      cpu: usage.cpu,
      memory: usage.memory,
    };
  });
}

export function componentScalingBase(org: string, project: string, component: string): string {
  return `/organizations/${org}/projects/${project}/components/${component}/admin/scaling`;
}
