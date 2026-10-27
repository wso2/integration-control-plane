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

import { Box, Chip, Divider, MenuItem, Select, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { GitBranch, HelpCircle } from '@wso2/oxygen-ui-icons-react';
import type { ReactNode } from 'react';
import { useAppNavigate } from '../hooks/useAppNavigate';
import { useSelectedTrack } from '../hooks/useSelectedTrack';
import { PILL_SELECT_SX } from '../constants/styles';
import { componentSettingsSectionUrl, hasComponent, useScope } from '../nav';
import type { Component, DeploymentTrack } from '../types/component';
import { bandSx, barCaptionSx, barSx, defaultChipSx, manageTracksItemSx, tooltipAnchorSx, trackLabelSx } from './DeploymentTrackBar.styles';

interface DeploymentTrackBarProps {
  /** The integration whose tracks are picked from; the selection lives in the URL. */
  component?: Component;
  /** The page's environment selector. */
  extra?: ReactNode;
}

// The picker's "Manage Tracks" entry. A real option, so keyboard navigation and
// type-ahead treat it like the others; no track id can take this value.
const MANAGE_TRACKS = '__manage-tracks__';

const TOOLTIP_TEXT = 'Each deployment track builds one branch and deploys it to its own environments, alongside the others.';

function TrackLabel({ track }: { track: DeploymentTrack }) {
  return (
    <Stack direction="row" alignItems="center" gap={0.75}>
      <GitBranch size={13} />
      <Typography variant="body2" sx={trackLabelSx}>
        {track.branch || track.id}
        {track.apiVersion && (
          <Typography component="span" variant="body2" color="text.secondary" sx={trackLabelSx}>
            {` · ${track.apiVersion}`}
          </Typography>
        )}
      </Typography>
      {track.latest && <Chip label="Default" size="small" variant="outlined" color="primary" sx={defaultChipSx} />}
    </Stack>
  );
}

/**
 * The band at the top of integration-level pages: the deployment track picker,
 * for an integration with more than one track, and the page's environment
 * selector. A page with neither has no band.
 */
export default function DeploymentTrackBar({ component, extra }: DeploymentTrackBarProps) {
  const navigate = useAppNavigate();
  const scope = useScope();
  const { tracks, trackId, selectTrack } = useSelectedTrack(component);
  // A single track leaves nothing to pick, whether it is an integration's only
  // track or the implicit one of an integration created before tracks. More
  // tracks are created from Settings, and the picker shows once there are two.
  const picker = !!component?.deploymentTracksEnabled && tracks.length > 1;
  if (!picker && !extra) return null;

  const tracksUrl = hasComponent(scope) ? componentSettingsSectionUrl(scope, 'deployment-tracks') : '';

  return (
    <Box sx={bandSx}>
      <Box sx={barSx}>
        {picker && (
          <>
            <Stack direction="row" alignItems="center" gap={0.5}>
              <Typography variant="body2" color="text.secondary" sx={barCaptionSx}>
                Deployment Track
              </Typography>
              <Tooltip title={TOOLTIP_TEXT} placement="right">
                <Box role="img" aria-label={TOOLTIP_TEXT} sx={tooltipAnchorSx}>
                  <HelpCircle size={13} aria-hidden="true" />
                </Box>
              </Tooltip>
            </Stack>
            <Select
              size="small"
              value={trackId}
              onChange={(e) => {
                const value = e.target.value as string;
                if (value === MANAGE_TRACKS) navigate(tracksUrl);
                else selectTrack(value);
              }}
              renderValue={(value) => {
                const track = tracks.find((t) => t.id === value);
                return track ? <TrackLabel track={track} /> : null;
              }}
              inputProps={{ 'aria-label': 'Deployment Track' }}
              sx={{ ...PILL_SELECT_SX, minWidth: 160 }}>
              {tracksUrl && (
                <MenuItem value={MANAGE_TRACKS} sx={manageTracksItemSx}>
                  Manage Tracks
                </MenuItem>
              )}
              {tracksUrl && <Divider sx={{ my: 0.5 }} />}
              {tracks.map((track) => (
                <MenuItem key={track.id} value={track.id}>
                  <TrackLabel track={track} />
                </MenuItem>
              ))}
            </Select>
          </>
        )}
        {extra}
      </Box>
    </Box>
  );
}
