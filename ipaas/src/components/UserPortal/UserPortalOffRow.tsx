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

import { Button, IconButton, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { Info } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import { Link as RouterLink } from 'react-router';
import { Scopes } from '../../constants/permissions';
import { useCan } from '../../hooks/useCan';
import { userPortalUrl } from '../../nav';
import AboutUserPortalDialog, { ABOUT_USER_PORTAL, ASK_AN_ADMIN } from './AboutUserPortalDialog';
import * as styles from './UserPortal.styles';

interface UserPortalOffRowProps {
  orgHandler: string;
  envName: string;
}

/**
 * The Deploy page card's User Portal row when the environment has no User Portal. Until one runs
 * there, no other publishing rule can be met, so the row says only that, with a way to turn it on
 * and an (i) that explains what the User Portal is.
 */
export default function UserPortalOffRow({ orgHandler, envName }: UserPortalOffRowProps): JSX.Element {
  const canManage = useCan()(Scopes.ENVIRONMENT_MANAGE);
  const [aboutOpen, setAboutOpen] = useState(false);

  return (
    <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} sx={styles.rowSx}>
      <Stack direction="row" alignItems="center" gap={0.5}>
        <Typography variant="caption" color="text.secondary">
          User Portal is off here
        </Typography>
        <Tooltip title={ABOUT_USER_PORTAL}>
          <IconButton size="small" aria-label={ABOUT_USER_PORTAL} onClick={() => setAboutOpen(true)} sx={styles.infoButtonSx}>
            <Info size={14} />
          </IconButton>
        </Tooltip>
      </Stack>
      {canManage ? (
        <Button size="small" component={RouterLink} to={userPortalUrl({ org: orgHandler })}>
          Enable
        </Button>
      ) : (
        <Typography variant="caption" color="text.secondary">
          {ASK_AN_ADMIN}
        </Typography>
      )}
      {aboutOpen && <AboutUserPortalDialog orgHandler={orgHandler} envName={envName} onClose={() => setAboutOpen(false)} />}
    </Stack>
  );
}
