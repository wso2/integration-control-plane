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

import { MenuItem, Stack, Typography } from '@wso2/oxygen-ui';
import TextField from '../../common/TextField';
import { type JSX } from 'react';
import { CHUNKING_STRATEGIES } from '../../../constants/ragIngestion';
import { fieldStackSx, stepHeadingSx } from '../styles';
import type { ChunkingConfig, ChunkingStrategy } from '../../../types/ragIngestion';

interface ChunkingStepProps {
  value: ChunkingConfig;
  onChange: (value: ChunkingConfig) => void;
}

/** Parse a numeric field, treating empty/NaN as 0 so validation flags it. */
const num = (raw: string): number => {
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
};

export default function ChunkingStep({ value, onChange }: ChunkingStepProps): JSX.Element {
  const overlapError = value.maxOverlapSize >= value.maxSegmentSize ? 'Overlap must be smaller than the segment size.' : '';
  return (
    <>
      <Typography variant="subtitle2" sx={stepHeadingSx}>
        Configure Chunking
      </Typography>
      <Stack sx={fieldStackSx}>
        <TextField select label="Chunking strategy" fullWidth size="small" value={value.strategy} onChange={(e) => onChange({ ...value, strategy: e.target.value as ChunkingStrategy })}>
          {CHUNKING_STRATEGIES.map((s) => (
            <MenuItem key={s.value} value={s.value}>
              {s.label}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          label="Max segment size"
          fullWidth
          size="small"
          type="number"
          value={value.maxSegmentSize}
          onChange={(e) => onChange({ ...value, maxSegmentSize: num(e.target.value) })}
          error={value.maxSegmentSize <= 0}
          helperText={value.maxSegmentSize <= 0 ? 'Must be greater than 0.' : undefined}
        />
        <TextField label="Max overlap size" fullWidth size="small" type="number" value={value.maxOverlapSize} onChange={(e) => onChange({ ...value, maxOverlapSize: num(e.target.value) })} error={!!overlapError} helperText={overlapError || undefined} />
      </Stack>
    </>
  );
}
