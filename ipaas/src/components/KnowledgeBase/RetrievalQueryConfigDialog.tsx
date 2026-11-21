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

import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Link, Stack, TextField } from '@wso2/oxygen-ui';
import { useState, type JSX } from 'react';
import { DEFAULT_RETRIEVAL_QUERY, MAX_RETRIEVE_CHUNKS } from '../../constants/ragIngestion';
import { retrievalSettingsErrors, type RetrievalSettings } from '../../utils/knowledgeBase';

interface RetrievalQueryConfigDialogProps {
  value: RetrievalSettings;
  onApply: (value: RetrievalSettings) => void;
  onClose: () => void;
}

/** How many chunks a retrieval test returns, and how similar to the query each must be. Mounted only while open. */
export default function RetrievalQueryConfigDialog({ value, onApply, onClose }: RetrievalQueryConfigDialogProps): JSX.Element {
  // Kept as typed so a field can be cleared while editing.
  const [maxChunks, setMaxChunks] = useState(String(value.maxChunks));
  const [minSimilarity, setMinSimilarity] = useState(String(value.minSimilarity));
  const parsed: RetrievalSettings = { maxChunks: maxChunks.trim() === '' ? Number.NaN : Number(maxChunks), minSimilarity: minSimilarity.trim() === '' ? Number.NaN : Number(minSimilarity) };
  const errors = retrievalSettingsErrors(parsed);
  const valid = Object.keys(errors).length === 0;

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Query configurations</DialogTitle>
      <DialogContent>
        <Stack gap={2.5} sx={{ pt: 1 }}>
          <TextField
            label="Maximum chunks to retrieve"
            type="number"
            value={maxChunks}
            onChange={(e) => setMaxChunks(e.target.value)}
            error={!!errors.maxChunks}
            helperText={errors.maxChunks ?? `From 1 to ${MAX_RETRIEVE_CHUNKS}.`}
            slotProps={{ htmlInput: { min: 1, max: MAX_RETRIEVE_CHUNKS, step: 1 } }}
            fullWidth
          />
          <TextField
            label="Minimum similarity threshold"
            type="number"
            value={minSimilarity}
            onChange={(e) => setMinSimilarity(e.target.value)}
            error={!!errors.minSimilarity}
            helperText={errors.minSimilarity ?? 'From 0 to 1. A lower threshold returns more, less relevant chunks.'}
            slotProps={{ htmlInput: { min: 0, max: 1, step: 0.05 } }}
            fullWidth
          />
          <Link
            component="button"
            variant="body2"
            underline="hover"
            sx={{ alignSelf: 'flex-start' }}
            onClick={() => {
              setMaxChunks(String(DEFAULT_RETRIEVAL_QUERY.maxChunks));
              setMinSimilarity(String(DEFAULT_RETRIEVAL_QUERY.minSimilarity));
            }}>
            Reset to defaults
          </Link>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="contained" disabled={!valid} onClick={() => onApply(parsed)}>
          Apply
        </Button>
      </DialogActions>
    </Dialog>
  );
}
