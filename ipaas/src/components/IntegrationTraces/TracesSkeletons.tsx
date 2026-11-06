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

import { Box, PageContent, Skeleton, Stack } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import * as styles from './IntegrationTraces.styles';

export function TraceStatCardsSkeleton(): JSX.Element {
  return (
    <Box sx={styles.kpiGrid}>
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} variant="rounded" height={96} />
      ))}
    </Box>
  );
}

export function TraceSectionsSkeleton(): JSX.Element {
  return (
    <>
      <Skeleton variant="rounded" height={340} sx={styles.card} />
      <Skeleton variant="rounded" height={280} sx={styles.card} />
    </>
  );
}

/** Mirrors the Traces page: title, toolbar, the four cards, then the chart and span sections. */
export default function TracesPageSkeleton(): JSX.Element {
  return (
    <PageContent>
      <Skeleton variant="text" width={160} height={48} />
      <Stack direction="row" sx={styles.toolbar}>
        <Skeleton variant="rounded" width={200} height={40} />
        <Skeleton variant="rounded" width={180} height={40} />
        <Skeleton variant="rounded" width={96} height={32} />
      </Stack>
      <TraceStatCardsSkeleton />
      <TraceSectionsSkeleton />
    </PageContent>
  );
}
