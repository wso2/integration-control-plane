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

import { Alert, Box, Button, Chip, CircularProgress, ColorSchemeImage, Drawer, FormControlLabel, IconButton, Radio, RadioGroup, Stack, Typography } from '@wso2/oxygen-ui';
import { Info, Lock, X } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import { useUpdateContextModels } from '../../../hooks/useContextEngine';
import { useUnsavedChanges } from '../../../contexts/UnsavedChangesContext';
import { blankLlm, CONTEXT_EMBEDDING_PROVIDERS, contextLogoUrl, EMBEDDING_LOGO_DARK, LLM_PROVIDERS } from '../../../constants/contextEngine';
import { engineMessage, isModelProviderUnavailable, modelProviderName, modelsDraftErrors, modelsDraftOf, modelsUpdate } from '../../../utils/contextEngine';
import { HttpError } from '../../../types/http';
import SecretField from '../../common/SecretField';
import ModelProviderColumn, { type ProviderOption } from '../steps/ModelProviderColumn';
import { drawerBodySx, drawerFooterSx, drawerHeaderSx, filesDrawerSx, modelColumnSx, mutedSx } from '../styles';
import type { ContextEngineModels, ContextModelSummary, LlmConfig, LlmProvider, ModelsDraft } from '../../../types/contextEngine';

interface EditModelsDrawerProps {
  engineId: string;
  models: ContextEngineModels & { llm: ContextModelSummary };
  /** The engine writes answers, so its answer model can be chosen. */
  answersEnabled: boolean;
  /** Open on the embedding model's key field, to replace the key. */
  focusEmbeddingKey?: boolean;
  open: boolean;
  onClose: () => void;
}

const LLM_OPTIONS: ProviderOption[] = LLM_PROVIDERS.map((p) => ({ id: p.id, name: p.name, logo: contextLogoUrl(p.logo), logoDark: p.logoDark && contextLogoUrl(p.logoDark), models: p.models, unavailable: isModelProviderUnavailable(p.id) }));

const KEEP_KEY_TEXT = 'Leave empty to keep the current key';

const lockRowSx = { p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1 } as const;
const infoIconStyle = { marginTop: 2, flexShrink: 0 } as const;
const footerSx = { ...drawerFooterSx, flexDirection: 'column' } as const;

/** Why the save failed, in words. */
function saveFailure(e: Error): { title: string; body: string } {
  if (e instanceof HttpError && e.status === 403) return { title: "You can't change this engine's models", body: 'Changing models needs the manage permission on this engine.' };
  return { title: "Couldn't save the models", body: engineMessage(e, 'Please try again.') };
}

const focusKeyField = (el: HTMLElement | null): void => {
  if (!el) return;
  el.scrollIntoView({ block: 'center' });
  el.querySelector('input')?.focus();
};

/** A provider's blank config, or the current model when the current provider is picked again. */
const blankFor =
  (current: ContextModelSummary | null | undefined) =>
  (id: string): LlmConfig =>
    current?.provider === id ? { ...blankLlm(id as LlmProvider), model: current.model } : blankLlm(id as LlmProvider);

/**
 * Change a running engine's language models and their keys, laid out as the create wizard lays them
 * out. An empty key keeps the stored one. The embedding model is shown but never changes: every
 * stored vector came from it. Saving restarts the engine.
 */
export default function EditModelsDrawer({ engineId, models, answersEnabled, focusEmbeddingKey = false, open, onClose }: EditModelsDrawerProps): JSX.Element {
  const [draft, setDraft] = useState<ModelsDraft>(() => modelsDraftOf(models));
  const save = useUpdateContextModels(engineId);
  const errors = modelsDraftErrors(models, draft, answersEnabled);
  const update = modelsUpdate(models, draft, answersEnabled);
  const allowLeave = useUnsavedChanges(open && !!update && !save.isSuccess);
  const canSave = !!update && !errors.llm && !errors.answer && !save.isPending;
  const failure = save.error ? saveFailure(save.error) : null;
  const embedding = models.embedding;
  const embeddingProvider = CONTEXT_EMBEDDING_PROVIDERS.find((p) => p.id === embedding?.provider);
  const canShareKey = embedding?.provider === draft.llm.provider;
  const keyShared = canShareKey && draft.shareKey;
  const set = (patch: Partial<ModelsDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const close = () => {
    allowLeave();
    onClose();
  };
  const submit = () => {
    if (update) save.mutate(update, { onSuccess: close });
  };

  return (
    <Drawer anchor="right" open={open} onClose={save.isPending ? undefined : close} variant="temporary" sx={filesDrawerSx} disableAutoFocus={focusEmbeddingKey}>
      <Box sx={drawerHeaderSx}>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          Change models
        </Typography>
        <IconButton size="small" aria-label="Close" onClick={close} disabled={save.isPending}>
          <X size={18} />
        </IconButton>
      </Box>

      <Box sx={drawerBodySx}>
        {failure && (
          <Alert severity="error" variant="outlined">
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {failure.title}
            </Typography>
            {failure.body}
          </Alert>
        )}

        <Box sx={modelColumnSx}>
          <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={2}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              Embedding model
            </Typography>
            <Chip size="small" variant="outlined" icon={<Lock size={13} />} label="Locked" />
          </Stack>
          <Stack direction="row" alignItems="center" gap={1.5} sx={lockRowSx}>
            {embeddingProvider && <ColorSchemeImage src={{ light: contextLogoUrl(embeddingProvider.logo), dark: contextLogoUrl(EMBEDDING_LOGO_DARK[embeddingProvider.id] ?? embeddingProvider.logo) }} alt="" width={28} height={28} />}
            <Box sx={{ flex: 1 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {embedding ? modelProviderName('embedding', embedding.provider) : 'Engine default'}
              </Typography>
              {embedding && (
                <Typography variant="caption" sx={mutedSx}>
                  {[embedding.model, embedding.dimensions ? `${embedding.dimensions} dimensions` : ''].filter(Boolean).join(' · ')}
                </Typography>
              )}
            </Box>
          </Stack>
          <Stack direction="row" gap={1} sx={mutedSx}>
            <Info size={16} aria-hidden style={infoIconStyle} />
            <Typography variant="body2">The embedding model can&apos;t change.</Typography>
          </Stack>
          <Box ref={focusEmbeddingKey ? focusKeyField : undefined}>
            <SecretField label="API Key" value={draft.embeddingKey} onChange={(embeddingKey) => set({ embeddingKey })} helperText={KEEP_KEY_TEXT} error={keyShared ? errors.llm : undefined} />
          </Box>
        </Box>

        <ModelProviderColumn<LlmConfig>
          title="Ingestion language model"
          purpose={answersEnabled && draft.answerChoice === 'same' ? 'Builds the graph and writes answers.' : 'Builds the graph.'}
          providers={LLM_OPTIONS}
          value={draft.llm}
          onChange={(llm) => set({ llm })}
          blank={blankFor(models.llm)}
          modelLabel="Ingestion language model"
          shareKey={{ available: canShareKey, checked: draft.shareKey, onChange: (shareKey) => set({ shareKey }) }}
          keyHelperText={KEEP_KEY_TEXT}
          keyError={keyShared ? undefined : errors.llm}
        />

        {answersEnabled && (
          <ModelProviderColumn<LlmConfig>
            key={draft.answerChoice}
            title="Answer language model"
            purpose="Writes the cited answers."
            providers={LLM_OPTIONS}
            value={draft.answer}
            onChange={(answer) => set({ answer })}
            blank={blankFor(models.answer)}
            modelLabel="Answer language model"
            showProviders={draft.answerChoice === 'different'}
            keyHelperText={KEEP_KEY_TEXT}
            keyError={errors.answer}
            choice={
              <RadioGroup value={draft.answerChoice} onChange={(_e, value) => set({ answerChoice: value as ModelsDraft['answerChoice'] })} aria-label="Answer language model">
                <FormControlLabel value="same" control={<Radio size="small" />} label={<Typography variant="body2">Same as the ingestion model</Typography>} />
                <FormControlLabel value="different" control={<Radio size="small" />} label={<Typography variant="body2">A different model</Typography>} />
              </RadioGroup>
            }
          />
        )}
      </Box>

      <Box sx={footerSx}>
        <Alert severity="warning">Saving restarts the engine. Queries fail for about a minute.</Alert>
        <Stack direction="row" gap={1.5} justifyContent="flex-end">
          <Button variant="outlined" onClick={close} disabled={save.isPending}>
            Cancel
          </Button>
          <Button variant="contained" disabled={!canSave} startIcon={save.isPending ? <CircularProgress size={14} color="inherit" /> : undefined} onClick={submit}>
            {save.isPending ? 'Saving…' : 'Save and restart'}
          </Button>
        </Stack>
      </Box>
    </Drawer>
  );
}
