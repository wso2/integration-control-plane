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

import { Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Link, Skeleton, Stack, Switch, Tooltip, Typography } from '@wso2/oxygen-ui';
import { CircleAlert, ExternalLink, Info, Users } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import { Scopes } from '../../constants/permissions';
import { useCan } from '../../hooks/useCan';
import { usePublishToUserPortal, useUnpublishFromUserPortal, useUserPortal, useUserPortalPublishability } from '../../hooks/useUserPortal';
import type { EnvCardNotification } from '../../types/integration';
import { isUserPortalUnavailable } from '../../utils/apiErrors';
import { DEPLOY_REFUSAL, rejectedScopesText, shownRefusals, userPortalErrorText, userPortalIsOff } from '../../utils/userPortal';
import ConfirmDeleteDialog from '../ConfirmDeleteDialog';
import AboutUserPortalDialog from './AboutUserPortalDialog';
import PublishWorkflowDialog from './PublishWorkflowDialog';
import UnpublishNote from './UnpublishNote';
import * as styles from './UserPortal.styles';
import UserPortalReason from './UserPortalReason';

interface UserPortalActionProps {
  orgHandler: string;
  projectId: string;
  componentId: string;
  /** The environment's slug. */
  environment: string;
  envName: string;
  /** Reports a publish on the env card. */
  onNotify: (notification: EnvCardNotification) => void;
  /** Unpublishing a workflow gives its Management API back to the console, where the environment's API security allows. */
  isWorkflow?: boolean;
}

/**
 * The env card's User Portal action, in the card's footer. Its verb follows the state:
 * "User Portal off" explains the portal and how to turn it on; "Publish" confirms, then publishes, or
 * lists what to fix when ipaas-service's rules refuse; "Unpublish" confirms, then unpublishes. A publish that
 * redeploys a workflow for the User Portal's sign-in says so in its confirmation, as an unpublish that redeploys it
 * back does.
 */
export default function UserPortalAction({ orgHandler, projectId, componentId, environment, envName, onNotify, isWorkflow = false }: UserPortalActionProps): JSX.Element | null {
  const { data, isLoading, error, refetch } = useUserPortalPublishability(componentId, environment);
  const publish = usePublishToUserPortal();
  const unpublish = useUnpublishFromUserPortal();
  // The portal's address, for the link a published integration offers. Read only once published.
  const { data: portal } = useUserPortal(environment, !!data?.published);
  const canDeploy = useCan()(Scopes.INTEGRATION_DEPLOY);
  const [open, setOpen] = useState<'about' | 'publish' | 'refusals' | 'unpublish' | null>(null);

  // A dialog opens on a clean slate and clears what it leaves behind, so an earlier failure never shows in it.
  const openDialog = (dialog: 'about' | 'publish' | 'refusals' | 'unpublish') => {
    publish.reset();
    unpublish.reset();
    setOpen(dialog);
  };
  const close = () => {
    publish.reset();
    unpublish.reset();
    setOpen(null);
  };

  const startPublish = () =>
    publish.mutate(
      { componentId, environment },
      {
        onSuccess: ({ rejectedScopes }) => {
          close();
          onNotify({
            text: `Published to the User Portal in ${envName}.`,
            severity: 'success',
            // Scopes the endpoints require that the portal's users' tokens can't carry.
            detail: rejectedScopes.length > 0 ? rejectedScopesText(rejectedScopes) : undefined,
          });
        },
      },
    );
  const startUnpublish = () => unpublish.mutate({ componentId, environment }, { onSuccess: close });

  return (
    <>
      {action()}
      {/*
        The dialogs sit outside the action's states. A publish or unpublish, even a failed one, reads the
        publishability again, and a partial one changes the state (published, with its scopes not synced).
        The dialog must stay open on its error through that.
      */}
      {open === 'about' && <AboutUserPortalDialog orgHandler={orgHandler} envName={envName} onClose={close} />}
      {open === 'publish' && data?.redeploys && <PublishWorkflowDialog envName={envName} onConfirm={startPublish} onClose={close} isPending={publish.isPending} error={publish.isError ? userPortalErrorText(publish.error, envName) : null} />}
      {open === 'publish' && !data?.redeploys && (
        <Dialog open onClose={publish.isPending ? undefined : close} maxWidth="xs" fullWidth>
          <DialogTitle>Publish to the User Portal in {envName}?</DialogTitle>
          <DialogContent>
            <Typography variant="body2">The User Portal&apos;s users in {envName} can then find this integration there and use it.</Typography>
            {publish.isError && (
              <Typography variant="body2" color="error" sx={styles.dialogErrorSx}>
                {userPortalErrorText(publish.error, envName)}
              </Typography>
            )}
          </DialogContent>
          <DialogActions>
            <Button variant="outlined" color="inherit" onClick={close} disabled={publish.isPending}>
              Cancel
            </Button>
            <Button variant="contained" onClick={startPublish} disabled={publish.isPending} startIcon={publish.isPending ? <CircularProgress size={16} color="inherit" /> : undefined}>
              {publish.isPending ? 'Publishing…' : 'Publish'}
            </Button>
          </DialogActions>
        </Dialog>
      )}
      {open === 'refusals' && data && (
        <Dialog open onClose={close} maxWidth="xs" fullWidth>
          <DialogTitle>Can&apos;t publish to the User Portal in {envName} yet</DialogTitle>
          <DialogContent>
            <Stack gap={1} role="group" aria-label="Why it can't be published">
              {shownRefusals(data.reasons).map((reason) => (
                <UserPortalReason key={reason.code + reason.message} reason={reason} envName={envName} />
              ))}
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button variant="outlined" color="inherit" onClick={close}>
              Close
            </Button>
          </DialogActions>
        </Dialog>
      )}
      {open === 'unpublish' && (
        <ConfirmDeleteDialog title={`Unpublish from the User Portal in ${envName}?`} onConfirm={startUnpublish} onClose={close} isPending={unpublish.isPending} confirmLabel="Unpublish" pendingLabel="Unpublishing…" maxWidth="xs">
          <UnpublishNote isWorkflow={isWorkflow} projectId={projectId} environment={environment} envName={envName} />
          {unpublish.isError && (
            <Typography variant="body2" color="error" sx={styles.dialogErrorSx}>
              {userPortalErrorText(unpublish.error, envName)}
            </Typography>
          )}
        </ConfirmDeleteDialog>
      )}
    </>
  );

  function action(): JSX.Element | null {
    if (isLoading) return <Skeleton variant="rounded" width={88} height={30} />;
    // A failed refetch keeps the last known state in `data`, so the switch stays while there is one.
    if (!data) {
      // A BFF that serves no User Portal has nothing to publish to.
      if (isUserPortalUnavailable(error)) return null;
      return (
        <Tooltip title="Could not check the User Portal. Try again.">
          <Button variant="text" size="small" color="warning" startIcon={<CircleAlert size={14} />} onClick={() => refetch()}>
            User Portal
          </Button>
        </Tooltip>
      );
    }
    // With no portal in the environment, none of the other rules can be met yet.
    if (userPortalIsOff(data)) {
      return (
        <Button variant="text" size="small" color="inherit" startIcon={<Users size={14} />} endIcon={<Info size={12} />} onClick={() => openDialog('about')} sx={styles.offActionSx}>
          User Portal off
        </Button>
      );
    }
    // One switch for both: on is published. Flipping it never publishes or unpublishes by itself;
    // it opens the confirm dialog (or, when the rules refuse, what to fix), and the switch follows the result.
    // A publish or unpublish stays pending until the publishability is read again (useWritePublication
    // awaits it), so the switch is never clickable on a stale state after one.
    const { published } = data;
    const toggle = () => openDialog(published ? 'unpublish' : data.publishable ? 'publish' : 'refusals');
    return (
      <Stack direction="row" alignItems="center" gap={2} flexWrap="wrap">
        <Tooltip title={canDeploy ? `${published ? 'Unpublish from' : 'Publish to'} the User Portal in ${envName}` : DEPLOY_REFUSAL}>
          <FormControlLabel
            control={<Switch size="small" checked={published} onChange={toggle} disabled={!canDeploy || publish.isPending || unpublish.isPending} />}
            label={
              published ? (
                <Box component="span" sx={styles.publishedLabelSx}>
                  <Box component="span" sx={styles.publishedDotSx} />
                  Published to User Portal
                </Box>
              ) : (
                'Publish to User Portal'
              )
            }
            labelPlacement="start"
            slotProps={{ typography: { variant: 'body2', color: 'text.secondary' } }}
            sx={styles.toggleSx}
          />
        </Tooltip>
        {/* Only a running portal has an address to open. */}
        {published && portal?.state === 'active' && portal.url && (
          <Link href={portal.url} target="_blank" rel="noopener noreferrer" variant="body2" underline="hover" sx={styles.footerLinkSx}>
            Open User Portal
            <ExternalLink size={12} />
          </Link>
        )}
      </Stack>
    );
  }
}
