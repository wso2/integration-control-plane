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

import { Alert, Box, Button, CircularProgress, Collapse, Divider, IconButton, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { ChevronDown, ChevronUp, GitCommit, List } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useRef, useState } from 'react';
import { BUILD_STAGES } from '../constants/build';
import { useDeploymentStatus } from '../hooks/useDeployments';
import { useBuildLogs } from '../hooks/useBuilds';
import { useStableStepperState } from '../hooks/useStableStepperState';
import { buildStepperSteps, failedStepPhrase, getBuildStatus, humanizeConclusion, isFailedConclusion } from '../utils/buildProgress';
import type { Commit } from '../types/repository';
import BuildLogViewer from './BuildLogViewer';
import HorizontalStepper from './HorizontalStepper';
import * as styles from './BuildCard.styles';

interface BuildCardProps {
  componentId: string;
  versionId: string;
  latestCommit?: Commit | null;
}

export default function BuildCard({ componentId, versionId, latestCommit }: BuildCardProps) {
  const { data: deployments, isPending: loadingBuilds } = useDeploymentStatus(componentId, versionId);
  const lastBuild = deployments?.[0] ?? null;

  const [showLogs, setShowLogs] = useState(false);

  // The card must not unfurl as the first build data lands — right after a
  // deploy the page is already settling, and an animating card reads as a
  // glitch. Skip the transition until we have rendered real data once.
  const seenBuildRef = useRef(false);
  const animateBody = seenBuildRef.current;
  if (lastBuild) seenBuildRef.current = true;

  const status = lastBuild?.status;
  const conclusion = lastBuild?.conclusion ?? '';
  const isInProgress = status === 'in_progress';

  // Open while the build is running, or once it has ended badly and wants
  // reading. Stay shut while it is merely queued — there is no progress to show
  // yet — and after it has succeeded. The user can still override either way.
  const autoExpanded = isInProgress || (status === 'completed' && conclusion !== 'success');
  const [expandedOverride, setExpandedOverride] = useState<boolean | null>(null);

  // Drop the manual override whenever the build moves on, so the auto state
  // applies to each new build and to each status change within one — a queued
  // build opens by itself the moment it starts running.
  useEffect(() => {
    setExpandedOverride(null);
    setShowLogs(false);
  }, [lastBuild?.id, status, conclusion]);

  const expanded = expandedOverride !== null ? expandedOverride : autoExpanded;
  const toggleExpanded = () => {
    // Collapsing takes the log panel with it, so re-expanding comes back to the
    // stepper rather than silently reopening logs.
    if (expanded) setShowLogs(false);
    setExpandedOverride(!expanded);
  };

  // The log panel lives inside the collapsible body, so a collapsed card is
  // never showing logs — whatever `showLogs` says. Drives the button label so
  // an auto-collapse (build succeeded) can't leave it reading "Hide Logs".
  const logsVisible = expanded && showLogs;

  const workflowName = lastBuild?.buildRef ?? String(lastBuild?.id ?? '');
  const { data: logs, isLoading: queryLoading } = useBuildLogs(componentId, versionId, workflowName, expanded, { status, conclusion, keepFresh: logsVisible });

  // Never feed the raw per-poll state straight to the stepper — ratchet it so it
  // only moves forward and holds its error state.
  const { state: stepperState, isReadyToShow } = useStableStepperState(lastBuild?.id ?? null, getBuildStatus(status, conclusion, logs), status, conclusion, logs != null);

  // While the build list is still in flight the card stays collapsed and says
  // nothing — claiming "No builds yet." is wrong the instant after a deploy,
  // when a build exists and is simply not fetched yet.
  if (!lastBuild) {
    return (
      <Box sx={styles.cardSx}>
        <Typography variant="h5" component="h2" sx={styles.placeholderTitleSx(!loadingBuilds)}>
          Latest Build
        </Typography>
        {!loadingBuilds && (
          <Typography variant="body2" color="text.secondary">
            No builds yet.
          </Typography>
        )}
      </Box>
    );
  }

  // The card names the commit this build was made from, not the repo's newest. The build record
  // carries no message, and `latestCommit`'s belongs to HEAD — so it is only shown when the two
  // are the same commit, rather than captioning one SHA with another's message.
  const buildSha = lastBuild.sourceCommitId || '';
  const commitSha = (buildSha || latestCommit?.sha || '').slice(0, 7);
  const isHeadBuild = !buildSha || (!!latestCommit?.sha && latestCommit.sha.slice(0, 7) === buildSha.slice(0, 7));
  const commitMessage = isHeadBuild ? (latestCommit?.message ?? '') : '';
  const commitTooltip = commitMessage ? `"${commitMessage}"${latestCommit?.author?.name ? ` by ${latestCommit.author.name}` : ''}` : commitSha;

  // A finished build resolves past the last step; clamp that to -1 so the shared
  // stepper highlights nothing (it only supports indices 0..steps-1 or -1).
  const currentStepIndex = stepperState.activeIndex >= BUILD_STAGES.length ? -1 : stepperState.activeIndex;

  // Name the step that broke when we can resolve it: "Failed while building the image".
  const failedPhrase = failedStepPhrase(logs);
  const failedLabel = failedPhrase ? `Failed while ${failedPhrase}` : 'Failed';

  let statusLabel = 'Unknown';
  let statusDotColor = 'text.disabled';
  if (status === 'queued') {
    statusLabel = 'Queued';
    statusDotColor = 'text.secondary';
  } else if (status === 'in_progress') {
    // A stage can fail before the build itself is marked complete; surface that
    // straight away instead of reading "In Progress" until the run wraps up.
    const failedEarly = stepperState.failedStages.size > 0;
    statusLabel = failedEarly ? failedLabel : 'In Progress';
    statusDotColor = failedEarly ? 'error.main' : 'warning.main';
  } else if (status === 'completed' && conclusion === 'success') {
    statusLabel = 'Completed';
    statusDotColor = 'success.main';
  } else if (status === 'completed' && isFailedConclusion(conclusion)) {
    statusLabel = failedLabel;
    statusDotColor = 'error.main';
  } else if (status === 'completed') {
    // Terminal, but neither success nor failure — cancelled, timed out, neutral.
    // Name the verdict rather than leaving the card reading "Unknown".
    statusLabel = humanizeConclusion(conclusion);
    statusDotColor = 'text.secondary';
  }

  // A finished build whose real stage state is still unknown gets a placeholder
  // rather than a stepper built from guesses.
  function renderStepper() {
    if (isReadyToShow) return <HorizontalStepper steps={buildStepperSteps(stepperState)} currentStepIndex={currentStepIndex} size="s" />;
    if (logs === null) {
      return (
        <Alert severity="warning" sx={styles.alertSx}>
          Build logs cannot be fetched. Trigger a new build to continue.
        </Alert>
      );
    }
    return (
      <Box sx={styles.centeredRowSx}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  return (
    <Box sx={styles.cardSx}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={styles.headerRowSx(expanded)}>
        <Stack direction="row" alignItems="center" gap={1.5} sx={styles.minWidthZeroSx}>
          <Typography variant="h5" component="h2" sx={styles.titleSx}>
            Latest Build
          </Typography>

          {commitSha && (
            <Tooltip title={commitTooltip} placement="bottom">
              <Stack direction="row" alignItems="center" gap={0.5} sx={styles.commitRowSx}>
                <GitCommit size={14} style={{ opacity: 0.55, flexShrink: 0 }} />
                <Typography variant="body2" color="text.secondary" sx={styles.commitShaSx}>
                  {commitSha}
                </Typography>
                {commitMessage && (
                  <Typography variant="body2" color="text.secondary" sx={styles.commitMessageSx}>
                    {commitMessage}
                  </Typography>
                )}
              </Stack>
            </Tooltip>
          )}

          <Stack direction="row" alignItems="center" gap={0.75} sx={styles.noShrinkSx}>
            <Box sx={styles.statusDotSx(statusDotColor)} />
            <Typography variant="body2" color="text.secondary">
              {statusLabel}
            </Typography>
          </Stack>
        </Stack>

        <Stack direction="row" alignItems="center" gap={0.5} sx={styles.noShrinkSx}>
          <Button
            variant="text"
            size="small"
            startIcon={<List size={14} />}
            onClick={() => {
              if (logsVisible) {
                setShowLogs(false);
                return;
              }
              // Asking for logs on a collapsed card opens the body too.
              if (!expanded) setExpandedOverride(true);
              setShowLogs(true);
            }}
            sx={styles.logsButtonSx}>
            {logsVisible ? 'Hide Logs' : 'View Logs'}
          </Button>
          <Tooltip title={expanded ? 'Collapse' : 'Expand'}>
            <IconButton size="small" onClick={toggleExpanded}>
              {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>

      <Collapse in={expanded} timeout={animateBody ? undefined : 0}>
        <Divider sx={{ mb: 2 }} />

        <Box sx={styles.stepperWrapSx(logsVisible)}>{renderStepper()}</Box>

        {logsVisible && (
          <>
            <BuildLogViewer logs={logs} logsLoading={queryLoading} showLogs />
          </>
        )}
      </Collapse>
    </Box>
  );
}
