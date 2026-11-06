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

import { Box, Stack, Typography } from '@wso2/oxygen-ui';
import { Clock } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';

const panelSx = { border: '1px dashed', borderColor: 'divider', borderRadius: 1, py: 6, px: 3, textAlign: 'center' } as const;
const iconSx = { color: 'text.disabled', display: 'flex', justifyContent: 'center' } as const;

/** Stands in for a database tab whose feature the provider does not offer yet. */
export default function UnavailablePanel({ title, description }: { title: string; description: string }): JSX.Element {
  return (
    <Stack alignItems="center" gap={1} sx={panelSx}>
      <Box sx={iconSx}>
        <Clock size={36} />
      </Box>
      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
        {title}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 520 }}>
        {description}
      </Typography>
    </Stack>
  );
}
