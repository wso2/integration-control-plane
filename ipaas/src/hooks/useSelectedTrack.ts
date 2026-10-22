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

import { useCallback, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import type { Component, DeploymentTrack } from '../types/component';

/** The URL search param naming the deployment track an integration's pages show. */
export const TRACK_PARAM = 'track';

/**
 * The track a list resolves to: the requested one, else the default, else the
 * first. A track's `latest` flag marks the default: the one building the
 * integration's own branch, not the one deployed most recently.
 */
export function resolveTrack(tracks: DeploymentTrack[], requested: string | null): DeploymentTrack | undefined {
  return tracks.find((t) => t.id === requested) ?? tracks.find((t) => t.latest) ?? tracks[0];
}

/**
 * How `?track=` should change so it names the track shown: `undefined` when it
 * already does (or the tracks haven't loaded), `null` to drop it because the
 * shown track is the default, which a missing param already means, or the shown
 * track's id.
 */
export function staleTrackParam(tracks: DeploymentTrack[], requested: string | null, shown: DeploymentTrack | undefined): string | null | undefined {
  if (!requested || !shown || tracks.some((t) => t.id === requested)) return undefined;
  return shown.latest ? null : shown.id;
}

/**
 * `url` carrying the track `search` names. Every integration page reads the
 * track from the URL, so navigating between them must keep it.
 */
export function withTrackParam(url: string, search: string): string {
  const track = new URLSearchParams(search).get(TRACK_PARAM);
  if (!track) return url;
  const [path, query = ''] = url.split('?');
  const params = new URLSearchParams(query);
  params.set(TRACK_PARAM, track);
  return `${path}?${params}`;
}

export interface SelectedTrack {
  tracks: DeploymentTrack[];
  track: DeploymentTrack | undefined;
  /** The selected track's id; '' until the component loads. */
  trackId: string;
  selectTrack: (id: string) => void;
}

/**
 * The deployment track an integration page shows, held in `?track=` so a link
 * or a reload lands on the same track. A missing or stale param is the default
 * track, which is also what a component without tracks resolves to.
 */
export function useSelectedTrack(component: Component | undefined): SelectedTrack {
  const [params, setParams] = useSearchParams();
  const tracks = useMemo(() => component?.deploymentTracks ?? [], [component?.deploymentTracks]);
  const requested = params.get(TRACK_PARAM);
  const track = useMemo(() => resolveTrack(tracks, requested), [tracks, requested]);

  // A link to a track that no longer exists shows the default track; the URL is
  // rewritten to match, so it never names one track while the page shows another.
  const correction = staleTrackParam(tracks, requested, track);
  useEffect(() => {
    if (correction === undefined) return;
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (correction === null) next.delete(TRACK_PARAM);
        else next.set(TRACK_PARAM, correction);
        return next;
      },
      { replace: true },
    );
  }, [correction, setParams]);

  const selectTrack = useCallback(
    (id: string) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          // A missing param already means the default track, so it keeps the URL clean.
          if (tracks.find((t) => t.id === id)?.latest) next.delete(TRACK_PARAM);
          else next.set(TRACK_PARAM, id);
          return next;
        },
        { replace: true },
      ),
    [setParams, tracks],
  );

  return { tracks, track, trackId: track?.id ?? '', selectTrack };
}
