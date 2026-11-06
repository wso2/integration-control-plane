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

/**
 * Placeholder for the Integration Overview while its component record resolves, so a
 * freshly created integration holds the layout instead of flashing the project page.
 */
export default function IntegrationOverviewSkeleton(): JSX.Element {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <PageContent fullWidth>
        {/* Header: icon + name/type on the left, action rows on the right. */}
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={2} sx={{ mb: 3 }}>
          <Stack direction="row" alignItems="center" gap={2}>
            <Skeleton variant="rounded" width={48} height={48} />
            <Stack gap={0.75}>
              <Skeleton variant="text" width={220} height={28} />
              <Skeleton variant="text" width={140} height={18} />
            </Stack>
          </Stack>
          <Stack gap={1} alignItems="flex-end">
            <Skeleton variant="text" width={130} height={18} />
            <Skeleton variant="rounded" width={90} height={26} />
          </Stack>
        </Stack>

        {/* Latest build card */}
        <Skeleton variant="rounded" height={96} sx={{ mb: 3 }} />

        {/* Environment card */}
        <Skeleton variant="rounded" height={220} />
      </PageContent>
    </Box>
  );
}
