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
import { useState, type JSX } from 'react';
import { Scopes } from '../../constants/permissions';
import { useCan } from '../../hooks/useCan';
import { useEntryEnvironment } from '../../hooks/useEntryEnvironment';
import { useUnpublishFromUserPortal, useUserPortalPublishability } from '../../hooks/useUserPortal';
import { isUserPortalUnavailable } from '../../utils/apiErrors';
import { shownRefusals, userPortalErrorText } from '../../utils/userPortal';
import ConfirmDeleteDialog from '../ConfirmDeleteDialog';
import PublishButton, { DEPLOY_REFUSAL } from './PublishButton';
import PublishRefusals from './PublishRefusals';
import * as styles from './UserPortal.styles';
import { usePublishFlow } from './usePublishFlow';

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
 */
export default function UserPortalRow({ orgHandler, projectId, componentId, environment, envName, isWorkflow = false }: UserPortalRowProps): JSX.Element | null {
  const { data, isLoading, isError, error, refetch, isFetching } = useUserPortalPublishability(componentId, environment);
  const entry = useEntryEnvironment(projectId, environment);
  const keepsPortalSignIn = isWorkflow && !entry.loading && !entry.isEntry;
  const unpublish = useUnpublishFromUserPortal();
  const canDeploy = useCan()(Scopes.INTEGRATION_DEPLOY);
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);
  // Scopes the last publish's endpoints require that the portal's users' tokens can't carry.
  const [rejectedScopes, setRejectedScopes] = useState<string[]>([]);
  const publish = usePublishFlow({
    componentId,
    environment,
    envName,
    onStart: () => {
      setRejectedScopes([]);
      unpublish.reset();
    },
    onPublished: (out) => setRejectedScopes(out.rejectedScopes),
  });

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

  const reasons = shownRefusals(data.reasons);
  const pending = publish.isPending || unpublish.isPending;
  const closeUnpublish = () => {
    unpublish.reset();
    setConfirmUnpublish(false);
  };
  const startUnpublish = () => {
    publish.reset();
    setRejectedScopes([]);
    unpublish.mutate({ componentId, environment }, { onSuccess: () => setConfirmUnpublish(false) });
  };

  const action = data.published ? (
    <Tooltip title={canDeploy ? '' : DEPLOY_REFUSAL}>
      <span>
        <Button size="small" color="inherit" onClick={() => setConfirmUnpublish(true)} disabled={!canDeploy || pending}>
          Unpublish
        </Button>
      </span>
    </Tooltip>
  ) : (
    <PublishButton flow={publish} publishable={data.publishable} redeploys={data.redeploys} busy={unpublish.isPending || isFetching} label="Publish" />
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

      {!data.published && reasons.length > 0 && <PublishRefusals reasons={reasons} envName={envName} orgHandler={orgHandler} />}

      {/* An unpublish failure shows in its confirm dialog, and so does a publish that was confirmed; each stays open on it. */}
      {publish.error && (
        <Typography variant="caption" color="error" component="p" sx={styles.rowNoteSx}>
          {publish.error}
        </Typography>
      )}
      {rejectedScopes.length > 0 && (
        <Typography variant="caption" color="warning.main" component="p" sx={styles.rowNoteSx}>
          The User Portal can&apos;t hold {rejectedScopes.length === 1 ? 'this scope' : 'these scopes'}, so its users&apos; tokens never carry {rejectedScopes.length === 1 ? 'it' : 'them'}: {rejectedScopes.join(', ')}.
        </Typography>
      )}

      {publish.dialog}

      {confirmUnpublish && (
        <ConfirmDeleteDialog title={`Unpublish from the User Portal in ${envName}?`} onConfirm={startUnpublish} onClose={closeUnpublish} isPending={unpublish.isPending} confirmLabel="Unpublish" pendingLabel="Unpublishing…" maxWidth="xs">
          <Typography variant="body2">The User Portal&apos;s users no longer see this integration there.{isWorkflow ? '' : ' The integration keeps running.'}</Typography>
          {isWorkflow && (
            <Typography variant="body2" sx={styles.dialogBodySx}>
              The workflow is redeployed in {envName} so its Workflow Management API takes the console&apos;s API key again.{' '}
              {keepsPortalSignIn ? (
                <>
                  {envName} takes its API security from {entry.entryEnvironmentName} by promotion, though, so the gateway keeps taking only User Portal sign-ins here, and the console&apos;s workflow views stay off. To turn them on again, put the API back on
                  API key in {entry.entryEnvironmentName}, as unpublishing the workflow there does, then promote it here.
                </>
              ) : (
                <>The console&apos;s workflow views work there again.</>
              )}
            </Typography>
          )}
          {unpublish.isError && (
            <Typography variant="body2" color="error" sx={styles.dialogErrorSx}>
              {userPortalErrorText(unpublish.error, envName)}
            </Typography>
          )}
        </ConfirmDeleteDialog>
      )}
    </Box>
  );
}
