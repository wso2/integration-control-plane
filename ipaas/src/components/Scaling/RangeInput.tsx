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

import { Box, IconButton, Stack, Typography, TextField } from '@wso2/oxygen-ui';
import { Minus, Plus } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';

interface RangeInputProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  disabled?: boolean;
}

/** A numeric field flanked by −/+ steppers (Devant's RangeInput). */
export default function RangeInput({ label, value, onChange, min, max, disabled }: RangeInputProps): JSX.Element {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const set = (v: number) => onChange(clamp(v));

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
        {label}
      </Typography>
      <Stack direction="row" alignItems="center" sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, width: 'fit-content' }}>
        <IconButton size="small" aria-label={`Decrease ${label}`} disabled={disabled || value <= min} onClick={() => set(value - 1)} sx={{ borderRadius: 0 }}>
          <Minus size={16} />
        </IconButton>
        <TextField
          value={value}
          onChange={(e) => {
            const n = parseInt(e.target.value, 10);
            if (!Number.isNaN(n)) set(n);
          }}
          disabled={disabled}
          size="small"
          inputProps={{ inputMode: 'numeric', style: { textAlign: 'center', width: 56 }, 'aria-label': label }}
          sx={{ '& fieldset': { border: 'none' } }}
        />
        <IconButton size="small" aria-label={`Increase ${label}`} disabled={disabled || value >= max} onClick={() => set(value + 1)} sx={{ borderRadius: 0 }}>
          <Plus size={16} />
        </IconButton>
      </Stack>
    </Box>
  );
}
