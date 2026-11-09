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

import { Box, PageContent, PageTitle, Skeleton, Stack, Typography } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import * as styles from './WorkflowPageShell.styles';

const ROWS = [0, 1, 2, 3, 4];

/** Stands in for a workflow page's content (its filters and its table) while it connects or loads. */
export function WorkflowContentSkeleton({ caption }: { caption?: string }): JSX.Element {
  return (
    <Box aria-busy="true">
      {caption && (
        <Typography variant="caption" color="text.secondary" sx={styles.connecting}>
          {caption}
        </Typography>
      )}
      <Box sx={styles.toolbar}>
        <Skeleton variant="rounded" width={280} height={36} />
        <Skeleton variant="rounded" width={160} height={36} />
        <Skeleton variant="rounded" width={200} height={36} />
      </Box>
      <Box sx={styles.table}>
        {ROWS.map((row) => (
          <Box key={row} sx={styles.tableRow}>
            <Skeleton width="22%" />
            <Skeleton width="22%" />
            <Skeleton width="20%" />
            <Skeleton variant="rounded" width={72} height={20} />
            <Skeleton width="14%" />
          </Box>
        ))}
      </Box>
    </Box>
  );
}

/** A workflow page while its integration and environments load: the track bar, the title and the content. */
export function WorkflowPageSkeleton({ title }: { title: string }): JSX.Element {
  return (
    <Box sx={styles.page}>
      <Box sx={styles.bandSkeleton} />
      <PageContent fullWidth>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={styles.titleRow}>
          <PageTitle>
            <PageTitle.Header>{title}</PageTitle.Header>
          </PageTitle>
          <Skeleton variant="rounded" width={180} height={28} />
        </Stack>
        <WorkflowContentSkeleton />
      </PageContent>
    </Box>
  );
}
