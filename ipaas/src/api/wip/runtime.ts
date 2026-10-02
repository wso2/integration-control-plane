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

import { getOrgUuidFromToken } from '#auth';
import { choreoClient, withScopeRetry } from './httpClients';
import type { ClusterPod, PodEvent, PodLogOptions, PodMetrics, RuntimeMetrics, RuntimeReleaseDetails } from '../../types/runtime';

// Component runtime data lives on the choreo gateway devops service; REST calls
// carry organization_id + project_id query params (org UUID comes from the token).
const BASE = '/devops/1.0.0/api/v1';

function commonParams(projectId: string): URLSearchParams {
  return new URLSearchParams({ organization_id: getOrgUuidFromToken() ?? '', project_id: projectId });
}

/** Full runtime detail for a deployed release (replicas, namespace, cluster, last-deployed). */
export function fetchReleaseDetails(projectId: string, componentId: string, _componentName: string, releaseId: string): Promise<RuntimeReleaseDetails> {
  return withScopeRetry(async () => {
    const res = await choreoClient.get<{ data: RuntimeReleaseDetails }>(`${BASE}/components/${encodeURIComponent(componentId)}/release/${encodeURIComponent(releaseId)}?${commonParams(projectId).toString()}`);
    return res.data;
  });
}

// Generic data-plane resource query proxy. The backend expects the apiVersion
// segment URL-encoded; PodMetrics passes an already-encoded value so it lands
// double-encoded on the wire, matching the devops proxy contract.
async function queryDpResources<T>(projectId: string, clusterId: string, apiVersion: string, kind: string, q: { namespace?: string; labelSelector?: string; fieldSelector?: string }): Promise<T[]> {
  const search = commonParams(projectId);
  if (q.namespace) search.set('namespace', q.namespace);
  if (q.labelSelector) search.set('labelSelector', q.labelSelector);
  if (q.fieldSelector) search.set('fieldSelector', q.fieldSelector);
  const res = await choreoClient.get<{ payload: T[] }>(`${BASE}/clusters/${encodeURIComponent(clusterId)}/query/${encodeURIComponent(apiVersion)}/${encodeURIComponent(kind)}?${search.toString()}`);
  return res.payload ?? [];
}

/** Pods for a release (labelSelector release_id=…). */
export function fetchComponentPods(projectId: string, _componentName: string, clusterId: string, releaseId: string, namespace: string): Promise<ClusterPod[]> {
  return withScopeRetry(() => queryDpResources<ClusterPod>(projectId, clusterId, 'v1', 'Pod', { namespace, labelSelector: `release_id=${releaseId}` }));
}

/** Live cpu/memory metrics for a release's pods. There's no component-level aggregate on this backend — the caller computes it from pods + podLevelMetrics. */
export function fetchComponentPodMetrics(projectId: string, _componentName: string, clusterId: string, releaseId: string, namespace: string): Promise<RuntimeMetrics> {
  return withScopeRetry(async () => ({
    podLevelMetrics: await queryDpResources<PodMetrics>(projectId, clusterId, encodeURIComponent('metrics.k8s.io/v1beta1'), 'PodMetrics', { namespace, labelSelector: `release_id=${releaseId}` }),
  }));
}

interface RawPodEvent {
  metadata: { uid: string; creationTimestamp?: string; managedFields?: { time?: string }[] };
  involvedObject?: { kind?: string };
  reason?: string;
  message?: string;
  count?: number;
  firstTimestamp?: string | null;
  lastTimestamp?: string | null;
  eventTime?: string | null;
}

// Which timestamp a cluster fills in varies by event source, so they are tried in
// order of precision and the first present one wins.
function toPodEvent(raw: RawPodEvent): PodEvent {
  return {
    id: raw.metadata.uid,
    kind: raw.involvedObject?.kind,
    reason: raw.reason ?? '',
    message: raw.message ?? '',
    count: raw.count,
    timestamp: raw.lastTimestamp ?? raw.firstTimestamp ?? raw.eventTime ?? raw.metadata.managedFields?.[0]?.time ?? raw.metadata.creationTimestamp ?? undefined,
  };
}

/** Events the cluster published about one pod. */
export async function fetchPodEvents(projectId: string, _componentName: string, _releaseId: string, clusterId: string, namespace: string, podName: string): Promise<PodEvent[]> {
  const raw = await withScopeRetry(() => queryDpResources<RawPodEvent>(projectId, clusterId, 'v1', 'Event', { namespace, fieldSelector: `involvedObject.name=${podName}` }));
  return raw.map(toPodEvent);
}

/**
 * A failed log read answers `{ payload: { error } }` with the real reason — most often
 * that the container has not started yet — wrapped by the HTTP client into an
 * `HTTP 400: <body>` message. Unwrap it so callers get the reason, not the envelope.
 */
function podLogsError(error: unknown): Error {
  const message = error instanceof Error ? error.message : '';
  const start = message.indexOf('{');
  if (start < 0) return error instanceof Error ? error : new Error('Failed to fetch container logs');
  try {
    const body = JSON.parse(message.slice(start)) as { payload?: { error?: string }; error?: string };
    const detail = body.payload?.error ?? body.error;
    return detail ? new Error(detail) : (error as Error);
  } catch {
    return error as Error;
  }
}

/**
 * Container logs for one pod. The devops proxy answers with the whole log as a single
 * string; `stream: false` keeps it a plain request rather than a live tail.
 */
export function fetchPodLogs(projectId: string, _componentName: string, _releaseId: string, clusterId: string, namespace: string, podName: string, options: PodLogOptions): Promise<string> {
  const body = { stream: false, namespace, podName, containerName: options.containerName, previous: options.previous, sinceSeconds: options.sinceSeconds, maxTailLines: options.maxTailLines };
  return withScopeRetry(async () => {
    try {
      const res = await choreoClient.post<{ payload: string }>(`${BASE}/clusters/${encodeURIComponent(clusterId)}/pod/logs?${commonParams(projectId).toString()}`, body);
      return res.payload ?? '';
    } catch (e) {
      throw podLogsError(e);
    }
  });
}

/** Redeploy the currently deployed release ("Redeploy Release" button). */
export function redeployRelease(projectId: string, componentId: string, _componentName: string, releaseId: string, message = 'Manually redeployed'): Promise<void> {
  return withScopeRetry(() => choreoClient.post<void>(`${BASE}/components/${encodeURIComponent(componentId)}/release/${encodeURIComponent(releaseId)}/deploy-deployment?${commonParams(projectId).toString()}`, { message }));
}
