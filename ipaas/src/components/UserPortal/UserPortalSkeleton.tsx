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

import { Box, Card, CardContent, Skeleton, Stack } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import * as styles from './UserPortal.styles';

/** Stands in for the User Portal cards while the environments and their portals load. */
export default function UserPortalSkeleton(): JSX.Element {
  return (
    <Box sx={styles.cardGridSx} role="status" aria-busy="true" aria-label="Loading User Portals">
      {[0, 1].map((i) => (
        <Card key={i} variant="outlined" sx={styles.cardSx}>
          <CardContent sx={styles.cardContentSx}>
            <Box sx={styles.cardHeadSx}>
              <Skeleton variant="rounded" width={64} height={64} />
              <Stack spacing={0.5} sx={{ flex: 1 }}>
                <Skeleton variant="text" width="50%" height={32} />
                <Skeleton variant="text" width="90%" />
              </Stack>
            </Box>
            <Stack spacing={2} sx={styles.detailsSx}>
              <Skeleton variant="text" />
              <Skeleton variant="text" />
            </Stack>
            <Skeleton variant="rounded" height={36} />
          </CardContent>
        </Card>
      ))}
    </Box>
  );
}
