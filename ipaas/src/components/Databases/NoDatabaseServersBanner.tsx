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
import { Database, Plus } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';

const bannerSx = { maxWidth: 720, mx: 'auto', pb: 6 } as const;
const iconSx = { width: 96, height: 96, borderRadius: '50%', bgcolor: 'action.hover', display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 3, color: 'text.secondary' } as const;

/** Empty state for the Platform Services page. */
export default function NoDatabaseServersBanner({ onCreate }: { onCreate: () => void }): JSX.Element {
  return (
    <Stack alignItems="center" textAlign="center" sx={bannerSx}>
      <Box sx={iconSx}>
        <Database size={44} />
      </Box>
      <Typography variant="h6" component="h2" sx={{ fontWeight: 700, mb: 1 }}>
        Create fully-managed platform services
      </Typography>
      <Typography variant="body2" color="text.secondary">
        No services have been created yet. Create one and connect your integrations to it.
      </Typography>
      <Button variant="contained" startIcon={<Plus size={20} />} onClick={onCreate} sx={{ mt: 3 }}>
        Create
      </Button>
    </Stack>
  );
}
