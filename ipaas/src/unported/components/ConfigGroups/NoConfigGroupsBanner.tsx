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
import { Plus } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';

const BANNER_SRC = `${import.meta.env.BASE_URL}assets/images/config-group-banner.svg`;

/** Empty-state hero for the Config Groups page. Mirrors Devant's NoConfigGroupsBanner (acrylic-orange banner). */
export default function NoConfigGroupsBanner({ onCreate }: { onCreate: () => void }): JSX.Element {
  return (
    <Stack direction={{ xs: 'column', md: 'row' }} alignItems="center" justifyContent="start" gap={7} sx={{ pb: 6 }}>
      <Stack gap={1.5} sx={{ maxWidth: 420 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          Manage configurations effortlessly
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Create configuration groups to manage reusable keys and secrets across your environments, then share them with your integrations.
        </Typography>
        <Box>
          <Button variant="contained" startIcon={<Plus size={20} />} onClick={onCreate} sx={{ mt: 1 }}>
            Create Configuration Group
          </Button>
        </Box>
      </Stack>
      <Box component="img" src={BANNER_SRC} alt="Configuration groups" sx={{ width: '100%', maxWidth: 720, height: 'auto' }} />
    </Stack>
  );
}
