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

import { Box, Card, Divider, PageContent, Skeleton } from '@wso2/oxygen-ui';
import { Fragment, type JSX } from 'react';
import * as styles from '../../pages/OrgOverview.styles';

const ROWS = [0, 1, 2];

/** Org Overview's layout while the org home decides whether to show it: greeting, three cards and the projects list. */
export default function OrgOverviewSkeleton(): JSX.Element {
  return (
    <PageContent fullWidth>
      <Skeleton variant="text" width={280} height={56} sx={styles.greeting} />
      <Skeleton variant="text" width="50%" sx={styles.intro} />
      <Box sx={styles.summaryGrid}>
        {ROWS.map((i) => (
          <Skeleton key={i} variant="rounded" height={160} />
        ))}
      </Box>
      <Card>
        <Box sx={styles.sectionHeader}>
          <Skeleton variant="text" width={120} />
        </Box>
        <Divider />
        {ROWS.map((i) => (
          <Fragment key={i}>
            <Box sx={styles.listRow}>
              <Skeleton variant="circular" width={40} height={40} />
              <Box sx={{ flex: 1 }}>
                <Skeleton width="30%" />
                <Skeleton width="20%" />
              </Box>
            </Box>
            <Divider />
          </Fragment>
        ))}
      </Card>
    </PageContent>
  );
}
