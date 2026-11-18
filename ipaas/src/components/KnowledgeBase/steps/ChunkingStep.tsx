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

import { Box, MenuItem, Stack, Switch, Typography, TextField } from '@wso2/oxygen-ui';
import { FileText } from '@wso2/oxygen-ui-icons-react';
import { type JSX } from 'react';
import { CHUNKING_STRATEGIES } from '../../../constants/ragIngestion';
import { fieldStackSx, stepHeadingSx } from '../styles';
import type { ChunkingConfig, ChunkingStrategy, ParsingConfig } from '../../../types/ragIngestion';

interface ChunkingStepProps {
  value: ChunkingConfig;
  onChange: (value: ChunkingConfig) => void;
  /** Shows the parsing section when set. */
  parsing?: ParsingConfig;
  onParsingChange?: (value: ParsingConfig) => void;
  /** The knowledge base predates the OCR setting. */
  ocrUnset?: boolean;
}

/** Parse a numeric field, treating empty/NaN as 0 so validation flags it. */
const num = (raw: string): number => {
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
};

export default function ChunkingStep({ value, onChange, parsing, onParsingChange, ocrUnset = false }: ChunkingStepProps): JSX.Element {
  const overlapError = value.maxOverlapSize >= value.maxSegmentSize ? 'Overlap must be smaller than the segment size.' : '';
  return (
    <>
      <Typography variant="subtitle2" sx={stepHeadingSx}>
        Configure Chunking
      </Typography>
      <Stack sx={fieldStackSx}>
        <TextField labelPlacement="top" select label="Chunking strategy" fullWidth size="small" value={value.strategy} onChange={(e) => onChange({ ...value, strategy: e.target.value as ChunkingStrategy })}>
          {CHUNKING_STRATEGIES.map((s) => (
            <MenuItem key={s.value} value={s.value}>
              {s.label}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          labelPlacement="top"
          label="Max segment size"
          fullWidth
          size="small"
          type="number"
          value={value.maxSegmentSize}
          onChange={(e) => onChange({ ...value, maxSegmentSize: num(e.target.value) })}
          error={value.maxSegmentSize <= 0}
          helperText={value.maxSegmentSize <= 0 ? 'Must be greater than 0.' : undefined}
        />
        <TextField
          labelPlacement="top"
          label="Max overlap size"
          fullWidth
          size="small"
          type="number"
          value={value.maxOverlapSize}
          onChange={(e) => onChange({ ...value, maxOverlapSize: num(e.target.value) })}
          error={!!overlapError}
          helperText={overlapError || undefined}
        />
      </Stack>

      {parsing && onParsingChange && (
        <>
          <Typography variant="subtitle2" sx={{ ...stepHeadingSx, mt: 4, mb: 1 }}>
            Configure Parsing
          </Typography>
          <Stack sx={{ ...fieldStackSx, gap: 1.5 }}>
            <Typography variant="body2" color="text.secondary">
              Text in documents is always read. Images are read with OCR, and audio files are transcribed.
            </Typography>
            <Box component="label" sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, p: 2, border: '1px solid', borderColor: parsing.ocrEnabled ? 'primary.main' : 'divider', borderRadius: 1, cursor: 'pointer' }}>
              <Box sx={{ color: 'text.secondary', pt: 0.25 }}>
                <FileText size={20} />
              </Box>
              <Box sx={{ flex: 1 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  Scanned PDFs (OCR)
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Reads the text in scanned PDF pages. Ingestion is slower and needs more memory.
                </Typography>
              </Box>
              <Switch checked={parsing.ocrEnabled} onChange={(e) => onParsingChange({ ...parsing, ocrEnabled: e.target.checked })} inputProps={{ 'aria-label': 'Scanned PDFs (OCR)' }} />
            </Box>
            <Typography variant="caption" color="text.secondary">
              {ocrUnset ? "OCR was never set for this knowledge base, so scanned PDF pages aren't read. Turn it on and save if its sources have scanned PDFs." : 'Applies to every file ingested into this knowledge base, from uploads and every data source.'}
            </Typography>
          </Stack>
        </>
      )}
    </>
  );
}
