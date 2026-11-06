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

import { Box, Button, IconButton, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { RefreshCw, Clock, SlidersHorizontal, Square, RotateCw, FlaskConical, List } from '@wso2/oxygen-ui-icons-react';
import CommitSummary from '../CommitSummary';
import { CARD_HEADER_TITLE_SX } from '../../constants/styles';
import ScheduleButton, { type ScheduleButtonProps } from '../Overview/_shared/ScheduleButton';
import RunButton from '../Overview/automation/RunButton';
import { capitalize } from '../../utils/string';

interface EnvironmentCardHeaderProps {
  envName: string;
  envCritical?: boolean | null;
  /** The commit this environment is running — not the repo's newest. */
  deployedCommit?: { sha: string; message?: string } | null;
  isAutomation: boolean;
  isGenericService?: boolean;
  deploymentStatusV2?: string | null;
  isActionPending?: boolean;
  onStop?: () => void;
  onRedeploy?: () => void;
  hasDeployment?: boolean;
  nextRunLabel: string | null;
  isRefreshing: boolean;
  deployTrackIsPending: boolean;
  scheduleButtonProps?: ScheduleButtonProps;
  onRun?: () => void;
  onRunWithArgs: () => void;
  onRefresh: () => void;
  onConfigure?: () => void;
  onViewLogs?: () => void;
  onTest?: () => void;
  hasMissingConfigs?: boolean;
  isBuildInProgress?: boolean;
}

const STATUS_DOT_MAP: Record<string, { label: string; dotColor: string }> = {
  ACTIVE: { label: 'Active', dotColor: 'success.main' },
  ERROR: { label: 'Error', dotColor: 'error.main' },
  IN_PROGRESS: { label: 'In progress', dotColor: 'warning.main' },
  SUSPENDED: { label: 'Suspended', dotColor: 'text.disabled' },
  NOT_DEPLOYED: { label: 'Not deployed', dotColor: 'text.disabled' },
};

export default function EnvironmentCardHeader({
  envName,
  envCritical,
  deployedCommit,
  isAutomation,
  isGenericService,
  deploymentStatusV2,
  isActionPending,
  onStop,
  onRedeploy,
  hasDeployment,
  nextRunLabel,
  isRefreshing,
  deployTrackIsPending,
  scheduleButtonProps,
  onRun,
  onRunWithArgs,
  onRefresh,
  onConfigure,
  onViewLogs,
  onTest,
  hasMissingConfigs,
  isBuildInProgress,
}: EnvironmentCardHeaderProps) {
  const buildDisabled = isBuildInProgress && (!hasDeployment || isAutomation);
  const statusDot = isGenericService && deploymentStatusV2 ? STATUS_DOT_MAP[deploymentStatusV2] : null;
  const canStop = isGenericService && deploymentStatusV2 === 'ACTIVE';
  const canStart = isGenericService && deploymentStatusV2 === 'SUSPENDED';
  // A failed deployment is already not serving, so stopping it achieves nothing —
  // offer the recovery action instead.
  const hasError = isGenericService && deploymentStatusV2 === 'ERROR';
  const isInProgress = isGenericService && deploymentStatusV2 === 'IN_PROGRESS';

  return (
    <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap">
      {/* Left: env name + status chip + commit info + configure */}
      <Stack direction="row" alignItems="center" gap={1.5} sx={{ minWidth: 0 }}>
        <Typography variant="h5" component="h2" sx={CARD_HEADER_TITLE_SX}>
          {capitalize(envName)}
        </Typography>
        {hasDeployment && deployedCommit?.sha && <CommitSummary sha={deployedCommit.sha} message={deployedCommit.message} />}
        {statusDot && (
          <Stack direction="row" alignItems="center" gap={0.75} sx={{ flexShrink: 0 }}>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: statusDot.dotColor, flexShrink: 0 }} />
            <Typography variant="body2" color="text.secondary">
              {statusDot.label}
            </Typography>
          </Stack>
        )}
        {hasDeployment && onConfigure && (isAutomation || isGenericService) && (
          <Button variant="outlined" size="small" color={hasMissingConfigs ? 'error' : 'primary'} startIcon={<SlidersHorizontal size={14} />} onClick={onConfigure} sx={{ mr: 1 }}>
            {hasMissingConfigs ? 'Configure to continue' : 'Configure'}
          </Button>
        )}
      </Stack>

      {/* Right: service actions OR automation controls */}
      <Stack direction="row" alignItems="center" gap={1} sx={{ flexShrink: 0 }}>
        {isGenericService && (
          <>
            {hasDeployment && onTest && !envCritical && (
              <Button variant="text" size="small" startIcon={<FlaskConical size={14} />} onClick={onTest} disabled={buildDisabled} sx={{ textTransform: 'none' }}>
                Test
              </Button>
            )}
            {hasDeployment && onViewLogs && (
              <Button variant="text" size="small" startIcon={<List size={14} />} onClick={onViewLogs} sx={{ textTransform: 'none' }}>
                View logs
              </Button>
            )}
            {onStop && (canStop || isInProgress) && (
              <Tooltip title="Stop deployment">
                <span>
                  <Button variant="outlined" size="small" color="error" startIcon={<Square size={14} />} onClick={onStop} disabled={isActionPending || isInProgress}>
                    Stop
                  </Button>
                </span>
              </Tooltip>
            )}
            {onRedeploy && canStart && (
              <Tooltip title="Start deployment">
                <span>
                  <Button variant="outlined" size="small" color="success" startIcon={<RotateCw size={14} />} onClick={onRedeploy} disabled={isActionPending}>
                    Start
                  </Button>
                </span>
              </Tooltip>
            )}
            {onRedeploy && hasError && (
              <Tooltip title="Redeploy">
                <span>
                  <Button variant="outlined" size="small" color="error" startIcon={<RotateCw size={14} />} onClick={onRedeploy} disabled={isActionPending}>
                    Redeploy
                  </Button>
                </span>
              </Tooltip>
            )}
          </>
        )}
        {isAutomation && (
          <>
            {nextRunLabel && (
              <Stack direction="row" alignItems="center" gap={0.5} sx={{ mr: 0.5, color: 'success.main' }}>
                <Clock size={14} />
                <Typography variant="body2" color="text.secondary">
                  {nextRunLabel}
                </Typography>
              </Stack>
            )}
            {scheduleButtonProps && <ScheduleButton {...scheduleButtonProps} disabled={hasMissingConfigs || buildDisabled} />}
            {onRun && <RunButton envCritical={envCritical} disabled={hasMissingConfigs || buildDisabled} pending={deployTrackIsPending} onRun={onRun} onRunWithArgs={onRunWithArgs} />}
          </>
        )}
        <Tooltip title="Refresh">
          <IconButton size="small" disabled={isRefreshing} aria-label="Refresh" onClick={onRefresh}>
            <RefreshCw size={16} style={{ animation: isRefreshing ? 'spin 1s linear infinite' : 'none', transformOrigin: 'center' }} />
          </IconButton>
        </Tooltip>
      </Stack>
    </Stack>
  );
}
