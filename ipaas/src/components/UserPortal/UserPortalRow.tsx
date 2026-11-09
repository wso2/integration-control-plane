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

import { Box, Button, Chip, Link, Skeleton, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { CircleAlert } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import { Link as RouterLink } from 'react-router';
import { Scopes } from '../../constants/permissions';
import { useCan } from '../../hooks/useCan';
import { usePublishToUserPortal, useUnpublishFromUserPortal, useUserPortalPublishability } from '../../hooks/useUserPortal';
import { userPortalUrl } from '../../nav';
import type { UserPortalRefusal } from '../../types/userPortal';
import { isUserPortalUnavailable } from '../../utils/apiErrors';
import { refusalText, shownRefusals, USER_PORTAL_NOT_ENABLED, userPortalErrorText } from '../../utils/userPortal';
import ConfirmDeleteDialog from '../ConfirmDeleteDialog';
import PublishWorkflowDialog from './PublishWorkflowDialog';
import * as styles from './UserPortal.styles';

const DEPLOY_REFUSAL = "Your role can't publish integrations to the User Portal.";

interface UserPortalRowProps {
  orgHandler: string;
  componentId: string;
  /** The environment's slug. */
  environment: string;
  envName: string;
}

/**
 * Whether an AI agent, automation or workflow is published to this environment's User Portal, with
 * Publish or Unpublish. Publish is offered only when ipaas-service's publishing rules all pass; when
 * they don't, the row lists each rule broken, worded from its code, so the user knows what to change.
 * A publish that redeploys a workflow for the User Portal's sign-in is confirmed first: it turns the
 * console's workflow management off in the environment.
 */
export default function UserPortalRow({ orgHandler, componentId, environment, envName }: UserPortalRowProps): JSX.Element | null {
  const { data, isLoading, isError, error, refetch, isFetching } = useUserPortalPublishability(componentId, environment);
  const publish = usePublishToUserPortal();
  const unpublish = useUnpublishFromUserPortal();
  const canDeploy = useCan()(Scopes.INTEGRATION_DEPLOY);
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);
  // Scopes the last publish's endpoints require that the portal's users' tokens can't carry.
  const [rejectedScopes, setRejectedScopes] = useState<string[]>([]);

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
  const startPublish = () => {
    setRejectedScopes([]);
    unpublish.reset();
    publish.mutate(
      { componentId, environment },
      {
        onSuccess: (out) => {
          setRejectedScopes(out.rejectedScopes);
          setConfirmPublish(false);
        },
      },
    );
  };
  const requestPublish = () => {
    if (!data.redeploys) {
      startPublish();
      return;
    }
    publish.reset();
    setConfirmPublish(true);
  };
  const closePublish = () => {
    publish.reset();
    setConfirmPublish(false);
  };
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
    <Tooltip title={!canDeploy ? DEPLOY_REFUSAL : data.publishable ? '' : 'Fix what is listed below to publish.'}>
      <span>
        <Button size="small" onClick={requestPublish} disabled={!canDeploy || !data.publishable || pending || isFetching}>
          {publish.isPending ? 'Publishing…' : 'Publish'}
        </Button>
      </span>
    </Tooltip>
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

      {!data.published && reasons.length > 0 && (
        <Stack gap={0.5} sx={styles.rowNoteSx} role="group" aria-label="Why it can't be published">
          {reasons.map((reason) => (
            <Reason key={reason.code + reason.message} reason={reason} envName={envName} orgHandler={orgHandler} />
          ))}
        </Stack>
      )}

      {/* An unpublish failure shows in its confirm dialog, and so does a publish that was confirmed; each stays open on it. */}
      {publish.isError && !confirmPublish && (
        <Typography variant="caption" color="error" component="p" sx={styles.rowNoteSx}>
          {userPortalErrorText(publish.error, envName)}
        </Typography>
      )}
      {rejectedScopes.length > 0 && (
        <Typography variant="caption" color="warning.main" component="p" sx={styles.rowNoteSx}>
          The User Portal can&apos;t hold {rejectedScopes.length === 1 ? 'this scope' : 'these scopes'}, so its users&apos; tokens never carry {rejectedScopes.length === 1 ? 'it' : 'them'}: {rejectedScopes.join(', ')}.
        </Typography>
      )}

      {confirmPublish && <PublishWorkflowDialog envName={envName} onConfirm={startPublish} onClose={closePublish} isPending={publish.isPending} error={publish.isError ? userPortalErrorText(publish.error, envName) : null} />}

      {confirmUnpublish && (
        <ConfirmDeleteDialog title={`Unpublish from the User Portal in ${envName}?`} onConfirm={startUnpublish} onClose={closeUnpublish} isPending={unpublish.isPending} confirmLabel="Unpublish" pendingLabel="Unpublishing…" maxWidth="xs">
          <Typography variant="body2">The User Portal&apos;s users no longer see this integration there. The integration keeps running.</Typography>
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

/** One publishing rule the integration breaks. The portal not being enabled is fixed on the User Portal page, so that one links there. */
function Reason({ reason, envName, orgHandler }: { reason: UserPortalRefusal; envName: string; orgHandler: string }): JSX.Element {
  return (
    <Box sx={styles.reasonSx}>
      <Box component="span" sx={styles.reasonIconSx}>
        <CircleAlert size={12} />
      </Box>
      <Typography variant="caption" color="text.secondary">
        {refusalText(reason, envName)}
        {reason.code === USER_PORTAL_NOT_ENABLED && (
          <>
            {' '}
            <Link component={RouterLink} to={userPortalUrl({ org: orgHandler })}>
              Enable it
            </Link>
          </>
        )}
      </Typography>
    </Box>
  );
}
