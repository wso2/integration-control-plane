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

import { Box, Chip, Grid, Stack, TextField, Typography } from '@wso2/oxygen-ui';
import type { JSX, ReactNode } from 'react';
import { CONTEXT_ENGINE_DESCRIPTION_MAX, CONTEXT_ENGINE_NAME_MAX, LLM_PROVIDERS } from '../../../constants/contextEngine';
import { EMBEDDING_PROVIDERS } from '../../../constants/ragIngestion';
import { REQUIRED_FIELD_SX } from '../../../constants/styles';
import { engineDescriptionError, engineNameError, sourceTypeName, summarizeSource } from '../../../utils/contextEngine';
import SourceMark from '../SourceMark';
import { fieldStackSx, mutedSx, stepHeadingSx, stepHintSx, summaryCardHeaderSx, summaryCardSx, summaryRowSx } from '../styles';
import type { ContextEngineForm } from '../../../types/contextEngine';

interface ReviewStepProps {
  form: ContextEngineForm;
  /** Role handle → display name, for the access summary. */
  roleNames: Record<string, string>;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
}

function SummaryCard({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <Box sx={summaryCardSx}>
      <Box sx={summaryCardHeaderSx}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          {title}
        </Typography>
      </Box>
      {children}
    </Box>
  );
}

/** Step 4 — name the engine and confirm what will be created. */
export default function ReviewStep({ form, roleNames, onNameChange, onDescriptionChange }: ReviewStepProps): JSX.Element {
  const nameError = engineNameError(form.name);
  const descriptionError = engineDescriptionError(form.description);
  const embeddingName = EMBEDDING_PROVIDERS.find((p) => p.id === form.embedding?.provider)?.name ?? form.embedding?.provider ?? '—';
  const llmName = LLM_PROVIDERS.find((p) => p.id === form.llm?.provider)?.name ?? form.llm?.provider ?? '—';

  return (
    <>
      <Typography variant="subtitle2" sx={stepHeadingSx}>
        Name &amp; Create
      </Typography>
      <Typography variant="body2" sx={stepHintSx}>
        Give the engine a name your team will recognise, then review the setup below.
      </Typography>

      <Stack sx={{ ...fieldStackSx, mb: 4 }}>
        <TextField
          label="Name"
          required
          fullWidth
          size="small"
          value={form.name}
          error={!!nameError}
          helperText={nameError || `${form.name.length}/${CONTEXT_ENGINE_NAME_MAX}`}
          onChange={(e) => onNameChange(e.target.value)}
          sx={REQUIRED_FIELD_SX}
          inputProps={{ 'aria-label': 'Engine name' }}
        />
        <TextField
          label="Description"
          fullWidth
          multiline
          minRows={2}
          size="small"
          value={form.description}
          error={!!descriptionError}
          helperText={descriptionError || `${form.description.length}/${CONTEXT_ENGINE_DESCRIPTION_MAX}`}
          onChange={(e) => onDescriptionChange(e.target.value)}
        />
      </Stack>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <SummaryCard title={`Sources (${form.sources.length})`}>
            {form.sources.map((s, i) => (
              <Box key={`${s.type}-${i}`} sx={summaryRowSx}>
                <Stack direction="row" alignItems="center" gap={1.5} sx={{ minWidth: 0 }}>
                  <SourceMark type={s.type} size={18} />
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 500 }} noWrap>
                      {s.name}
                    </Typography>
                    <Typography variant="caption" sx={mutedSx} noWrap>
                      {summarizeSource(s)}
                    </Typography>
                  </Box>
                </Stack>
                <Chip size="small" variant="outlined" label={sourceTypeName(s.type)} />
              </Box>
            ))}
          </SummaryCard>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <SummaryCard title="Who can query">
            {form.roles.length === 0 ? (
              <Typography variant="body2" sx={mutedSx}>
                Only you. Grant roles later from the Access tab.
              </Typography>
            ) : (
              <Stack direction="row" flexWrap="wrap" gap={1}>
                {form.roles.map((r) => (
                  <Chip key={r} size="small" label={roleNames[r] ?? r} />
                ))}
              </Stack>
            )}
          </SummaryCard>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <SummaryCard title="Embedding model">
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              {embeddingName}
            </Typography>
            <Typography variant="caption" sx={mutedSx}>
              {form.embedding?.model || '—'}
            </Typography>
          </SummaryCard>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <SummaryCard title="Language model">
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              {llmName}
            </Typography>
            <Typography variant="caption" sx={mutedSx}>
              {form.llm?.model || '—'}
            </Typography>
          </SummaryCard>
        </Grid>
      </Grid>
    </>
  );
}
