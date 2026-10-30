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

import { Box, Skeleton, Stack } from '@wso2/oxygen-ui';
import type { JSX } from 'react';

/** Stands in for the databases table while the list loads. */
export function DatabaseListSkeleton(): JSX.Element {
  return (
    <Stack gap={1} aria-busy="true" aria-label="Loading databases">
      <Skeleton variant="rounded" height={40} />
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} variant="rounded" height={56} />
      ))}
    </Stack>
  );
}

/** Stands in for the database header, tabs and overview card while the database loads. */
export function DatabaseDetailSkeleton(): JSX.Element {
  return (
    <Box aria-busy="true" aria-label="Loading database">
      <Stack direction="row" alignItems="center" gap={2} sx={{ mb: 3 }}>
        <Skeleton variant="rounded" width={40} height={40} />
        <Box>
          <Skeleton variant="text" width={200} height={30} />
          <Skeleton variant="text" width={120} height={18} />
        </Box>
      </Stack>
      <Skeleton variant="rounded" height={44} sx={{ mb: 3 }} />
      <Stack gap={1}>
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} variant="rounded" height={48} />
        ))}
      </Stack>
    </Box>
  );
}

/** Stands in for the plan step of the create wizard while the offering loads. */
export function DatabasePlansSkeleton(): JSX.Element {
  return (
    <Stack direction="row" gap={2} flexWrap="wrap" aria-busy="true" aria-label="Loading service plans">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} variant="rounded" width={240} height={220} />
      ))}
    </Stack>
  );
}
