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

import { Box, Chip, Grid, Link, Stack, TextField, Typography } from '@wso2/oxygen-ui';
import { Check, Pencil } from '@wso2/oxygen-ui-icons-react';
import type { JSX, ReactNode } from 'react';
import { CONTEXT_ENGINE_DESCRIPTION_MAX, CONTEXT_ENGINE_NAME_MAX, LLM_PROVIDERS } from '../../../constants/contextEngine';
import { EMBEDDING_PROVIDERS } from '../../../constants/ragIngestion';
import { REQUIRED_FIELD_SX } from '../../../constants/styles';
import { engineDescriptionError, engineNameError, sourceTypeName, summarizeSource } from '../../../utils/contextEngine';
import { formatDistanceToNow } from '../../../utils/time';
import SourceMark from '../SourceMark';
import { fieldStackSx, mutedSx, stepHeadingSx, stepHintSx, summaryCardHeaderSx, summaryCardSx, summaryRowSx } from '../styles';
import type { ContextEngineForm } from '../../../types/contextEngine';

/** Wizard step indexes the summary cards can jump back to. */
export type EditableStep = 0 | 1 | 2;

interface ReviewStepProps {
  form: ContextEngineForm;
  /** Role handle → display name, for the access summary. */
  roleNames: Record<string, string>;
  /** When the draft was last written to session storage, if at all. */
  draftSavedAt: string | null;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onEdit: (step: EditableStep) => void;
}

function SummaryCard({ title, editLabel, onEdit, children }: { title: string; editLabel: string; onEdit: () => void; children: ReactNode }): JSX.Element {
  return (
    <Box sx={summaryCardSx}>
      <Box sx={summaryCardHeaderSx}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          {title}
        </Typography>
        <Link component="button" type="button" variant="body2" onClick={onEdit} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }} aria-label={`Edit ${editLabel}`}>
          <Pencil size={13} />
          Edit
        </Link>
      </Box>
      {children}
    </Box>
  );
}

/** Step 4 — name the engine and confirm what will be created; every card jumps back to its step. */
export default function ReviewStep({ form, roleNames, draftSavedAt, onNameChange, onDescriptionChange, onEdit }: ReviewStepProps): JSX.Element {
  const nameError = engineNameError(form.name);
  const descriptionError = engineDescriptionError(form.description);
  const embeddingName = EMBEDDING_PROVIDERS.find((p) => p.id === form.embedding?.provider)?.name ?? form.embedding?.provider ?? '—';
  const llmName = LLM_PROVIDERS.find((p) => p.id === form.llm?.provider)?.name ?? form.llm?.provider ?? '—';
  const n = form.sources.length;
  const r = form.roles.length;

  return (
    <>
      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={2}>
        <Box>
          <Typography variant="subtitle2" sx={stepHeadingSx}>
            Name &amp; Create
          </Typography>
          <Typography variant="body2" sx={stepHintSx}>
            Give the engine a name your team will recognise, then confirm the setup. Anything below can be changed without walking back through the steps.
          </Typography>
        </Box>
        {draftSavedAt && <Chip size="small" variant="outlined" icon={<Check size={14} />} label={`Draft saved · ${formatDistanceToNow(draftSavedAt).toLowerCase()}`} sx={{ flexShrink: 0 }} />}
      </Stack>

      <Stack sx={{ ...fieldStackSx, mb: 4 }}>
        <TextField
          label="Name"
          required
          fullWidth
          size="small"
          autoFocus
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
          <SummaryCard title={`Sources (${n})`} editLabel="sources" onEdit={() => onEdit(0)}>
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
                <Chip size="small" variant="outlined" label={sourceTypeName(s.type)} sx={{ flexShrink: 0 }} />
              </Box>
            ))}
          </SummaryCard>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <SummaryCard title="Who can query" editLabel="access" onEdit={() => onEdit(1)}>
            {r === 0 ? (
              <Typography variant="body2" sx={mutedSx}>
                Only you. Grant roles later from the Access tab.
              </Typography>
            ) : (
              <>
                <Stack direction="row" flexWrap="wrap" gap={1}>
                  {form.roles.map((role) => (
                    <Chip key={role} size="small" label={roleNames[role] ?? role} />
                  ))}
                </Stack>
                <Typography variant="caption" sx={{ ...mutedSx, display: 'block', mt: 1.5 }}>
                  They can ask questions, open evidence and see traces. You keep full access as the owner.
                </Typography>
              </>
            )}
          </SummaryCard>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <SummaryCard title="Models" editLabel="models" onEdit={() => onEdit(2)}>
            <Stack direction="row" gap={4}>
              <Box>
                <Typography variant="caption" sx={mutedSx}>
                  Embedding
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  {embeddingName}
                </Typography>
                <Typography variant="caption" sx={mutedSx}>
                  {form.embedding?.model || '—'}
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" sx={mutedSx}>
                  Language model
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  {llmName}
                </Typography>
                <Typography variant="caption" sx={mutedSx}>
                  {form.llm?.model || '—'}
                  {form.shareApiKey && form.llm && form.embedding?.provider === form.llm.provider ? ' · shares the embedding key' : ''}
                </Typography>
              </Box>
            </Stack>
          </SummaryCard>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Box sx={{ ...summaryCardSx, borderColor: 'primary.light' }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
              What happens when you create
            </Typography>
            <Stack gap={0.75}>
              <Typography variant="body2">
                {n} source{n === 1 ? '' : 's'} {n === 1 ? 'is' : 'are'} registered and {n === 1 ? 'its' : 'their'} credentials stored on the engine.
              </Typography>
              <Typography variant="body2">{r === 0 ? 'No roles are granted yet; only you can query.' : `${r} role${r === 1 ? '' : 's'} ${r === 1 ? 'is' : 'are'} granted query access.`}</Typography>
              <Typography variant="body2">You start the first graph build from the Overview; it usually takes a few minutes.</Typography>
            </Stack>
          </Box>
        </Grid>
      </Grid>
    </>
  );
}
