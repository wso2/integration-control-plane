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
import { fetchComponentPodMetrics, fetchComponentPods, fetchPodEvents, fetchPodLogs, fetchReleaseDetails, redeployRelease } from '../api/runtime';
import { trackEvent } from '../services/tracking/tracking';
import type { PodLogOptions } from '../types/runtime';

const ROOT_KEY = 'runtime';
const POLL_MS = 30_000;
/** Pod logs refresh faster than the pod list — the drawer is a near-live view. */
const LOGS_POLL_MS = 10_000;

export function useReleaseDetails(projectId: string, componentName: string, releaseId: string) {
  return useQuery({
    queryKey: [ROOT_KEY, 'release', projectId, componentName, releaseId],
    queryFn: () => fetchReleaseDetails(projectId, componentName, releaseId),
    enabled: !!projectId && !!releaseId && !!componentName,
    retry: false,
  });
}

export function useComponentPods(projectId: string, componentName: string, releaseId: string, pollMs: number = POLL_MS) {
  return useQuery({
    queryKey: [ROOT_KEY, 'pods', projectId, componentName, releaseId],
    queryFn: () => fetchComponentPods(projectId, componentName, releaseId),
    enabled: !!projectId && !!releaseId && !!componentName,
    retry: false,
    staleTime: pollMs,
    refetchInterval: pollMs,
    placeholderData: (prev) => prev,
  });
}

export function useComponentPodMetrics(projectId: string, componentName: string, releaseId: string) {
  return useQuery({
    queryKey: [ROOT_KEY, 'podMetrics', projectId, componentName, releaseId],
    queryFn: () => fetchComponentPodMetrics(projectId, componentName, releaseId),
    enabled: !!projectId && !!releaseId && !!componentName,
    retry: false,
    staleTime: POLL_MS,
    refetchInterval: POLL_MS,
    placeholderData: (prev) => prev,
  });
}

export function usePodEvents(projectId: string, componentName: string, releaseId: string, podName: string, enabled: boolean) {
  return useQuery({
    queryKey: [ROOT_KEY, 'podEvents', projectId, componentName, releaseId, podName],
    queryFn: () => fetchPodEvents(projectId, componentName, releaseId, podName),
    enabled: enabled && !!projectId && !!podName && !!componentName && !!releaseId,
    retry: false,
    // The backend returns events in no particular order.
    select: (events) => [...events].sort((a, b) => new Date(b.timestamp ?? 0).getTime() - new Date(a.timestamp ?? 0).getTime()),
  });
}

export function usePodLogs(projectId: string, componentName: string, releaseId: string, podName: string, options: PodLogOptions, enabled: boolean) {
  return useQuery({
    // `previous` and `sinceSeconds` change what the server returns, so they belong in the key.
    queryKey: [ROOT_KEY, 'podLogs', projectId, componentName, releaseId, podName, options.containerName, options.previous, options.sinceSeconds],
    queryFn: () => fetchPodLogs(projectId, componentName, releaseId, podName, options),
    enabled: enabled && !!projectId && !!podName && !!componentName && !!releaseId,
    retry: false,
    refetchInterval: LOGS_POLL_MS,
    staleTime: LOGS_POLL_MS,
  });
}

export function useRedeployRelease() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { projectId: string; componentName: string; releaseId: string }) => redeployRelease(input.projectId, input.componentName, input.releaseId),
    onSuccess: () => {
      trackEvent('component-deploy');
      qc.invalidateQueries({ queryKey: [ROOT_KEY] });
      qc.invalidateQueries({ queryKey: ['componentDeployment'] });
    },
  });
}
