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

import { useEffect, useMemo, useState } from 'react';
import type { DeploymentTrack } from '../../types/component';
import { useComponentEndpoints } from '../../hooks/useComponents';

/**
 * Deployment-track + APIM-endpoint selection for integration-level pages that
 * operate on one published API version (Lifecycle, Compliance). Defaults to the
 * latest track and the first endpoint with an apimId; selections survive
 * refetches while they remain valid.
 */
export function useEndpointSelection(component: { id: string; deploymentTracks?: DeploymentTrack[] } | undefined) {
  const tracks = useMemo(() => component?.deploymentTracks ?? [], [component?.deploymentTracks]);
  const [selectedTrackId, setSelectedTrackId] = useState('');
  useEffect(() => {
    if (!tracks.length) return;
    setSelectedTrackId((prev) => {
      if (prev && tracks.some((t) => t.id === prev)) return prev;
      return tracks.find((t) => t.latest)?.id ?? tracks[0].id;
    });
  }, [component?.id, tracks]);

  const { data: endpoints = [], isLoading: loadingEndpoints } = useComponentEndpoints(component?.id ?? '', selectedTrackId);

  const [selectedApimId, setSelectedApimId] = useState<string | null>(null);
  useEffect(() => {
    setSelectedApimId((prev) => {
      if (prev && endpoints.some((e) => e.apimId === prev)) return prev;
      return endpoints.find((e) => e.apimId)?.apimId ?? null;
    });
  }, [endpoints]);

  const endpointsWithApim = useMemo(() => {
    const seen = new Set<string>();
    return endpoints.filter((e) => {
      if (!e.apimId || seen.has(e.apimId)) return false;
      seen.add(e.apimId);
      return true;
    });
  }, [endpoints]);

  return { tracks, selectedTrackId, setSelectedTrackId, loadingEndpoints, selectedApimId, setSelectedApimId, endpointsWithApim };
}
