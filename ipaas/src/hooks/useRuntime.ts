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
import { fetchComponentPodMetrics, fetchComponentPods, fetchPodEvents, fetchPodLogs, fetchReleaseDetails, redeployRelease } from '#api/runtime';
import { IS_WIP } from '../features';
import { trackEvent } from '../utils/tracking';
import type { PodLogOptions } from '../types/runtime';

const ROOT_KEY = 'runtime';
const POLL_MS = 30_000;
/** Pod logs refresh faster than the pod list — the drawer is a near-live view. */
const LOGS_POLL_MS = 10_000;

/**
 * wip addresses releases by clusterId+namespace (a devops proxy over raw k8s); cloud
 * addresses them by componentName alone. Each backend needs its own identifying params
 * before it's worth firing the query.
 */
function hasReleaseScope(componentName: string, clusterId: string, namespace: string): boolean {
  return IS_WIP ? !!clusterId && !!namespace : !!componentName;
}

export function useReleaseDetails(projectId: string, componentId: string, componentName: string, releaseId: string) {
  return useQuery({
    queryKey: [ROOT_KEY, 'release', projectId, releaseId],
    queryFn: () => fetchReleaseDetails(projectId, componentId, componentName, releaseId),
    enabled: !!projectId && !!releaseId && (IS_WIP ? !!componentId : !!componentName),
    retry: false,
  });
}

export function useComponentPods(projectId: string, componentName: string, clusterId: string, releaseId: string, namespace: string, pollMs: number = POLL_MS) {
  return useQuery({
    queryKey: [ROOT_KEY, 'pods', projectId, componentName, clusterId, releaseId, namespace],
    queryFn: () => fetchComponentPods(projectId, componentName, clusterId, releaseId, namespace),
    enabled: !!projectId && !!releaseId && hasReleaseScope(componentName, clusterId, namespace),
    retry: false,
    staleTime: pollMs,
    refetchInterval: pollMs,
    placeholderData: (prev) => prev,
  });
}

export function useComponentPodMetrics(projectId: string, componentName: string, clusterId: string, releaseId: string, namespace: string) {
  return useQuery({
    queryKey: [ROOT_KEY, 'podMetrics', projectId, componentName, clusterId, releaseId, namespace],
    queryFn: () => fetchComponentPodMetrics(projectId, componentName, clusterId, releaseId, namespace),
    enabled: !!projectId && !!releaseId && hasReleaseScope(componentName, clusterId, namespace),
    retry: false,
    staleTime: POLL_MS,
    refetchInterval: POLL_MS,
    placeholderData: (prev) => prev,
  });
}

export function usePodEvents(projectId: string, componentName: string, releaseId: string, clusterId: string, namespace: string, podName: string, enabled: boolean) {
  return useQuery({
    queryKey: [ROOT_KEY, 'podEvents', projectId, componentName, releaseId, clusterId, namespace, podName],
    queryFn: () => fetchPodEvents(projectId, componentName, releaseId, clusterId, namespace, podName),
    enabled: enabled && !!projectId && !!podName && (IS_WIP ? !!clusterId && !!namespace : !!componentName && !!releaseId),
    retry: false,
    // The backend returns events in no particular order.
    select: (events) => [...events].sort((a, b) => new Date(b.timestamp ?? 0).getTime() - new Date(a.timestamp ?? 0).getTime()),
  });
}

export function usePodLogs(projectId: string, componentName: string, releaseId: string, clusterId: string, namespace: string, podName: string, options: PodLogOptions, enabled: boolean) {
  return useQuery({
    // `previous` and `sinceSeconds` change what the server returns, so they belong in the key.
    queryKey: [ROOT_KEY, 'podLogs', projectId, componentName, releaseId, clusterId, namespace, podName, options.containerName, options.previous, options.sinceSeconds],
    queryFn: () => fetchPodLogs(projectId, componentName, releaseId, clusterId, namespace, podName, options),
    enabled: enabled && !!projectId && !!podName && (IS_WIP ? !!clusterId && !!namespace : !!componentName && !!releaseId),
    retry: false,
    refetchInterval: LOGS_POLL_MS,
    staleTime: LOGS_POLL_MS,
  });
}

export function useRedeployRelease() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { projectId: string; componentId: string; componentName: string; releaseId: string }) => redeployRelease(input.projectId, input.componentId, input.componentName, input.releaseId),
    onSuccess: () => {
      trackEvent('component-deploy');
      qc.invalidateQueries({ queryKey: [ROOT_KEY] });
      qc.invalidateQueries({ queryKey: ['componentDeployment'] });
    },
  });
}
