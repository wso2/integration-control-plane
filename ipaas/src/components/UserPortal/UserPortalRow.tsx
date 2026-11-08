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
import { isUserPortalUnavailable, usePublishToUserPortal, useUnpublishFromUserPortal, useUserPortalPublishability } from '../../hooks/useUserPortal';
import { userPortalUrl } from '../../nav';
import type { UserPortalRefusal } from '../../types/userPortal';
import ConfirmDeleteDialog from '../ConfirmDeleteDialog';

const chipSx = { height: 18, fontSize: '0.65rem' } as const;
const reasonSx = { display: 'flex', gap: 0.75, alignItems: 'flex-start' } as const;
const reasonIconSx = { flexShrink: 0, mt: '2px', color: 'warning.main', display: 'inline-flex' } as const;

const DEPLOY_REFUSAL = "Your role can't publish integrations to the User Portal.";

// The portal itself isn't enabled here: the fix is on the User Portal page, so the reason links there.
const NOT_ENABLED = 'USER_PORTAL_NOT_ENABLED';

interface UserPortalRowProps {
  orgHandler: string;
  componentId: string;
  /** The environment's slug. */
  environment: string;
  envName: string;
}

const errorText = (err: unknown): string => (err instanceof Error ? err.message : 'Something went wrong.');

/**
 * Whether an AI agent, automation or workflow is published to this environment's User Portal, with
 * Publish or Unpublish. Publish is offered only when ipaas-service's publishing rules all pass; when
 * they don't, the row lists each rule broken, in ipaas-service's words, so the user knows what to change.
 */
export default function UserPortalRow({ orgHandler, componentId, environment, envName }: UserPortalRowProps): JSX.Element | null {
  const { data, isLoading, isError, error, refetch, isFetching } = useUserPortalPublishability(componentId, environment);
  const publish = usePublishToUserPortal();
  const unpublish = useUnpublishFromUserPortal();
  const canDeploy = useCan()(Scopes.INTEGRATION_DEPLOY);
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);
  // Scopes the last publish's endpoints require that the portal's users' tokens can't carry.
  const [rejectedScopes, setRejectedScopes] = useState<string[]>([]);

  if (isLoading) return <Skeleton variant="rounded" height={40} sx={{ mt: 2 }} />;
  // A BFF that serves no User Portal has nothing to publish to.
  if (isError && isUserPortalUnavailable(error)) return null;
  if (isError || !data) {
    return (
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mt: 2 }}>
        <Typography variant="caption" color="error">
          Could not check the User Portal.
        </Typography>
        <Button size="small" onClick={() => refetch()}>
          Retry
        </Button>
      </Stack>
    );
  }

  const pending = publish.isPending || unpublish.isPending;
  const startPublish = () => {
    setRejectedScopes([]);
    unpublish.reset();
    publish.mutate({ componentId, environment }, { onSuccess: (out) => setRejectedScopes(out.rejectedScopes) });
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
        <Button size="small" onClick={startPublish} disabled={!canDeploy || !data.publishable || pending || isFetching}>
          {publish.isPending ? 'Publishing…' : 'Publish'}
        </Button>
      </span>
    </Tooltip>
  );

  return (
    <Box sx={{ mt: 2 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Stack direction="row" alignItems="center" gap={1}>
          <Typography variant="caption" color="text.secondary">
            User Portal
          </Typography>
          <Chip size="small" label={data.published ? 'Published' : 'Not published'} color={data.published ? 'success' : 'default'} sx={chipSx} />
        </Stack>
        {action}
      </Stack>

      {!data.published && data.reasons.length > 0 && (
        <Stack gap={0.5} sx={{ mt: 0.5 }} aria-label="Why it can't be published">
          {data.reasons.map((reason) => (
            <Reason key={reason.code + reason.message} reason={reason} orgHandler={orgHandler} />
          ))}
        </Stack>
      )}

      {/* An unpublish failure shows in its confirm dialog, which stays open on it. */}
      {publish.isError && (
        <Typography variant="caption" color="error" component="p" sx={{ mt: 0.5 }}>
          {errorText(publish.error)}
        </Typography>
      )}
      {rejectedScopes.length > 0 && (
        <Typography variant="caption" color="warning.main" component="p" sx={{ mt: 0.5 }}>
          The User Portal can&apos;t hold {rejectedScopes.length === 1 ? 'this scope' : 'these scopes'}, so its users&apos; tokens never carry {rejectedScopes.length === 1 ? 'it' : 'them'}: {rejectedScopes.join(', ')}.
        </Typography>
      )}

      {confirmUnpublish && (
        <ConfirmDeleteDialog title={`Unpublish from the User Portal in ${envName}?`} onConfirm={startUnpublish} onClose={closeUnpublish} isPending={unpublish.isPending} confirmLabel="Unpublish" pendingLabel="Unpublishing…" maxWidth="xs">
          <Typography variant="body2">The User Portal&apos;s users no longer see this integration there. The integration keeps running.</Typography>
          {unpublish.isError && (
            <Typography variant="body2" color="error" sx={{ mt: 2 }}>
              {errorText(unpublish.error)}
            </Typography>
          )}
        </ConfirmDeleteDialog>
      )}
    </Box>
  );
}

/** One publishing rule the integration breaks, as ipaas-service words it. */
function Reason({ reason, orgHandler }: { reason: UserPortalRefusal; orgHandler: string }): JSX.Element {
  return (
    <Box sx={reasonSx}>
      <Box component="span" sx={reasonIconSx}>
        <CircleAlert size={12} />
      </Box>
      <Typography variant="caption" color="text.secondary">
        {reason.message}
        {reason.code === NOT_ENABLED && (
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
