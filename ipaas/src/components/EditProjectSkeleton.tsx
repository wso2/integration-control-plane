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

import { Grid, PageContent, Skeleton } from '@wso2/oxygen-ui';
import type { JSX } from 'react';

/** Mirrors the Edit Project form: back button, title and the three fields. */
export default function EditProjectSkeleton(): JSX.Element {
  return (
    <PageContent fullWidth sx={{ pt: 5 }} aria-busy="true" aria-label="Loading project">
      <Skeleton variant="rounded" width={80} height={32} sx={{ mb: 2 }} />
      <Skeleton variant="text" width={280} height={48} sx={{ mb: 4 }} />
      <Grid container columnSpacing={3} rowSpacing={1}>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <Skeleton variant="rounded" height={56} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 4 }}>
          <Skeleton variant="rounded" height={56} />
        </Grid>
        <Grid size={{ xs: 12, md: 8 }}>
          <Skeleton variant="rounded" height={56} />
        </Grid>
      </Grid>
    </PageContent>
  );
}
