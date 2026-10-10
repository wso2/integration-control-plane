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

import { getPodStatus } from './pods';
import type { Autoscaling, PodRow } from '../types/scaling';
import type { ClusterPod, PodMetrics } from '../types/runtime';

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

/** A metric the HPA cannot satisfy within its maximum replicas. */
export interface CappedMetric {
  name: 'CPU' | 'Memory';
  /** Utilization in percent of the request, averaged across the replicas. */
  current: number;
  target: number;
  /** Replicas this metric alone asks for. */
  wants: number;
}

/**
 * The metrics holding the autoscaler at its maximum, by the HPA's own rule: each metric asks for
 * ceil(current replicas × current / target) replicas, and the HPA follows the highest. Empty when
 * the status has no reading for a targeted metric, e.g. while new pods have not reported yet.
 */
export function cappedMetrics(a: Autoscaling): CappedMetric[] {
  const { status, maxReplicas } = a;
  if (!status || maxReplicas === undefined) return [];
  const readings = [
    { name: 'CPU' as const, current: status.currentCpuUtilizationPercentage, target: a.cpuUtilizationPercentage },
    { name: 'Memory' as const, current: status.currentMemoryUtilizationPercentage, target: a.memoryUtilizationPercentage },
  ];
  const capped: CappedMetric[] = [];
  for (const { name, current, target } of readings) {
    if (current === undefined || target === undefined || target <= 0) continue;
    const wants = Math.ceil((status.currentReplicas * current) / target);
    if (wants > maxReplicas) capped.push({ name, current, target, wants });
  }
  return capped;
}

// Every applied change replaces the replicas, and a new replica reports no usage until the metrics
// pipeline has sampled it, so the HPA briefly cannot read the replicas after each change. That
// passes on its own; only a gap that outlasts this window means scaling has stalled.
export const METRICS_GAP_GRACE_MS = 3 * 60 * 1000;
const METRICS_GAP_REASONS = new Set(['FailedGetResourceMetric', 'FailedComputeMetricsReplicas']);
// The conditions that stop scaling when False. ScalingLimited reads the other way round: False is
// the healthy "within range", and its True "at a bound" is reported by atMaxReplicasMessage.
const BLOCKING_CONDITIONS = new Set(['AbleToScale', 'ScalingActive']);

/**
 * What the HPA reports about not scaling that is worth telling the user, as of `observedAt` (ms):
 * a missing-metrics gap only once it outlasts the restart window, and any other blocked condition
 * in plain words. A gap with no reported start time is shown, since it cannot be told apart from
 * one that persists.
 */
export function blockedAutoscalingMessages(a: Autoscaling, observedAt: number): string[] {
  const messages = new Set<string>();
  for (const c of a.status?.conditions ?? []) {
    if (c.status !== 'False' || !BLOCKING_CONDITIONS.has(c.type)) continue;
    if (!METRICS_GAP_REASONS.has(c.reason)) {
      messages.add(`The autoscaler can't scale right now: ${c.message || c.reason}`);
      continue;
    }
    const since = c.lastTransitionTime ? Date.parse(c.lastTransitionTime) : Number.NaN;
    if (!Number.isNaN(since) && observedAt - since < METRICS_GAP_GRACE_MS) continue;
    const duration = Number.isNaN(since) ? '' : ` for ${Math.floor((observedAt - since) / 60_000)} minutes`;
    messages.add(`The autoscaler hasn't received usage readings from the replicas${duration}, so it isn't scaling. A replica that never becomes ready stops its readings; check the replicas below.`);
  }
  return [...messages];
}

/** Why the autoscaler is held at its maximum, naming each metric over its target and the replicas it needs. */
export function atMaxReplicasMessage(a: Autoscaling): string {
  const cap = a.maxReplicas === undefined ? 'its maximum' : `${a.maxReplicas}`;
  const capped = cappedMetrics(a);
  // Without a reading to name, the HPA's own report that it is capped is all there is to say.
  if (capped.length === 0) return `The autoscaler needs more replicas than the maximum of ${cap}. Raise Max replicas to allow more.`;
  const reasons = capped.map((m) => `${m.name} is at ${m.current}%, above its ${m.target}% target, and needs ${m.wants} replicas`).join('; ');
  return `${reasons}. Max replicas caps it at ${cap}. Raise Max replicas to scale further, or the target if this usage is expected.`;
}

/**
 * Whether the autoscaling setting changes without a write and has to be re-read on a timer. While
 * autoscaling is on, the HPA moves the replica count by itself. A failed render clears only when the
 * platform renders again, which can land after the write that resolves it has been read back, so a
 * reported failure is followed until it clears, whether autoscaling is on or off.
 */
export function pollsAutoscaling(a: Autoscaling | undefined): boolean {
  return !!a && (a.enabled || !!a.syncStatus);
}
