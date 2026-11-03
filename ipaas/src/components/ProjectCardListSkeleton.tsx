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

import { Card, CardContent, Grid, PageContent, PageTitle, Skeleton, Stack } from '@wso2/oxygen-ui';
import type { JSX } from 'react';

/** How many placeholder cards to draw — a first-landing org rarely has more. */
const CARD_COUNT = 3;

/**
 * The projects grid's shape while the org is still resolving, so the first landing
 * after sign-up settles into the real list instead of replacing a spinner with it.
 * Mirrors ProjectCard: a 48px avatar beside a title, then a footer row.
 */
export default function ProjectCardListSkeleton(): JSX.Element {
  return (
    <PageContent fullWidth>
      <PageTitle>
        <PageTitle.Header>
          <Skeleton variant="text" width={140} />
        </PageTitle.Header>
      </PageTitle>

      <Grid container spacing={2} aria-busy="true" aria-label="Loading projects">
        {Array.from({ length: CARD_COUNT }, (_, i) => (
          <Grid key={i} size={{ xs: 12, sm: 6, md: 4 }}>
            <Card>
              <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 2.5 }}>
                <Skeleton variant="rounded" width={48} height={48} />
                <Skeleton variant="text" width="55%" />
              </CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ px: 2.5, pb: 2 }}>
                <Skeleton variant="text" width={90} />
                <Skeleton variant="circular" width={20} height={20} />
              </Stack>
            </Card>
          </Grid>
        ))}
      </Grid>
    </PageContent>
  );
}
