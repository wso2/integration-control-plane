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

import { Box, Link, Stack, Typography } from '@wso2/oxygen-ui';
import { CircleAlert } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';
import { Link as RouterLink } from 'react-router';
import { userPortalUrl } from '../../nav';
import type { UserPortalRefusal } from '../../types/userPortal';
import { refusalText, USER_PORTAL_NOT_ENABLED } from '../../utils/userPortal';
import * as styles from './UserPortal.styles';

interface PublishRefusalsProps {
  reasons: UserPortalRefusal[];
  envName: string;
  orgHandler: string;
}

/** Each publishing rule an integration breaks in an environment, worded from its code, so the reader knows what to change. */
export default function PublishRefusals({ reasons, envName, orgHandler }: PublishRefusalsProps): JSX.Element {
  return (
    <Stack gap={0.5} sx={styles.rowNoteSx} role="group" aria-label="Why it can't be published">
      {reasons.map((reason) => (
        <Reason key={reason.code + reason.message} reason={reason} envName={envName} orgHandler={orgHandler} />
      ))}
    </Stack>
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
