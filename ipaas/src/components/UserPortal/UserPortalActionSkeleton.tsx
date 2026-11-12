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

import { Skeleton, Stack, Switch, Typography } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import * as styles from './UserPortal.styles';

/**
 * Stands in for the env card's User Portal switch while it loads, for every integration type that has one. Each part is
 * sized by what it stands in for, the switch's label and the switch itself, laid out as the switch lays them out, so the
 * footer doesn't change size when the switch arrives.
 */
export default function UserPortalActionSkeleton(): JSX.Element {
  return (
    <Stack direction="row" alignItems="center" sx={styles.toggleSx} role="status" aria-busy="true" aria-label="Loading the User Portal">
      <Skeleton variant="text">
        <Typography variant="body2">Publish to User Portal</Typography>
      </Skeleton>
      <Skeleton variant="rounded">
        <Switch size="small" />
      </Skeleton>
    </Stack>
  );
}
