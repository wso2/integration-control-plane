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

import { Alert, Box, Button, Chip, Grid, Link, Stack, TextField, Typography } from '@wso2/oxygen-ui';
import { Check, Pencil } from '@wso2/oxygen-ui-icons-react';
import type { JSX, ReactNode } from 'react';
import { CONTEXT_ENGINE_DESCRIPTION_MAX, CONTEXT_ENGINE_NAME_MAX, LLM_PROVIDERS, STORAGE_BACKENDS } from '../../../constants/contextEngine';
import { EMBEDDING_PROVIDERS } from '../../../constants/ragIngestion';
import { REQUIRED_FIELD_SX } from '../../../constants/styles';
import { engineDescriptionError, engineNameError, roleList, sharingMismatches, sourceTypeName, summarizeSource, summarizeSourceVisibility, summarizeStorage } from '../../../utils/contextEngine';
import { formatDistanceToNow } from '../../../utils/time';
import SourceMark from '../SourceMark';
import { fieldStackSx, mutedSx, stepHeadingSx, stepHintSx, summaryCardHeaderSx, summaryCardSx, summaryRowSx } from '../styles';
import type { ContextEngineForm } from '../../../types/contextEngine';

/** Wizard step indexes the summary cards can jump back to (Sources, Models, Storage; 'Grant Access' is hidden). */
export type EditableStep = 0 | 1 | 2;

interface ReviewStepProps {
  form: ContextEngineForm;
  /** Role handle → display name, for the access summary. */
  roleNames: Record<string, string>;
  /** The roles "everyone who can query" stands for, for uploads shared that way. */
  everyone: string[];
  /** The creator's groups, to warn about content they will not see themselves. */
  myGroups: string[];
  /** When the draft was last written to session storage, if at all. */
  draftSavedAt: string | null;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onEdit: (step: EditableStep) => void;
}

function SummaryCard({ title, editLabel, onEdit, children }: { title: string; editLabel?: string; onEdit?: () => void; children: ReactNode }): JSX.Element {
  return (
    <Box sx={summaryCardSx}>
      <Box sx={summaryCardHeaderSx}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          {title}
        </Typography>
        {onEdit && (
          <Link component="button" type="button" variant="body2" onClick={onEdit} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }} aria-label={`Edit ${editLabel}`}>
            <Pencil size={13} />
            Edit
          </Link>
        )}
      </Box>
      {children}
    </Box>
  );
}

/** Step 4 — name the engine and confirm what will be created; every card jumps back to its step. */
export default function ReviewStep({ form, roleNames, everyone, myGroups, draftSavedAt, onNameChange, onDescriptionChange, onEdit }: ReviewStepProps): JSX.Element {
  const nameError = engineNameError(form.name);
  // Query access and visibility are set in different steps; say where they disagree before anything is created.
  const mismatch = sharingMismatches(form.sources, form.roles, everyone, myGroups);
  const descriptionError = engineDescriptionError(form.description);
  const embeddingName = EMBEDDING_PROVIDERS.find((p) => p.id === form.embedding?.provider)?.name ?? form.embedding?.provider ?? '—';
  const llmName = LLM_PROVIDERS.find((p) => p.id === form.llm?.provider)?.name ?? form.llm?.provider ?? '—';
  const n = form.sources.length;

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

      {(mismatch.seeNothing.length > 0 || mismatch.cannotQuery.length > 0 || mismatch.hiddenFromMe.length > 0) && (
        <Stack gap={1.5} sx={{ mb: 2 }}>
          {mismatch.seeNothing.length > 0 && (
            <Alert
              severity="warning"
              variant="outlined"
              action={
                <Button size="small" onClick={() => onEdit(0)}>
                  Edit sources
                </Button>
              }>
              {`${roleList(mismatch.seeNothing, roleNames)} can query, but no source shares content with ${mismatch.seeNothing.length === 1 ? 'it' : 'them'}, so ${mismatch.seeNothing.length === 1 ? 'it gets' : 'they get'} empty answers.`}
            </Alert>
          )}
          {mismatch.cannotQuery.length > 0 && (
            <Alert severity="warning" variant="outlined">
              {`Content is shared with ${roleList(mismatch.cannotQuery, roleNames)}, but ${mismatch.cannotQuery.length === 1 ? 'that role' : 'those roles'} can't query this engine. Grant access later from the Access tab, or the sharing has no effect.`}
            </Alert>
          )}
          {mismatch.hiddenFromMe.length > 0 && (
            <Alert severity="warning" variant="outlined">
              {`You won't see content from ${mismatch.hiddenFromMe.join(', ')} yourself: you aren't in any role ${mismatch.hiddenFromMe.length === 1 ? 'it is' : 'they are'} shared with.`}
            </Alert>
          )}
        </Stack>
      )}

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
                    <Typography variant="caption" sx={{ ...mutedSx, display: 'block' }} noWrap>
                      {summarizeSource(s)}
                    </Typography>
                    <Typography variant="caption" sx={{ ...mutedSx, display: 'block' }} noWrap>
                      Visible to: {summarizeSourceVisibility(s, roleNames)}
                    </Typography>
                  </Box>
                </Stack>
                <Chip size="small" variant="outlined" label={sourceTypeName(s.type)} sx={{ flexShrink: 0 }} />
              </Box>
            ))}
          </SummaryCard>
        </Grid>
        {/* 'Who can query' card hidden for now. 'Grant Access' step is hidden too, so it has no edit link; restore onEdit when the step returns.
        <Grid size={{ xs: 12, md: 6 }}>
          <SummaryCard title="Who can query">
            {form.roles.length === 0 ? (
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
        */}
        <Grid size={{ xs: 12, md: 6 }}>
          <SummaryCard title="Models" editLabel="models" onEdit={() => onEdit(1)}>
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
          <SummaryCard title="Storage" editLabel="storage" onEdit={() => onEdit(2)}>
            <Stack direction="row" gap={3} flexWrap="wrap">
              {STORAGE_BACKENDS.map((b) => {
                const sum = summarizeStorage(b.kind, form.storage[b.kind]);
                return (
                  <Box key={b.kind} sx={{ minWidth: 120 }}>
                    <Typography variant="caption" sx={mutedSx}>
                      {b.title.replace(' database', '')}
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {sum.primary}
                    </Typography>
                    <Typography variant="caption" sx={mutedSx}>
                      {sum.secondary}
                    </Typography>
                  </Box>
                );
              })}
            </Stack>
          </SummaryCard>
        </Grid>
      </Grid>
    </>
  );
}
