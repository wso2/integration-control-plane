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

import { Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Link, Stack, Switch, Tooltip } from '@wso2/oxygen-ui';
import { CircleAlert, ExternalLink, Info, Users } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import { Scopes } from '../../constants/permissions';
import { useCan } from '../../hooks/useCan';
import { useBackgroundPublishOutcome, useUserPortal, useUserPortalPublishability } from '../../hooks/useUserPortal';
import type { EnvCardNotification } from '../../types/integration';
import { isUserPortalUnavailable } from '../../utils/apiErrors';
import { DEPLOY_REFUSAL, shownRefusals, userPortalIsOff } from '../../utils/userPortal';
import AboutUserPortalDialog from './AboutUserPortalDialog';
import { publicationNotices } from './publicationNotices';
import PublishRefusals from './PublishRefusals';
import RejectedScopes from './RejectedScopes';
import { usePublishFlow } from './usePublishFlow';
import { useUnpublishFlow } from './useUnpublishFlow';
import UserPortalActionSkeleton from './UserPortalActionSkeleton';
import * as styles from './UserPortal.styles';

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
  /** Whether a published integration's Open User Portal link is here; false where the card links the portal elsewhere. */
  showPortalLink?: boolean;
  /**
   * Whether the switch reports how a background publish or unpublish ends.
   */
  reportsBackgroundOutcome?: boolean;
}

/**
 * The env card's User Portal action, in the card's footer.
 */
export default function UserPortalAction({ orgHandler, projectId, componentId, environment, envName, onNotify, isWorkflow = false, showPortalLink = true, reportsBackgroundOutcome = true }: UserPortalActionProps): JSX.Element | null {
  const { data, isLoading, error, refetch } = useUserPortalPublishability(componentId, environment);
  // The portal's address, for the link a published integration offers. Read only once published, and only where the link is.
  const { data: portal } = useUserPortal(environment, !!data?.published && showPortalLink);
  const canDeploy = useCan()(Scopes.INTEGRATION_DEPLOY);
  const [open, setOpen] = useState<'about' | 'refusals' | null>(null);

  const notices = publicationNotices(envName, onNotify);
  // Each clears what the other left on the card as it starts.
  const publish = usePublishFlow({ componentId, environment, envName, isWorkflow, onStart: () => unpublish.reset(), onPublished: notices.published });
  const unpublish = useUnpublishFlow({ componentId, projectId, environment, envName, isWorkflow, onStart: () => publish.reset(), onUnpublished: notices.unpublished });
  // A publish or unpublish that finishes in the background is reported when the publishability says it ended, so it is
  // also reported after a page reload.
  useBackgroundPublishOutcome(componentId, environment, reportsBackgroundOutcome ? notices.background : null);

  // The card's own dialogs open on a clean slate, so an earlier failure never shows after them.
  const openDialog = (dialog: 'about' | 'refusals') => {
    publish.reset();
    unpublish.reset();
    setOpen(dialog);
  };
  const close = () => setOpen(null);

  return (
    <>
      {action()}
      {/* While published, the scopes its users' tokens can't carry, so a refused call there has its reason in view. */}
      {data?.published && <RejectedScopes scopes={publish.rejectedScopes} sx={styles.rowNoteSx} />}
      {/*
        The dialogs sit outside the action's states. A publish or unpublish, even a failed one, reads the
        publishability again, and a partial one changes the state (published, with its scopes not synced).
        The dialog must stay open on its error through that.
      */}
      {open === 'about' && <AboutUserPortalDialog orgHandler={orgHandler} envName={envName} onClose={close} />}
      {open === 'refusals' && data && (
        <Dialog open onClose={close} maxWidth="xs" fullWidth>
          <DialogTitle>Can&apos;t publish to the User Portal in {envName} yet</DialogTitle>
          <DialogContent>
            <PublishRefusals reasons={shownRefusals(data.reasons)} envName={envName} />
          </DialogContent>
          <DialogActions>
            <Button variant="outlined" color="inherit" onClick={close}>
              Close
            </Button>
          </DialogActions>
        </Dialog>
      )}
      {publish.dialog}
      {unpublish.dialog}
    </>
  );

  function action(): JSX.Element | null {
    if (isLoading) return <UserPortalActionSkeleton />;
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
          Share with your users
        </Button>
      );
    }
    // One switch for both: on is published. Flipping it starts the shared flow (or, when the rules refuse, lists what
    // to fix), and the switch follows the result. A write's answer is put in the publishability as soon as it returns
    // (useWritePublication), so the switch shows it at once, and is never clickable on the state from before it.
    const { published } = data;
    const publishing = publish.isPending;
    const unpublishing = data.unpublishing;
    // A publish that failed in the background, or an unpublish whose work failed, until the next one; a published one has
    // outlived it. A refused publish shows its refusal in the confirmation instead.
    const failure = published ? null : (publish.error ?? unpublish.failure);
    const toggle = () => (published ? unpublish.request() : data.publishable ? publish.request() : openDialog('refusals'));
    // The switch's label stays short, so what a publish or unpublish is doing, or why the last one failed, goes in its tooltip.
    const tooltip = !canDeploy ? DEPLOY_REFUSAL : (publish.progress ?? failure ?? `${published ? 'Unpublish from' : 'Publish to'} the User Portal in ${envName}`);
    return (
      <Stack direction="row" alignItems="center" gap={2} flexWrap="wrap">
        <Tooltip title={tooltip}>
          <FormControlLabel
            control={<Switch size="small" checked={published} onChange={toggle} disabled={!canDeploy || publishing || unpublishing || unpublish.isPending} />}
            label={
              publishing || unpublishing ? (
                <Box component="span" sx={styles.publishedLabelSx}>
                  <CircularProgress size={12} color="inherit" />
                  {publishing ? 'Publishing…' : 'Unpublishing…'}
                </Box>
              ) : published ? (
                <Box component="span" sx={styles.publishedLabelSx}>
                  <Box component="span" sx={styles.publishedDotSx} />
                  Published to User Portal
                </Box>
              ) : failure ? (
                <Box component="span" sx={styles.publishedLabelSx}>
                  <Box component="span" sx={{ display: 'inline-flex', color: 'error.main' }}>
                    <CircleAlert size={14} />
                  </Box>
                  Publish to User Portal
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
        {unpublish.failure && canDeploy && (
          <Button variant="text" size="small" color="warning" onClick={unpublish.finish} disabled={unpublish.isPending} startIcon={unpublish.isPending ? <CircularProgress size={12} color="inherit" /> : undefined}>
            Finish unpublishing
          </Button>
        )}
        {/* Only a running portal has an address to open. */}
        {published && showPortalLink && portal?.state === 'active' && portal.url && (
          <Link href={portal.url} target="_blank" rel="noopener noreferrer" variant="body2" underline="hover" sx={styles.footerLinkSx}>
            Open User Portal
            <ExternalLink size={12} />
          </Link>
        )}
      </Stack>
    );
  }
}
