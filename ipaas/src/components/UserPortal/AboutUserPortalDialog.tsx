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

import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import { Link as RouterLink } from 'react-router';
import { Scopes } from '../../constants/permissions';
import { useCan } from '../../hooks/useCan';
import { userPortalUrl } from '../../nav';
import * as styles from './UserPortal.styles';

export const ABOUT_USER_PORTAL = 'About the User Portal';
export const ASK_AN_ADMIN = 'Ask an admin to turn it on.';

interface AboutUserPortalDialogProps {
  orgHandler: string;
  envName: string;
  onClose: () => void;
}

/**
 * What the User Portal is, for an environment that has none: shown where an integration could be
 * published to it. A role that can enable it gets the way there; any other is told to ask an admin.
 */
export default function AboutUserPortalDialog({ orgHandler, envName, onClose }: AboutUserPortalDialogProps): JSX.Element {
  const canManage = useCan()(Scopes.ENVIRONMENT_MANAGE);
  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{ABOUT_USER_PORTAL}</DialogTitle>
      <DialogContent>
        <Typography variant="body2">The User Portal is where your organization&apos;s users sign in to chat with AI agents, run automations and act on workflow tasks. They see only the integrations you publish to it.</Typography>
        <Typography variant="body2" sx={styles.aboutNoteSx}>
          Each environment can have its own User Portal. Turn it on in {envName} to publish this integration there.
          {!canManage && ` ${ASK_AN_ADMIN}`}
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" color="inherit" onClick={onClose}>
          Close
        </Button>
        {canManage && (
          <Button variant="contained" component={RouterLink} to={userPortalUrl({ org: orgHandler })}>
            Enable User Portal
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
