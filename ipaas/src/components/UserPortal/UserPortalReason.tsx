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

import { Box, Typography } from '@wso2/oxygen-ui';
import { CircleAlert } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';
import type { UserPortalRefusal } from '../../types/userPortal';
import { refusalText } from '../../utils/userPortal';
import * as styles from './UserPortal.styles';

/** One publishing rule the integration breaks, worded from its code for the environment it was refused in. */
export default function UserPortalReason({ reason, envName }: { reason: UserPortalRefusal; envName: string }): JSX.Element {
  return (
    <Box sx={styles.reasonSx}>
      <Box component="span" sx={styles.reasonIconSx}>
        <CircleAlert size={12} />
      </Box>
      <Typography variant="caption" color="text.secondary">
        {refusalText(reason, envName)}
      </Typography>
    </Box>
  );
}
