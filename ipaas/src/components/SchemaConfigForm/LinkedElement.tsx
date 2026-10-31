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

import { Box, Chip, Stack, Typography } from '@wso2/oxygen-ui';
import { Link2 } from '@wso2/oxygen-ui-icons-react';
import TextField from '../common/TextField';
import type { LinkedSource } from '../../utils/resourceLinks';

const chipSx = { height: 18, fontSize: '0.65rem', borderRadius: 0.75 } as const;

export function LinkedElement({ title, source }: { title: string; source: LinkedSource }) {
  return (
    <Box sx={{ mt: 1.5 }}>
      <Stack direction="row" alignItems="center" gap={0.75} sx={{ mb: 0.5 }}>
        <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
          {title}
        </Typography>
        <Chip icon={<Link2 size={12} />} label="linked" size="small" variant="outlined" color={source.noValuesIn ? 'warning' : 'info'} sx={chipSx} />
      </Stack>
      <TextField
        fullWidth
        size="small"
        disabled
        value={source.noValuesIn ? `from ${source.resource} · no values in ${source.noValuesIn}` : `from ${source.resource}`}
        color={source.noValuesIn ? 'warning' : undefined}
        inputProps={{ 'aria-label': `${title} is supplied by ${source.resource}` }}
      />
    </Box>
  );
}
