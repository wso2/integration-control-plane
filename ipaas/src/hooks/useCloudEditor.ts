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

import { useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { callCreateCodeServer, getCodeServer, getOrCreateSampleRegistry } from '../api/cloudEditor';
import { CLOUD_EDITOR_POLL_MS } from '../constants/cloudEditor';

export function useGetOrCreateSampleRegistry() {
  return useMutation({
    mutationFn: (orgUuid: string) => getOrCreateSampleRegistry(orgUuid),
  });
}

export function useCreateCodeServer() {
  return useMutation({
    mutationFn: (params: { userId: string; organizationId: string; projectId: string; componentId: string; orgHandle: string; imageUrl: string; registryId: string; sourceCommitHash?: string }) => callCreateCodeServer(params),
  });
}

/**
 * Polls the BFF until the editor at a known address is serving. Readiness comes
 * from the BFF, not the editor origin: a `mode: 'no-cors'` probe resolves opaque
 * whether the origin answered 200 or the gateway answered 503.
 */
export function useEditorReady(params: { userId: string; projectId: string; componentId: string }, enabled: boolean) {
  return useQuery({
    queryKey: ['cloud-editor-ready', params.userId, params.projectId, params.componentId],
    queryFn: () => getCodeServer(params),
    enabled,
    refetchInterval: CLOUD_EDITOR_POLL_MS,
    // Finite: refetchInterval already re-fires after a blip, and retrying forever
    // would keep a real failure (an expired token, a 500) out of `error`.
    retry: 2,
    gcTime: 0,
  });
}

/** Pings the editor URL on an interval while enabled, so the scale-to-zero timer doesn't evict the pod before redirect. */
export function useEditorKeepAlive(url: string | undefined, enabled: boolean) {
  useEffect(() => {
    if (!enabled || !url) return undefined;
    let pingUrl = url;
    try {
      const u = new URL(url);
      u.searchParams.delete('tkn');
      pingUrl = u.toString();
    } catch {
      // fall back to the raw URL
    }
    const ping = () => void fetch(pingUrl, { method: 'GET', mode: 'no-cors', credentials: 'omit', cache: 'no-store' }).catch(() => {});
    ping();
    const id = window.setInterval(ping, CLOUD_EDITOR_POLL_MS);
    return () => clearInterval(id);
  }, [url, enabled]);
}
