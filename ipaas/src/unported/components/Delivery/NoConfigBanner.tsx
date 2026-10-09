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

import { Box, Button, Stack, Typography } from '@wso2/oxygen-ui';
import { SlidersHorizontal } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';

/** "Start configuring here" banner shown while no incident source is configured —
 * Change Failure Rate and Mean Time to Recovery need one (Devant's NoConfigView). */
export default function NoConfigBanner({ onConfigure }: { onConfigure: () => void }): JSX.Element {
  return (
    <Box sx={{ bgcolor: 'action.hover', borderRadius: 2, py: 5, px: 3 }}>
      <Stack alignItems="center" gap={1}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          Change Failure Rate and Mean Time to Recovery
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Start configuring here
        </Typography>
        <Button variant="contained" size="small" startIcon={<SlidersHorizontal size={16} />} onClick={onConfigure} sx={{ mt: 1 }}>
          Configure
        </Button>
      </Stack>
    </Box>
  );
}
