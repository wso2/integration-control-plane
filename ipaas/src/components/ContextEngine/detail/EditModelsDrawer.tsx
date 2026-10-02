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

import { Alert, Box, Button, Chip, CircularProgress, Drawer, IconButton, MenuItem, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@wso2/oxygen-ui';
import { Info, Lock, X } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import { useUpdateContextModels } from '../../../hooks/useContextEngine';
import { contextLogoUrl, LLM_AZURE_DEFAULT_API_VERSION, LLM_PROVIDERS } from '../../../constants/contextEngine';
import { AZURE_DEFAULT_API_VERSION, EMBEDDING_PROVIDERS, ragLogoUrl } from '../../../constants/ragIngestion';
import { engineMessage, isSameModel, modelDraftError, toModelInput } from '../../../utils/contextEngine';
import { formatDistanceToNow } from '../../../utils/time';
import { HttpError } from '../../../types/http';
import SelectableCard from '../../Databases/create/SelectableCard';
import SecretField from '../../RagIngestion/SecretField';
import { drawerBodySx, drawerFooterSx, drawerHeaderSx, filesDrawerSx, modelTileGridSx, mutedSx, summaryCardSx } from '../styles';
import type { ContextEngineModels, ContextModelSummary, ModelDraft } from '../../../types/contextEngine';

interface EditModelsDrawerProps {
  engineId: string;
  models: ContextEngineModels;
  open: boolean;
  onClose: () => void;
}

interface ProviderInfo {
  id: string;
  name: string;
  logo: string;
  models: string[];
}

/** Provider tiles with logos resolved against the app base, as the create wizard shows them. */
const EMBEDDING_OPTIONS: ProviderInfo[] = EMBEDDING_PROVIDERS.map((p) => ({ id: p.id, name: p.name, logo: ragLogoUrl(p.logo), models: p.models }));
const LLM_OPTIONS: ProviderInfo[] = LLM_PROVIDERS.map((p) => ({ id: p.id, name: p.name, logo: contextLogoUrl(p.logo), models: p.models }));

const draftOf = (m: ContextModelSummary | null): ModelDraft | null =>
  m ? { provider: m.provider, model: m.model, baseUrl: m.baseUrl ?? '', apiVersion: m.apiVersion ?? '', dimensions: m.dimensions, keyMode: m.keyKind === 'reference' ? 'ref' : 'key', apiKey: '', apiKeyRef: '' } : null;

const blankDraft = (provider: string, kind: 'embedding' | 'llm'): ModelDraft => ({
  provider,
  model: '',
  baseUrl: '',
  apiVersion: provider === 'azure_openai' ? (kind === 'embedding' ? AZURE_DEFAULT_API_VERSION : LLM_AZURE_DEFAULT_API_VERSION) : '',
  keyMode: 'key',
  apiKey: '',
  apiKeyRef: '',
});

const keyKindText = (m: ContextModelSummary | null): string => (m?.keyKind === 'reference' ? 'From a secret reference' : m?.keyKind === 'encrypted' ? 'Stored and encrypted by the engine' : 'Stored by the engine');

function KeyFields({ draft, current, onChange, idPrefix }: { draft: ModelDraft; current: ContextModelSummary | null; onChange: (d: ModelDraft) => void; idPrefix: string }): JSX.Element {
  const unchanged = isSameModel(current, draft);
  return (
    <Stack gap={1.25}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2}>
        <Typography variant="body2" sx={{ fontWeight: 500 }} id={`${idPrefix}-key-label`}>
          API key
        </Typography>
        <ToggleButtonGroup exclusive size="small" value={draft.keyMode} onChange={(_e, mode: ModelDraft['keyMode'] | null) => mode && onChange({ ...draft, keyMode: mode })} aria-labelledby={`${idPrefix}-key-label`}>
          <ToggleButton value="key">Type a key</ToggleButton>
          <ToggleButton value="ref">Key reference</ToggleButton>
        </ToggleButtonGroup>
      </Stack>
      {draft.keyMode === 'key' ? (
        <Box>
          <SecretField label="API key" value={draft.apiKey} placeholder={unchanged ? keyKindText(current) : undefined} onChange={(v) => onChange({ ...draft, apiKey: v })} />
          <Typography variant="caption" sx={{ ...mutedSx, display: 'block', mt: 0.5, ml: 1.75 }}>
            {unchanged ? 'Leave empty to keep it.' : 'A different model needs its own key.'}
          </Typography>
        </Box>
      ) : (
        <TextField
          size="small"
          fullWidth
          label="Reference"
          value={draft.apiKeyRef}
          placeholder={unchanged && current?.keyKind === 'reference' ? 'Leave empty to keep the current reference' : 'env:OPENAI_API_KEY'}
          onChange={(e) => onChange({ ...draft, apiKeyRef: e.target.value })}
          helperText="The engine resolves it each time it calls the model: env:NAME reads a variable from the engine's environment, cp:ID a control plane secret."
          inputProps={{ style: { fontFamily: 'monospace' } }}
        />
      )}
    </Stack>
  );
}

function ModelEditor({ kind, providers, draft, current, onChange }: { kind: 'embedding' | 'llm'; providers: ProviderInfo[]; draft: ModelDraft | null; current: ContextModelSummary | null; onChange: (d: ModelDraft) => void }): JSX.Element {
  const info = providers.find((p) => p.id === draft?.provider);
  return (
    <Stack gap={2}>
      <Box sx={modelTileGridSx}>
        {providers.map((p) => (
          <SelectableCard key={p.id} title={p.name} logo={p.logo} selected={draft?.provider === p.id} onSelect={() => onChange(current?.provider === p.id ? draftOf(current)! : blankDraft(p.id, kind))} />
        ))}
      </Box>
      {draft && (
        <>
          {info && info.models.length > 0 ? (
            <TextField select size="small" fullWidth label="Model" value={draft.model} onChange={(e) => onChange({ ...draft, model: e.target.value })}>
              {!info.models.includes(draft.model) && draft.model && <MenuItem value={draft.model}>{draft.model}</MenuItem>}
              {info.models.map((m) => (
                <MenuItem key={m} value={m}>
                  {m}
                </MenuItem>
              ))}
            </TextField>
          ) : (
            <TextField size="small" fullWidth label="Deployment Id" value={draft.model} onChange={(e) => onChange({ ...draft, model: e.target.value })} />
          )}
          {draft.provider === 'azure_openai' && (
            <>
              <TextField size="small" fullWidth label="Base URL" value={draft.baseUrl} placeholder="https://<resource>.openai.azure.com" onChange={(e) => onChange({ ...draft, baseUrl: e.target.value })} />
              <TextField size="small" fullWidth label="API Version" value={draft.apiVersion} onChange={(e) => onChange({ ...draft, apiVersion: e.target.value })} />
            </>
          )}
          <KeyFields draft={draft} current={current} onChange={onChange} idPrefix={kind} />
        </>
      )}
    </Stack>
  );
}

/** Why the engine refused the save, in words; null when it saved. */
function saveFailure(e: unknown): { title: string; body: string } | null {
  if (!e) return null;
  if (e instanceof HttpError && e.status === 409) return { title: "The embedding model can't change now", body: 'Items were indexed while you edited, which fixes the embedding model. Keep the current one and save again.' };
  if (e instanceof HttpError && e.status === 503) return { title: "This engine can't store typed keys", body: 'It has no secrets key to encrypt them with, so nothing was saved. Use a key reference, or ask whoever runs the engine to set a secrets key.' };
  if (e instanceof HttpError && e.status === 403) return { title: "You can't change this engine's models", body: 'Changing models needs the manage permission on this engine.' };
  return { title: "Couldn't save the models", body: engineMessage(e, 'Please try again.') };
}

/**
 * Change a running engine's models. Both are sent on every save, because the
 * engine drops a model that is left out; one sent without a key keeps its
 * stored key. Once the engine holds indexed items the embedding model is fixed,
 * since stored vectors only match the model that made them, but its key can
 * still be replaced.
 */
export default function EditModelsDrawer({ engineId, models, open, onClose }: EditModelsDrawerProps): JSX.Element {
  const locked = !!models.embeddingLocked;
  const [embedding, setEmbedding] = useState<ModelDraft | null>(() => draftOf(models.embedding));
  const [llm, setLlm] = useState<ModelDraft | null>(() => draftOf(models.llm));
  const save = useUpdateContextModels(engineId);
  const embeddingError = embedding ? modelDraftError(embedding, models.embedding) : '';
  const llmError = llm ? modelDraftError(llm, models.llm) : '';
  const changed = !isSameModel(models.embedding, embedding) || !isSameModel(models.llm, llm) || !!embedding?.apiKey || !!embedding?.apiKeyRef || !!llm?.apiKey || !!llm?.apiKeyRef;
  const canSave = changed && !embeddingError && !llmError && (!!embedding || !!llm) && !save.isPending;
  const failure = saveFailure(save.error);
  const embeddingProvider = EMBEDDING_OPTIONS.find((p) => p.id === models.embedding?.provider);

  const submit = () => save.mutate({ embedding: embedding ? toModelInput(embedding) : null, llm: llm ? toModelInput(llm) : null }, { onSuccess: onClose });

  return (
    <Drawer anchor="right" open={open} onClose={save.isPending ? undefined : onClose} variant="temporary" sx={filesDrawerSx}>
      <Box sx={drawerHeaderSx}>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          Edit models
        </Typography>
        <IconButton size="small" aria-label="Close" onClick={onClose} disabled={save.isPending}>
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
        <Typography variant="body2" sx={mutedSx}>
          The embedding model indexes your sources; the language model writes answers from what it finds.
        </Typography>

        <Box sx={{ ...summaryCardSx, height: 'auto' }}>
          <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={2}>
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                Embedding model
              </Typography>
              <Typography variant="body2" sx={mutedSx}>
                Turns documents into vectors for retrieval.
              </Typography>
            </Box>
            {locked && <Chip size="small" variant="outlined" icon={<Lock size={13} />} label="Locked" />}
          </Stack>
          <Box sx={{ mt: 2 }}>
            {locked ? (
              <Stack gap={1.75}>
                <Stack direction="row" alignItems="center" gap={1.5} sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                  {embeddingProvider && <Box component="img" src={embeddingProvider.logo} alt="" sx={{ width: 28, height: 28 }} />}
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {models.embedding ? (embeddingProvider?.name ?? models.embedding.provider) : 'Engine default'}
                    </Typography>
                    <Typography variant="caption" sx={mutedSx}>
                      {models.embedding ? [models.embedding.model, models.embedding.dimensions ? `${models.embedding.dimensions} dimensions` : ''].filter(Boolean).join(' · ') : 'Set where the engine runs'}
                    </Typography>
                  </Box>
                </Stack>
                <Stack direction="row" gap={1} sx={mutedSx}>
                  <Info size={16} aria-hidden style={{ marginTop: 2, flexShrink: 0 }} />
                  <Typography variant="body2">
                    Locked because this engine already holds indexed items, and their vectors only match this model. Changing it needs a full re-index, which isn&apos;t available yet.{models.embedding ? ' You can still replace its key.' : ''}
                  </Typography>
                </Stack>
                {embedding && <KeyFields draft={embedding} current={models.embedding} onChange={setEmbedding} idPrefix="embedding" />}
              </Stack>
            ) : (
              <ModelEditor kind="embedding" providers={EMBEDDING_OPTIONS} draft={embedding} current={models.embedding} onChange={setEmbedding} />
            )}
            {embeddingError && embedding && (
              <Typography variant="caption" color="error" sx={{ display: 'block', mt: 1 }}>
                {embeddingError}
              </Typography>
            )}
          </Box>
        </Box>

        <Box sx={{ ...summaryCardSx, height: 'auto' }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            Language model
          </Typography>
          <Typography variant="body2" sx={mutedSx}>
            Writes the answer from retrieved evidence.
          </Typography>
          <Box sx={{ mt: 2 }}>
            <ModelEditor kind="llm" providers={LLM_OPTIONS} draft={llm} current={models.llm} onChange={setLlm} />
            {llmError && llm && (
              <Typography variant="caption" color="error" sx={{ display: 'block', mt: 1 }}>
                {llmError}
              </Typography>
            )}
          </Box>
        </Box>
      </Box>

      <Box sx={{ ...drawerFooterSx, justifyContent: 'space-between' }}>
        <Typography variant="caption" sx={mutedSx}>
          {models.updatedAt ? `Last changed ${formatDistanceToNow(models.updatedAt).toLowerCase()}${models.version ? ` · version ${models.version}` : ''}` : ''}
        </Typography>
        <Stack direction="row" gap={1.5}>
          <Button variant="outlined" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button variant="contained" disabled={!canSave} startIcon={save.isPending ? <CircularProgress size={14} color="inherit" /> : undefined} onClick={submit}>
            {save.isPending ? 'Saving…' : 'Save models'}
          </Button>
        </Stack>
      </Box>
    </Drawer>
  );
}
