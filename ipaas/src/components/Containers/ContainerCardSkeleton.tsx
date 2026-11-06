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

import { Grid, Paper, Skeleton, Stack } from '@wso2/oxygen-ui';
import type { JSX } from 'react';

const cardSx = { p: 3, mb: 2 } as const;

/** One resource slider's placeholder: the label and readout row, then the track. */
function ResourceSliderSkeleton(): JSX.Element {
  return (
    <Stack gap={1}>
      <Stack direction="row" justifyContent="space-between">
        <Skeleton variant="text" width="45%" />
        <Skeleton variant="text" width="20%" />
      </Stack>
      <Skeleton variant="rounded" height={6} />
    </Stack>
  );
}

/**
 * A container card's shape while it loads: the name and type chip, the last-updated line, the image
 * and its chips, and the CPU and memory sliders. It sits where ContainerInfoCard will, so the page
 * does not shift when the card arrives.
 */
export default function ContainerCardSkeleton(): JSX.Element {
  return (
    <Paper variant="outlined" sx={cardSx} aria-busy="true" aria-label="Loading container">
      <Stack direction="row" alignItems="center" gap={1.5} sx={{ mb: 1 }}>
        <Skeleton variant="text" width={140} height={32} />
        <Skeleton variant="rounded" width={110} height={24} />
      </Stack>
      <Skeleton variant="text" width={160} sx={{ mb: 2.5 }} />

      <Grid container spacing={4}>
        <Grid size={{ xs: 12, md: 5 }}>
          <Skeleton variant="text" width="85%" />
          <Stack direction="row" gap={1} sx={{ mt: 1.5 }}>
            <Skeleton variant="rounded" width={170} height={24} />
            <Skeleton variant="rounded" width={80} height={24} />
          </Stack>
        </Grid>
        <Grid size={{ xs: 12, md: 7 }}>
          <Grid container spacing={3}>
            <Grid size={{ xs: 12, md: 6 }}>
              <ResourceSliderSkeleton />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <ResourceSliderSkeleton />
            </Grid>
          </Grid>
        </Grid>
      </Grid>
    </Paper>
  );
}
