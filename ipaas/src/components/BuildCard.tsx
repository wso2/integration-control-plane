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
import { Box, Button, Collapse, Divider, Stack, Typography } from '@wso2/oxygen-ui';
import { List } from '@wso2/oxygen-ui-icons-react';
import CommitSummary from './CommitSummary';
import { CARD_HEADER_TITLE_SX } from '../constants/styles';
import { useEffect, useState } from 'react';
import { useDeploymentStatus } from '../hooks/useDeployments';
import { useBuildLogs } from '../hooks/useBuilds';
import { useStableStepperState } from '../hooks/useStableStepperState';
import { buildStepperSteps, describeBuildStatus, failedStepPhrase, getBuildStatus, isFailedConclusion } from '../utils/buildProgress';
import { findCommitBySha } from '../utils/commits';
import { isBuildLive } from '../utils/build';
import type { Commit } from '../types/repository';
import BuildLogViewer from './BuildLogViewer';
import BuildStatusPill from './BuildStatusPill';
import * as styles from './BuildCard.styles';

interface BuildCardProps {
  componentId: string;
  versionId: string;
  /** Recent commit history, joined against the build's own SHA to caption it. */
  commits?: Commit[];
}

export default function BuildCard({ componentId, versionId, commits }: BuildCardProps) {
  const { data: deployments, isPending: loadingBuilds } = useDeploymentStatus(componentId, versionId);
  const lastBuild = deployments?.[0] ?? null;

  const [showLogs, setShowLogs] = useState(false);

  const status = lastBuild?.status;
  const conclusion = lastBuild?.conclusion ?? '';

  // A new build starts with its logs shut.
  useEffect(() => {
    setShowLogs(false);
  }, [lastBuild?.id]);

  // The status pill takes its stages, and a failure's step, from the logs, so they are read while the
  // build runs or once it has failed, and whenever they show. A queued, successful or cancelled build's
  // pill needs none of them.
  const needsLogs = showLogs || status === 'in_progress' || isFailedConclusion(conclusion);
  const workflowName = lastBuild?.buildRef ?? String(lastBuild?.id ?? '');
  const { data: logs, isLoading: queryLoading } = useBuildLogs(componentId, versionId, workflowName, needsLogs, { status, conclusion, keepFresh: showLogs });

  // Never feed the raw per-poll state straight to the pill — ratchet it so it
  // only moves forward and holds its error state.
  const { state: stepperState, isReadyToShow } = useStableStepperState(lastBuild?.id ?? null, getBuildStatus(status, conclusion, logs), status, conclusion, logs != null);

  // While the build list is still in flight the card says nothing — claiming
  // "No builds yet." is wrong the instant after a deploy, when a build exists
  // and is simply not fetched yet.
  if (!lastBuild) {
    return (
      <Box sx={styles.cardSx}>
        <Typography variant="h5" component="h2" sx={styles.placeholderTitleSx(!loadingBuilds)}>
          Latest build
        </Typography>
        {!loadingBuilds && (
          <Typography variant="body2" color="text.secondary">
            No builds yet.
          </Typography>
        )}
      </Box>
    );
  }

  // A build older than the fetched history stays SHA-only rather than borrowing another commit's message.
  const buildSha = lastBuild.sourceCommitId || '';
  const buildCommit = findCommitBySha(commits, buildSha);
  const commitSha = buildSha.slice(0, 7);
  const commitMessage = buildCommit?.message ?? '';
  const commitTooltip = commitMessage ? `"${commitMessage}"${buildCommit?.author?.name ? ` by ${buildCommit.author.name}` : ''}` : commitSha;

  // Name the step that broke when we can resolve it: "Failed while building the image".
  const failedPhrase = failedStepPhrase(logs);
  const failedLabel = failedPhrase ? `Failed while ${failedPhrase}` : 'Failed';

  const { label: statusLabel, tone } = describeBuildStatus(status, conclusion, stepperState, failedLabel);

  return (
    <Box sx={styles.cardSx}>
      <Stack direction="row" alignItems="center" gap={1.5}>
        <Typography variant="h5" component="h2" sx={CARD_HEADER_TITLE_SX}>
          Latest build
        </Typography>

        {commitSha && <CommitSummary sha={commitSha} message={commitMessage} tooltip={commitTooltip} />}

        {/* A stage state guessed before the logs arrive would mislead, so the stages wait for the first read
            (`undefined` until then; `null` when the build has none). A running build is otherwise ready at once,
            on stage 1. */}
        <BuildStatusPill tone={tone} label={statusLabel} steps={isReadyToShow && logs !== undefined ? buildStepperSteps(stepperState) : undefined} />

        <Button variant="text" size="small" startIcon={<List size={14} />} onClick={() => setShowLogs(!showLogs)} aria-expanded={showLogs} sx={styles.logsButtonSx}>
          {showLogs ? 'Hide logs' : 'View logs'}
        </Button>
      </Stack>

      <Collapse in={showLogs} unmountOnExit>
        <Divider sx={styles.dividerSx} />
        <BuildLogViewer logs={logs} logsLoading={queryLoading} showLogs live={isBuildLive(status)} />
      </Collapse>
    </Box>
  );
}
