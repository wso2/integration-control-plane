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

import { Box, Button, Chip, Divider, IconButton, Skeleton, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { CalendarClock, Clock, Eye, Settings } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';
import { DeploymentStatus } from '../../../types/deployment';
import type { DeployEnvironmentCardBodyProps } from '../../../types/deploy';
import { formatDistanceToNow } from '../../../utils/time';
import { getDeploymentStatusColor, getDeploymentStatusLabel } from '../../../utils/deploy';
import BuildImageCard from '../../Deploy/BuildImageCard';

const STATUS_BG: Record<string, string> = {
  success: 'rgba(54, 180, 117, 0.1)',
  error: 'rgba(253, 107, 107, 0.1)',
  warning: 'rgba(252, 156, 78, 0.1)',
  info: 'rgba(78, 130, 252, 0.1)',
  default: 'rgba(0, 0, 0, 0.05)',
};

const STATUS_COLOR: Record<string, string> = {
  success: 'success.main',
  error: 'error.main',
  warning: 'warning.main',
  info: 'info.main',
  default: 'text.secondary',
};

export default function DeployEnvironmentCardBody({
  status,
  flags,
  deployment,
  scheduleDescription,
  nextRunLabel,
  releaseId,
  releaseName,
  isLoading,
  isImageLoading = false,
  deployedImage,
  deployedAt,
  envCritical,
  endpointCount,
  configurablesCount,
  scaleToZeroEnabled,
  missingConfigsReason,
  onConfigClick,
  onJobConfigClick,
  onHistoryClick,
  onEndpointsClick,
}: DeployEnvironmentCardBodyProps): JSX.Element {
  if (isLoading) {
    return (
      <Stack gap={1}>
        <Skeleton variant="text" width="60%" />
        <Skeleton variant="rounded" height={40} />
        <Skeleton variant="text" width="40%" />
        <Skeleton variant="rounded" height={120} />
      </Stack>
    );
  }

  if (!deployment || status === DeploymentStatus.NotDeployed || status === undefined) {
    return (
      <Typography variant="body2" color="text.secondary">
        Not deployed yet. Select a commit in the Build panel and click <strong>Build</strong> to deploy to this environment.
      </Typography>
    );
  }

  const colorKey = getDeploymentStatusColor(status);
  const statusBg = STATUS_BG[colorKey] ?? STATUS_BG.default;
  const statusColor = STATUS_COLOR[colorKey] ?? STATUS_COLOR.default;
  const hasBuildInfo = !!releaseId || !!deployment.build?.buildId;
  const isSuspended = status === DeploymentStatus.Suspended;

  // Label matches Devant's EnvBuildDetails: "Image" for BYOI (image-based, no
  // build) and production (critical), "Build" otherwise.
  const buildSectionLabel = flags.isByoi || envCritical ? 'Image' : 'Build';

  return (
    <Stack gap={2}>
      {/* Deployed time — from per-env deployedAt, not image build time. Hidden when suspended (matches Devant).
          An automation has no deployment to date: it runs on its schedule, which the status below reports. */}
      {!flags.isAutomation && !isSuspended && deployedAt && (
        <Stack direction="row" alignItems="center" gap={0.5}>
          <Clock size={14} style={{ opacity: 0.6 }} />
          <Typography variant="body2">Deployed</Typography>
          <Typography variant="body2" fontWeight={600}>
            {formatDistanceToNow(deployedAt)}
          </Typography>
        </Stack>
      )}

      {/* An automation reports its schedule here; every other type reports its workload. */}
      <Stack gap={0.5}>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            p: 1.5,
            borderRadius: 1,
            bgcolor: statusBg,
          }}>
          {flags.isAutomation && isSuspended ? (
            // Nothing to report a status for, so the empty state reads as a sentence.
            <Typography variant="body2" fontWeight={600} sx={{ color: statusColor }}>
              No active schedule
            </Typography>
          ) : (
            <>
              <Typography variant="body2" fontWeight={600}>
                {flags.isAutomation ? 'Schedule status' : 'Deployment status'}
              </Typography>
              <Typography variant="body2" fontWeight={600} sx={{ color: statusColor }}>
                {flags.isAutomation ? 'Active' : getDeploymentStatusLabel(status)}
              </Typography>
            </>
          )}
        </Box>
        {flags.isAutomation && nextRunLabel && (
          <Typography variant="caption" color="text.secondary" sx={{ pl: 1.5 }}>
            {nextRunLabel}
          </Typography>
        )}
        {missingConfigsReason && (
          <Stack alignItems="flex-start" gap={0.75} sx={{ pl: 1.5 }}>
            <Typography variant="caption" color="error.main">
              {missingConfigsReason}
            </Typography>
            <Button size="small" variant="outlined" color="error" startIcon={<Settings size={14} />} onClick={onConfigClick}>
              Configure to Continue
            </Button>
          </Stack>
        )}
      </Stack>

      {/* Build / Image section — label + History button inline, then build card */}
      {hasBuildInfo && (
        <Stack gap={1}>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Stack direction="row" alignItems="center" gap={0.5}>
              <Typography variant="body2" fontWeight={600}>
                {releaseName ? 'Release' : buildSectionLabel}
              </Typography>
              {releaseName && <Chip variant="outlined" size="small" label={releaseName} sx={{ height: 18, fontSize: '0.65rem', borderRadius: 0.75 }} />}
            </Stack>
            <Button variant="text" size="small" startIcon={<Clock size={13} />} sx={{ color: 'text.secondary', fontSize: '0.75rem', p: 0.5 }} onClick={onHistoryClick}>
              History
            </Button>
          </Stack>

          {/* Deployed build image card — skeleton while transitioning to a newly deployed image */}
          {isImageLoading ? (
            <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1.5 }}>
              <Skeleton variant="text" width="40%" sx={{ mb: 0.5 }} />
              <Skeleton variant="text" width="65%" sx={{ mb: 0.5 }} />
              <Skeleton variant="text" width="50%" sx={{ mb: 0.5 }} />
              <Skeleton variant="text" width="55%" />
            </Box>
          ) : flags.isByoi ? (
            // BYOI components are deployed from a container image — show the image
            // reference (there is no source commit / build to display).
            <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1.5 }}>
              <Typography variant="caption" color="text.secondary">
                Container Image
              </Typography>
              <Typography variant="body2" sx={{ fontFamily: 'monospace', mt: 0.25, wordBreak: 'break-all' }}>
                {deployment.imageUrl || '—'}
              </Typography>
            </Box>
          ) : deployedImage ? (
            <BuildImageCard image={deployedImage} isLatest={false} variant="detail" hideEdit />
          ) : deployment.build?.buildId ? (
            <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1.5 }}>
              <Typography variant="caption" color="text.secondary">
                Build ID
              </Typography>
              <Typography variant="body2" sx={{ fontFamily: 'monospace', mt: 0.25 }}>
                {deployment.build.buildId}
              </Typography>
            </Box>
          ) : null}
        </Stack>
      )}

      {/* Endpoints row — service type only */}
      {!flags.isAutomation && onEndpointsClick && (
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Stack direction="row" alignItems="center" gap={0.75}>
            <Typography variant="body2">Endpoints</Typography>
            {endpointCount !== undefined && endpointCount >= 0 && <Chip size="small" label={endpointCount} sx={{ height: 18, fontSize: '0.65rem', borderRadius: 0.75 }} />}
          </Stack>
          <Tooltip title="View endpoints">
            <IconButton size="small" onClick={onEndpointsClick}>
              <Eye size={16} />
            </IconButton>
          </Tooltip>
        </Stack>
      )}

      {/* Configurables row */}
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Stack direction="row" alignItems="center" gap={0.75}>
          <Typography variant="body2">Configurables</Typography>
          {configurablesCount !== undefined && configurablesCount >= 0 && <Chip size="small" label={configurablesCount} sx={{ height: 18, fontSize: '0.65rem', borderRadius: 0.75 }} />}
        </Stack>
        <Tooltip title="Configure environment variables">
          <IconButton size="small" onClick={onConfigClick}>
            <Settings size={16} />
          </IconButton>
        </Tooltip>
      </Stack>

      {/* Job Configs — automation only */}
      {flags.isAutomation && (
        <Stack gap={0.25}>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Typography variant="body2">Job Configs</Typography>
            <Tooltip title="Configure job schedule">
              <IconButton size="small" onClick={onJobConfigClick}>
                <Settings size={16} />
              </IconButton>
            </Tooltip>
          </Stack>
          {scheduleDescription && (
            <Stack direction="row" alignItems="center" gap={0.5} sx={{ pl: 0.25 }}>
              <CalendarClock size={12} style={{ opacity: 0.5, flexShrink: 0 }} />
              <Typography variant="caption" color="text.secondary">
                {scheduleDescription}
              </Typography>
            </Stack>
          )}
        </Stack>
      )}

      {/* Scale to Zero indicator — below Job Configs for automation, below Configurables for services */}
      {scaleToZeroEnabled !== undefined && (
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Typography variant="body2">Scale to Zero</Typography>
          <Chip size="small" label={scaleToZeroEnabled ? 'Enabled' : 'Disabled'} color={scaleToZeroEnabled ? 'success' : 'default'} variant="outlined" sx={{ height: 20, fontSize: '0.7rem' }} />
        </Stack>
      )}

      <Divider sx={{ borderStyle: 'dashed' }} />
    </Stack>
  );
}
