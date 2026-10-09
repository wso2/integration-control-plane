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
import { CONNECTION_IMAGES } from '../../constants/connections';

/** Empty-state hero for the Connections page. Mirrors Devant's NoConnectionsBanner. */
export default function NoConnectionsBanner({ onCreate }: { onCreate?: () => void }): JSX.Element {
  return (
    <Stack direction={{ xs: 'column', md: 'row' }} alignItems="center" justifyContent="start" gap={7} sx={{ pb: 6 }}>
      <Stack gap={1.5} sx={{ maxWidth: 420 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          Connect to services, databases and more
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Create connections to securely consume in-platform services, third-party APIs, databases and storage from your integrations — with credentials managed per environment.
        </Typography>
        {onCreate && (
          <Box>
            <Button variant="contained" startIcon={<Plus size={20} />} onClick={onCreate} sx={{ mt: 1 }}>
              Create Connection
            </Button>
          </Box>
        )}
      </Stack>
      <Box component="img" src={CONNECTION_IMAGES.banner} alt="Connections" sx={{ width: '100%', maxWidth: 920, height: 'auto' }} />
    </Stack>
  );
}
