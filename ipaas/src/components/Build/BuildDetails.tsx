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

import { Alert, Box, Button, Chip, CircularProgress, IconButton, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { Check, Copy, List } from '@wso2/oxygen-ui-icons-react';
import { useState } from 'react';
import { useBuildLogs } from '../../hooks/useBuilds';
import type { BuildRun } from '../../types/deployment';
import { BUILD_STAGES } from '../../constants/build';
import { buildLogText, formatBuildDate, getStepStatus, isBuildLive } from '../../utils/build';
import BuildAccordionStepper from './BuildAccordionStepper';
import BuildLogViewer from '../BuildLogViewer';

const splitSx = { flex: 1, minHeight: 0 } as const;
const detailsColumnSx = { width: 448, flexShrink: 0, overflowY: 'auto', p: 2 } as const;
const logsColumnSx = { flex: 1, minWidth: 0, minHeight: 0, p: 2, pl: 0, display: 'flex', flexDirection: 'column' } as const;
const logsToggleRowSx = { mt: 2 } as const;

interface BuildDetailsProps {
  componentId: string;
  versionId: string;
  build: BuildRun;
  logsOpen: boolean;
  onLogsOpenChange: (open: boolean) => void;
}

export default function BuildDetails({ componentId, versionId, build, logsOpen, onLogsOpenChange }: BuildDetailsProps) {
  const [buildIdCopied, setBuildIdCopied] = useState(false);
  const workflowName = build.buildRef ?? String(build.id);
  const isInProgress = build.status === 'in_progress';
  const { data: logs = null, isLoading: logsLoading } = useBuildLogs(componentId, versionId, workflowName, true, { status: build.status, conclusion: build.conclusion });
  const hasBuildLog = !!buildLogText(logs);
  const live = isBuildLive(build.status);

  // Copy the full identifier; the displayed `#id` is only its numeric suffix.
  const handleCopyBuildId = () => {
    void navigator.clipboard.writeText(workflowName);
    setBuildIdCopied(true);
    setTimeout(() => setBuildIdCopied(false), 1500);
  };

  const details = (
    <Stack gap={2}>
      {/* Build metadata */}
      <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 2 }}>
        <Stack gap={1}>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Typography variant="body2" color="text.secondary">
              Build ID
            </Typography>
            <Stack direction="row" alignItems="center" gap={0.75}>
              {build.isTriggeredAtCreation ? (
                <Chip
                  label="Initial build"
                  size="small"
                  variant="outlined"
                  color="default"
                  sx={{ fontSize: '0.65rem', height: (theme) => theme.spacing(2.25) }}
                />
              ) : (
                <Chip
                  label={build.isAutoDeploy ? 'Automatic' : 'Manual'}
                  size="small"
                  variant="outlined"
                  color={build.isAutoDeploy ? 'primary' : 'info'}
                  sx={{ fontSize: '0.65rem', height: (theme) => theme.spacing(2.25) }}
                />
              )}
              <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                #{build.id}
              </Typography>
              <Tooltip title={buildIdCopied ? 'Copied!' : 'Copy full build ID'}>
                <IconButton aria-label="Copy full build ID" size="small" onClick={handleCopyBuildId} sx={{ p: 0.25 }}>
                  {buildIdCopied ? <Check size={13} /> : <Copy size={13} />}
                </IconButton>
              </Tooltip>
            </Stack>
          </Stack>

          {build.startedAt && (
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Typography variant="body2" color="text.secondary">
                Started time
              </Typography>
              <Typography variant="body2">{formatBuildDate(build.startedAt)}</Typography>
            </Stack>
          )}
        </Stack>
      </Box>

      {/* Stage stepper */}
      {(() => {
        const hasDecodedStages = logs !== null && BUILD_STAGES.some(({ key }) => getStepStatus(logs, key as 'init' | 'build' | 'deploy') !== 'pending');
        const showSpinner = (logsLoading && !logs) || (isInProgress && !hasDecodedStages);
        // A queued build has no pod yet, so there is nothing to retrieve — say that rather than warn.
        const showQueued = !showSpinner && !hasDecodedStages && build.status === 'queued';
        const showWarning = !showSpinner && !hasDecodedStages && !showQueued;

        if (showSpinner) {
          return (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 2, mt: 1 }}>
              <CircularProgress size={24} color="primary" />
            </Box>
          );
        }
        if (showQueued) {
          return (
            <Alert severity="info" variant="outlined" sx={{ mt: 2, bgcolor: 'transparent' }}>
              This build is queued. Logs will appear once it starts running.
            </Alert>
          );
        }
        if (showWarning) {
          return (
            <Alert severity="warning" variant="outlined" sx={{ mt: 2, bgcolor: 'transparent' }}>
              Build logs could not be retrieved. They may still be processing, have expired, or are temporarily unavailable.
            </Alert>
          );
        }
        return (
          <>
            {(hasBuildLog || logsLoading) && (
              <Stack direction="row" justifyContent="flex-start" sx={logsToggleRowSx}>
                <Button variant="text" size="small" startIcon={<List size={14} />} disabled={!hasBuildLog} onClick={() => onLogsOpenChange(!logsOpen)}>
                  {logsOpen ? 'Hide logs' : 'View logs'}
                </Button>
              </Stack>
            )}
            <BuildAccordionStepper logs={logs!} isInProgress={isInProgress} />
          </>
        );
      })()}
    </Stack>
  );

  if (!logsOpen) return details;

  return (
    <Stack direction="row" gap={2} sx={splitSx}>
      <Box sx={detailsColumnSx}>{details}</Box>
      <Box sx={logsColumnSx}>
        <BuildLogViewer logs={logs} logsLoading={logsLoading} showLogs live={live} fill />
      </Box>
    </Stack>
  );
}
