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

import { Box, Button, Chip, Divider, MenuItem, Select, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { GitBranch, HelpCircle, Plus } from '@wso2/oxygen-ui-icons-react';
import type { ReactNode } from 'react';
import { useAppNavigate } from '../hooks/useAppNavigate';
import type { DeploymentTrack } from '../types/component';
import { IS_CLOUD } from '../features';

interface DeploymentTrackBarProps {
  tracks: DeploymentTrack[];
  selectedId: string;
  onChange: (id: string) => void;
  orgHandler: string;
  projectHandler: string;
  componentHandler: string;
  /** When true, renders the selected track as just the API version string (e.g. "v1.0") */
  versionView?: boolean;
  extra?: ReactNode;
}

const TOOLTIP_TEXT = 'Deployment tracks control the release path of your component versions through different environments.';

function normalizeVersion(v: string): string {
  return /^v/i.test(v) ? v : `v${v}`;
}

function TrackLabel({ track, versionView }: { track: DeploymentTrack; versionView?: boolean }) {
  if (versionView) {
    return (
      <Typography variant="body2" sx={{ fontSize: '0.8125rem' }}>
        {track.apiVersion ? normalizeVersion(track.apiVersion) : track.id}
      </Typography>
    );
  }
  return (
    <Stack direction="row" alignItems="center" gap={0.75}>
      {track.branch && <GitBranch size={13} />}
      <Typography variant="body2" sx={{ fontSize: '0.8125rem' }}>
        {track.branch || 'None'}
      </Typography>
      {track.apiVersion && <Chip label={`API ${normalizeVersion(track.apiVersion)}`} size="small" variant="outlined" color="primary" sx={{ height: 20, fontSize: '0.68rem', fontWeight: 500 }} />}
    </Stack>
  );
}

const barSx = {
  display: 'flex',
  alignItems: 'center',
  gap: 2,
  px: 3,
  minHeight: 48,
  borderBottom: '1px solid',
  borderColor: 'divider',
  bgcolor: 'background.acrylic',
  backdropFilter: 'blur(3px)',
} as const;

export default function DeploymentTrackBar({ tracks, selectedId, onChange, orgHandler, projectHandler, componentHandler, versionView, extra }: DeploymentTrackBarProps) {
  const navigate = useAppNavigate();

  // Cloud has one implicit track, so the track picker has nothing to offer — but this bar is
  // where every ComponentScope page puts its environment selector, so keep it for that alone.
  if (IS_CLOUD) return extra ? <Box sx={barSx}>{extra}</Box> : null;

  const basePath = `/organizations/${orgHandler}/projects/${projectHandler}/components/${componentHandler}/settings/deployment-tracks`;

  return (
    <Box sx={barSx}>
      {/* Label + tooltip */}
      <Stack direction="row" alignItems="center" gap={0.5}>
        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500, fontSize: '0.8125rem' }}>
          Deployment Track
        </Typography>
        <Tooltip title={TOOLTIP_TEXT} placement="right">
          <Box role="img" aria-label={TOOLTIP_TEXT} sx={{ display: 'flex', alignItems: 'center', color: 'text.disabled', cursor: 'help' }}>
            <HelpCircle size={13} aria-hidden="true" />
          </Box>
        </Tooltip>
      </Stack>

      {/* Track selector */}
      <Select
        size="small"
        value={selectedId}
        onChange={(e) => onChange(e.target.value as string)}
        renderValue={(value) => {
          const track = tracks.find((t) => t.id === value);
          if (!track) return null;
          return <TrackLabel track={track} versionView={versionView} />;
        }}
        inputProps={{ 'aria-label': 'Deployment Track' }}
        sx={{
          fontSize: '0.8125rem',
          '& .MuiOutlinedInput-notchedOutline': { borderRadius: 5 },
          '& .MuiSelect-select': { py: 0.5, px: 1.5 },
          minWidth: 160,
        }}>
        {/* Create New / View All actions */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 1.5, py: 0.5 }} onKeyDown={(e) => e.stopPropagation()}>
          <Button
            size="small"
            startIcon={<Plus size={13} />}
            onClick={(e) => {
              e.stopPropagation();
              navigate(`${basePath}/new`);
            }}
            sx={{ fontSize: '0.75rem', textTransform: 'none', px: 0.5 }}>
            Create New
          </Button>
          <Button
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              navigate(basePath);
            }}
            sx={{ fontSize: '0.75rem', textTransform: 'none', px: 0.5 }}>
            View All
          </Button>
        </Box>
        <Divider sx={{ my: 0.5 }} />
        {tracks.map((track) => (
          <MenuItem key={track.id} value={track.id}>
            <TrackLabel track={track} versionView={versionView} />
          </MenuItem>
        ))}
      </Select>
      {extra}
    </Box>
  );
}
