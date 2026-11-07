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

// Component runtime (release detail, pods, metrics, redeploy) backed by the ipaas-service
// runtime endpoints. Releases are addressed by componentName (handler) + releaseId; there is
// no cluster/namespace concept in this API.
import { BffError, bff, q, seg } from './_client';
import type { ClusterPod, PodEvent, PodLogOptions, RuntimeMetrics, RuntimeReleaseDetails } from '../types/runtime';

// A failed log read answers `{ error, message }` with the real, user-facing reason (e.g.
// "previous container logs are not supported") — unwrap it so callers see that, not the raw
// `HTTP 400: {"error":...}` envelope text.
function podLogsError(error: unknown): Error {
  if (error instanceof BffError) {
    try {
      const body = JSON.parse(error.body) as { message?: string };
      if (body.message) return new Error(body.message);
    } catch {
      // Not JSON — fall through to the raw error below.
    }
  }
  return error instanceof Error ? error : new Error('Failed to fetch container logs');
}

const releasePath = (componentName: string, environmentId: string, releaseId: string): string => `/components/${seg(componentName)}/environments/${seg(environmentId)}/releases/${seg(releaseId)}`;

/** Only replicas/undeployed are guaranteed by the backend — every other key may be omitted. */
interface CloudReleaseRuntime {
  componentId?: string;
  releaseId?: string;
  namespace?: string;
  replicas: number;
  undeployed: boolean;
  image?: string;
  lastDeployedMessage?: string;
}

// Prefer the response's own componentId/releaseId over the request params — they're the
// OpenChoreo-side identifiers, which is what the Runtime page displays for cloud.
function toReleaseDetails(raw: CloudReleaseRuntime, releaseId: string): RuntimeReleaseDetails {
  return {
    ID: raw.releaseId ?? releaseId,
    componentId: raw.componentId,
    namespace: raw.namespace ?? '',
    replicas: raw.replicas,
    undeployed: raw.undeployed,
    image: raw.image,
    latest_deployment: raw.lastDeployedMessage ? { deployment_history: { change_message: raw.lastDeployedMessage } } : undefined,
    environment: { environment_clusters: [], namespace: raw.namespace },
  };
}

/** Full runtime detail for a deployed release (replicas, namespace, last-deployed message). */
export const fetchReleaseDetails = (_projectId: string, componentName: string, environmentId: string, releaseId: string): Promise<RuntimeReleaseDetails> =>
  bff.get<CloudReleaseRuntime>(`${releasePath(componentName, environmentId, releaseId)}/runtime`).then((raw) => toReleaseDetails(raw, releaseId));

/** Pods for a release. An empty array is normal (scaled to zero, or no current binding). */
export const fetchComponentPods = (_projectId: string, componentName: string, environmentId: string, releaseId: string): Promise<ClusterPod[]> => bff.get<ClusterPod[]>(`${releasePath(componentName, environmentId, releaseId)}/pods`);

/**
 * OpenChoreo has no pod-level metrics source — `podLevelMetrics` is always `[]`.
 * `componentLevelMetrics` is the real aggregate and is absent (not zeroed) whenever it
 * can't be resolved (no binding, Observer unreachable). Passed straight through.
 */
export const fetchComponentPodMetrics = (_projectId: string, componentName: string, environmentId: string, releaseId: string): Promise<RuntimeMetrics> => bff.get<RuntimeMetrics>(`${releasePath(componentName, environmentId, releaseId)}/metrics`);

/** Redeploy the currently deployed release ("Redeploy Release" button). No request body. */
export const redeployRelease = (_projectId: string, componentName: string, environmentId: string, releaseId: string): Promise<void> => bff.post<{ message: string }>(`${releasePath(componentName, environmentId, releaseId)}/redeploy`).then(() => undefined);

/** Recent lifecycle events for one pod (~1hr retention) — an empty array is normal. */
export const fetchPodEvents = (_projectId: string, componentName: string, environmentId: string, releaseId: string, podName: string): Promise<PodEvent[]> =>
  bff.get<PodEvent[]>(`${releasePath(componentName, environmentId, releaseId)}/pods/${seg(podName)}/events`);

/**
 * Container logs for one pod. `previous` isn't supported by OpenChoreo's log API — a request
 * for it fails with a 400 (the real reason lands in the thrown error's message) rather than
 * silently returning current logs, which would misreport which instance the logs are from.
 */
export const fetchPodLogs = async (_projectId: string, componentName: string, environmentId: string, releaseId: string, podName: string, options: PodLogOptions): Promise<string> => {
  try {
    const res = await bff.get<{ logs: string }>(
      `${releasePath(componentName, environmentId, releaseId)}/pods/${seg(podName)}/logs${q({ containerName: options.containerName, sinceSeconds: options.sinceSeconds, maxTailLines: options.maxTailLines, previous: options.previous })}`,
    );
    return res.logs ?? '';
  } catch (e) {
    throw podLogsError(e);
  }
};
