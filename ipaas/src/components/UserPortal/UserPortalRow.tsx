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

import { Box, Button, Chip, Skeleton, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import { Scopes } from '../../constants/permissions';
import { useCan } from '../../hooks/useCan';
import { useUserPortalPublishability } from '../../hooks/useUserPortal';
import { isUserPortalUnavailable } from '../../utils/apiErrors';
import { DEPLOY_REFUSAL, shownRefusals, unpublishingText, userPortalIsOff } from '../../utils/userPortal';
import PublishButton from './PublishButton';
import PublishRefusals from './PublishRefusals';
import RejectedScopes from './RejectedScopes';
import * as styles from './UserPortal.styles';
import { usePublishFlow } from './usePublishFlow';
import { useUnpublishFlow } from './useUnpublishFlow';
import UserPortalOffRow from './UserPortalOffRow';

interface UserPortalRowProps {
  orgHandler: string;
  projectId: string;
  componentId: string;
  /** The environment's slug. */
  environment: string;
  envName: string;
  /** Unpublishing a workflow gives its Management API back to the console, where the environment's API security allows. */
  isWorkflow?: boolean;
}

/**
 * Whether an AI agent, automation or workflow is published to this environment's User Portal, with
 * Publish or Unpublish. Publish is offered only when ipaas-service's publishing rules all pass; when
 * they don't, the row lists each rule broken, worded from its code, so the user knows what to change.
 * A publish that redeploys a workflow for the User Portal's sign-in is confirmed first: it turns the
 * console's workflow management off in the environment. Unpublishing it redeploys it too, to take the console's API key
 * again, which turns that back on, except in an environment that takes its API security by promotion: the gateway there
 * keeps taking only User Portal sign-ins until a promotion brings an API key. The unpublish confirmation says which.
 * That redeploy finishes in the background: the row says so until it ends, and offers to finish it if it fails.
 */
export default function UserPortalRow({ orgHandler, projectId, componentId, environment, envName, isWorkflow = false }: UserPortalRowProps): JSX.Element | null {
  const { data, isLoading, isError, error, refetch, isFetching } = useUserPortalPublishability(componentId, environment);
  const canDeploy = useCan()(Scopes.INTEGRATION_DEPLOY);
  // Each clears what the other left on the row as it starts.
  const unpublish = useUnpublishFlow({ componentId, projectId, environment, envName, isWorkflow, onStart: () => publish.reset() });
  const publish = usePublishFlow({ componentId, environment, envName, isWorkflow, onStart: () => unpublish.reset() });

  if (isLoading) return <Skeleton variant="rounded" height={40} sx={styles.rowSx} />;
  // A BFF that serves no User Portal has nothing to publish to.
  if (isError && isUserPortalUnavailable(error)) return null;
  if (isError || !data) {
    return (
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={styles.rowSx}>
        <Typography variant="caption" color="error">
          Could not check the User Portal.
        </Typography>
        <Button size="small" onClick={() => refetch()}>
          Retry
        </Button>
      </Stack>
    );
  }

  // With no portal in the environment, none of the other rules can be met yet, so the row asks only for one.
  if (userPortalIsOff(data)) return <UserPortalOffRow orgHandler={orgHandler} envName={envName} />;

  const reasons = shownRefusals(data.reasons);
  const pending = publish.isPending || unpublish.isPending;

  const action = data.published ? (
    <Tooltip title={canDeploy ? '' : DEPLOY_REFUSAL}>
      <span>
        <Button size="small" color="inherit" onClick={unpublish.request} disabled={!canDeploy || pending}>
          Unpublish
        </Button>
      </span>
    </Tooltip>
  ) : (
    <PublishButton flow={publish} publishable={data.publishable} redeploys={data.redeploys} busy={unpublish.isPending || isFetching} holdReason={data.unpublishing ? unpublishingText(envName, isWorkflow) : undefined} label="Publish" />
  );

  return (
    <Box sx={styles.rowSx}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Stack direction="row" alignItems="center" gap={1}>
          <Typography variant="caption" color="text.secondary">
            User Portal
          </Typography>
          <Chip size="small" label={data.published ? 'Published' : 'Not published'} color={data.published ? 'success' : 'default'} sx={styles.rowChipSx} />
        </Stack>
        {action}
      </Stack>

      {/* A running publish or unpublish is switching the workflow, so the rules read mid-switch aren't shown until it ends. */}
      {!data.published && !data.publishing && !data.unpublishing && reasons.length > 0 && <PublishRefusals reasons={reasons} envName={envName} />}

      {publish.progress && (
        <Typography variant="caption" color="text.secondary" component="p" sx={styles.rowNoteSx}>
          {publish.progress}
        </Typography>
      )}

      {/* An unpublish failure shows in its confirm dialog, and so does a publish that was confirmed; each stays open on it. */}
      {publish.error && (
        <Typography variant="caption" color="error" component="p" sx={styles.rowNoteSx}>
          {publish.error}
        </Typography>
      )}
      <RejectedScopes scopes={publish.rejectedScopes} sx={styles.rowNoteSx} />

      {unpublish.failure && (
        <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} sx={styles.rowNoteSx}>
          <Typography variant="caption" color="error">
            {unpublish.failure}
          </Typography>
          {canDeploy && (
            <Button size="small" color="inherit" onClick={unpublish.finish} disabled={pending} sx={{ flexShrink: 0 }}>
              Finish unpublishing
            </Button>
          )}
        </Stack>
      )}

      {publish.dialog}
      {unpublish.dialog}
    </Box>
  );
}
