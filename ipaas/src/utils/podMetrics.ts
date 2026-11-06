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

import type { CalculatedUsage, ClusterPod, ComponentLevelMetrics, PodMetrics } from '../types/runtime';

/**
 * Parse a Kubernetes CPU quantity into millicores.
 * Accepts cores ("1", "0.5"), millicores ("250m"), micro ("500u") and nano ("123456789n").
 */
export function parseCpuToMillicores(value: string | undefined | null): number {
  if (!value) return 0;
  const v = value.trim();
  if (v.endsWith('n')) return Number(v.slice(0, -1)) / 1_000_000; // nanocores → millicores
  if (v.endsWith('u')) return Number(v.slice(0, -1)) / 1_000; // microcores → millicores
  if (v.endsWith('m')) return Number(v.slice(0, -1)); // already millicores
  return Number(v) * 1000; // cores → millicores
}

const MEMORY_SUFFIXES: Record<string, number> = {
  Ki: 1024,
  Mi: 1024 ** 2,
  Gi: 1024 ** 3,
  Ti: 1024 ** 4,
  Pi: 1024 ** 5,
  K: 1000,
  M: 1000 ** 2,
  G: 1000 ** 3,
  T: 1000 ** 4,
  P: 1000 ** 5,
};

/** Parse a Kubernetes memory quantity ("128Mi", "1Gi", "512000") into bytes. */
export function parseMemoryToBytes(value: string | undefined | null): number {
  if (!value) return 0;
  const v = value.trim();
  const match = v.match(/^([0-9.]+)([A-Za-z]*)$/);
  if (!match) return 0;
  const amount = Number(match[1]);
  const suffix = match[2];
  if (!suffix) return amount;
  return amount * (MEMORY_SUFFIXES[suffix] ?? 1);
}

/** Millicores → a short "0.25 vCPU" string. */
export function formatMillicores(millicores: number): string {
  return `${(millicores / 1000).toFixed(2)} vCPU`;
}

/** Bytes → a short binary-unit string ("128 MiB"). */
export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 Bytes';
  const units = ['Bytes', 'KiB', 'MiB', 'GiB', 'TiB'];
  const exponent = Math.min(Math.floor(Math.log2(bytes) / 10), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value.toFixed(exponent === 0 ? 0 : 2)} ${units[exponent]}`;
}

function sumPodLimits(pods: ClusterPod[]): { cpu: number; memory: number } {
  let cpu = 0;
  let memory = 0;
  for (const pod of pods) {
    for (const c of pod.spec.containers ?? []) {
      const lim = c.resources?.limits ?? c.resources?.requests;
      cpu += parseCpuToMillicores(lim?.cpu);
      memory += parseMemoryToBytes(lim?.memory);
    }
  }
  return { cpu, memory };
}

function sumMetricsUsage(metrics: PodMetrics[]): { cpu: number; memory: number } {
  let cpu = 0;
  let memory = 0;
  for (const m of metrics) {
    for (const c of m.containers ?? []) {
      cpu += parseCpuToMillicores(c.usage?.cpu);
      memory += parseMemoryToBytes(c.usage?.memory);
    }
  }
  return { cpu, memory };
}

function percent(used: number, limits: number): number {
  if (limits <= 0) return 0;
  return Math.min(100, Math.round((used / limits) * 100));
}

/** Cloud's server-computed aggregate (whole cores/bytes) in the same shape as calculateAggregateUsage. */
export function usageFromComponentLevelMetrics(agg: ComponentLevelMetrics): CalculatedUsage {
  const cpuUsed = agg.cpu.usedCores * 1000;
  const cpuLimits = agg.cpu.limitCores * 1000;
  return {
    cpu: { limits: cpuLimits, used: cpuUsed, usagePercent: percent(cpuUsed, cpuLimits) },
    memory: { limits: agg.memory.limitBytes, used: agg.memory.usedBytes, usagePercent: percent(agg.memory.usedBytes, agg.memory.limitBytes) },
  };
}

/** Aggregate CPU/memory used vs. allocated across all pods of a release. */
export function calculateAggregateUsage(pods: ClusterPod[], metrics: PodMetrics[]): CalculatedUsage {
  const limits = sumPodLimits(pods);
  const used = sumMetricsUsage(metrics);
  return {
    cpu: { limits: limits.cpu, used: used.cpu, usagePercent: percent(used.cpu, limits.cpu) },
    memory: { limits: limits.memory, used: used.memory, usagePercent: percent(used.memory, limits.memory) },
  };
}

/** Millicores → bare vCPU string ("0.25"), without a unit suffix. */
export function formatVcpu(millicores: number): string {
  return (millicores / 1000).toFixed(2);
}

/** Total restarts across a pod's containers. */
export function podRestartCount(pod: ClusterPod): number {
  return (pod.status.containerStatuses ?? []).reduce((total, s) => total + (s.restartCount ?? 0), 0);
}

/**
 * Last activity for the pod table: the most recent container start, since a restart is
 * newer than the pod's own start time. Falls back to when the pod started.
 */
export function podLastActivity(pod: ClusterPod): string | undefined {
  const started = (pod.status.containerStatuses ?? []).map((s) => s.state?.running?.startedAt).filter((t): t is string => !!t);
  const latest = started.length ? started.reduce((a, b) => (new Date(b) > new Date(a) ? b : a)) : undefined;
  return latest ?? pod.status.startTime;
}
