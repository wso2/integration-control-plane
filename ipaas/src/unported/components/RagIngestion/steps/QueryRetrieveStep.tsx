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

import { Box, FormControlLabel, ListingTable, Stack, Switch, Typography } from '@wso2/oxygen-ui';
import TextField from '../../../../components/common/TextField';
import { useEffect, useState, type JSX } from 'react';
import { MAX_RETRIEVE_CHUNKS } from '../../../../constants/ragIngestion';
import { REQUIRED_FIELD_SX } from '../../../../constants/styles';
import SecretField from '../SecretField';
import { fieldStackSx, stepHeadingSx } from '../styles';
import type { RetrievalQuery, RetrievedChunk } from '../../../../types/ragIngestion';

interface QueryRetrieveStepProps {
  value: RetrievalQuery;
  onChange: (value: RetrievalQuery) => void;
  /** Results of the last retrieval (empty until a query runs). */
  chunks: RetrievedChunk[];
  /** True once a retrieval has completed (to distinguish "no results" from "not run"). */
  hasQueried: boolean;
}

const clampNumber = (raw: string, min: number, max: number, fallback: number): number => {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

export default function QueryRetrieveStep({ value, onChange, chunks, hasQueried }: QueryRetrieveStepProps): JSX.Element {
  // Edit the numeric fields as free text and only clamp/commit on blur, so
  // clearing a field to retype doesn't immediately snap it to the minimum.
  const [maxChunksInput, setMaxChunksInput] = useState(String(value.maxChunks));
  const [minSimilarityInput, setMinSimilarityInput] = useState(String(value.minSimilarity));
  useEffect(() => setMaxChunksInput(String(value.maxChunks)), [value.maxChunks]);
  useEffect(() => setMinSimilarityInput(String(value.minSimilarity)), [value.minSimilarity]);

  return (
    <>
      <Typography variant="subtitle2" sx={stepHeadingSx}>
        Query &amp; Retrieve
      </Typography>
      <Stack sx={fieldStackSx}>
        <TextField
          label="Query"
          required
          fullWidth
          size="small"
          multiline
          minRows={2}
          value={value.userQuery}
          placeholder="Enter a question to retrieve relevant chunks"
          onChange={(e) => onChange({ ...value, userQuery: e.target.value })}
          sx={REQUIRED_FIELD_SX}
        />
        <TextField
          label="Max chunks"
          fullWidth
          size="small"
          type="number"
          value={maxChunksInput}
          onChange={(e) => setMaxChunksInput(e.target.value)}
          onBlur={() => {
            const clamped = clampNumber(maxChunksInput, 1, MAX_RETRIEVE_CHUNKS, 5);
            setMaxChunksInput(String(clamped));
            onChange({ ...value, maxChunks: clamped });
          }}
          helperText={`1–${MAX_RETRIEVE_CHUNKS}`}
        />
        <TextField
          label="Min similarity threshold"
          fullWidth
          size="small"
          type="number"
          value={minSimilarityInput}
          onChange={(e) => setMinSimilarityInput(e.target.value)}
          onBlur={() => {
            const clamped = clampNumber(minSimilarityInput, 0, 1, 0.7);
            setMinSimilarityInput(String(clamped));
            onChange({ ...value, minSimilarity: clamped });
          }}
          inputProps={{ step: 0.1, min: 0, max: 1 }}
          helperText="0–1"
        />
        <FormControlLabel control={<Switch checked={value.rerankingEnabled} onChange={(e) => onChange({ ...value, rerankingEnabled: e.target.checked })} />} label="Enable reranking" />
        {value.rerankingEnabled && (
          <>
            <SecretField label="Cohere API Key" required value={value.rerankerApiKey} onChange={(v) => onChange({ ...value, rerankerApiKey: v })} />
            <TextField label="Reranker Model" fullWidth size="small" value={value.rerankerModel} onChange={(e) => onChange({ ...value, rerankerModel: e.target.value })} />
          </>
        )}
      </Stack>

      {hasQueried && (
        <Box sx={{ mt: 4 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5 }}>
            Retrieved chunks ({chunks.length})
          </Typography>
          {chunks.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No matching chunks were found for this query.
            </Typography>
          ) : (
            <ListingTable.Container elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
              <ListingTable size="small">
                <ListingTable.Head>
                  <ListingTable.Row>
                    <ListingTable.Cell>Source</ListingTable.Cell>
                    <ListingTable.Cell>Text</ListingTable.Cell>
                  </ListingTable.Row>
                </ListingTable.Head>
                <ListingTable.Body>
                  {chunks.map((c, i) => (
                    <ListingTable.Row key={`${c.source}-${i}`}>
                      <ListingTable.Cell>
                        <Typography variant="caption" sx={{ wordBreak: 'break-word' }}>
                          {c.source}
                        </Typography>
                      </ListingTable.Cell>
                      <ListingTable.Cell>
                        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                          {c.text}
                        </Typography>
                      </ListingTable.Cell>
                    </ListingTable.Row>
                  ))}
                </ListingTable.Body>
              </ListingTable>
            </ListingTable.Container>
          )}
        </Box>
      )}
    </>
  );
}
