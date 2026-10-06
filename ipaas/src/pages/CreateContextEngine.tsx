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

import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, PageContent, PageTitle, Stack, Typography } from '@wso2/oxygen-ui';
import { ArrowLeft } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useMemo, useReducer, useState, type JSX } from 'react';
import { useAppNavigate } from '../hooks/useAppNavigate';
import { useRoles } from '../hooks/useAuth';
import { isContextEngineEnabled, useContextEngineDraft, useCreateContextEngine, useUploadAudience } from '../hooks/useContextEngine';
import { EVERYONE_VISIBILITY } from '../constants/contextEngine';
import { checkStagedFile, engineDescriptionError, engineMessage, engineNameError, isFormDirty, modelsStepBlocker, sourcesStepBlocker, storageStepBlocker, toCreateInput, visibilityTags, withSourceVisibilityRules } from '../utils/contextEngine';
import { contextEngineUrl, contextEnginesUrl } from '../paths';
import { HttpError } from '../types/http';
import ComingSoon from './ComingSoon';
import VerticalStepper from '../components/VerticalStepper';
import SourcesStep from '../components/ContextEngine/steps/SourcesStep';
import AccessStep from '../components/ContextEngine/steps/AccessStep';
import ModelsStep from '../components/ContextEngine/steps/ModelsStep';
import StorageStep from '../components/ContextEngine/steps/StorageStep';
import ReviewStep from '../components/ContextEngine/steps/ReviewStep';
import SetupProgress, { type SetupUploadSource } from '../components/ContextEngine/files/SetupProgress';
import { rememberSourceRules, startUploads } from '../hooks/contextUploads';
import { dropStagedFile, getStagedFile } from '../utils/stagedFiles';
import { contextEngineFormReducer, initialContextEngineForm } from '../components/ContextEngine/formReducer';
import type { OrgScope } from '../nav';

const STEP_LABELS = ['Choose Sources', 'Grant Access', 'Configure Models', 'Configure Storage', 'Name & Create'];
const LAST_STEP = STEP_LABELS.length - 1;

/** Passed to the detail page so it can show which steps the engine could not complete yet. */
export interface CreateContextEngineLocationState {
  warnings?: string[];
  /** A File Upload source to open the Files drawer for on arrival. */
  openFiles?: string;
}

interface SetupState {
  id: string;
  name: string;
  warnings: string[];
  uploads: SetupUploadSource[];
  sourceCount: number;
  roleCount: number;
}

export default function CreateContextEngine(scope: OrgScope): JSX.Element {
  const navigate = useAppNavigate();
  const draft = useContextEngineDraft(scope.org);
  const { save: saveDraft, clear: clearDraft } = draft;
  // Restore a draft from this session, if there is one; secrets were never stored and must be re-entered.
  const [restored] = useState(() => draft.restore() !== null);
  const [form, dispatch] = useReducer(contextEngineFormReducer, undefined, () => draft.restore() ?? initialContextEngineForm);
  const [activeStep, setActiveStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // Set once the engine exists and staged files are being handed to it; the steps give way to the setup card.
  const [setup, setSetup] = useState<SetupState | null>(null);
  const [showRestored, setShowRestored] = useState(restored);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const create = useCreateContextEngine();
  const { data: orgRoles } = useRoles(scope.org);
  const roleNames = useMemo(() => Object.fromEntries((orgRoles ?? []).map((r) => [r.roleId, r.roleName])), [orgRoles]);
  // The roles "everyone who can query" stands for when files are shared, and the creator's groups for the review's checks.
  const { everyone, myGroups } = useUploadAudience(scope.org, form.roles);
  const base = contextEnginesUrl(scope.org);
  const dirty = isFormDirty(form);

  // Mirror the form into session storage so leaving the wizard loses nothing but secrets.
  useEffect(() => {
    if (create.isSuccess) return;
    if (dirty) saveDraft(form);
    else clearDraft();
  }, [form, dirty, create.isSuccess, saveDraft, clearDraft]);

  if (!isContextEngineEnabled()) {
    return <ComingSoon title="Coming Soon" description="Context Engines are currently under development." />;
  }

  // Why each step's Next is disabled — shown beside the button so the user never guesses.
  const stepBlocker: (string | null)[] = [
    sourcesStepBlocker(form.sources),
    null,
    modelsStepBlocker(form),
    storageStepBlocker(form.storage),
    !form.name.trim() ? 'Enter a name for the engine' : engineNameError(form.name) || engineDescriptionError(form.description) || null,
  ];
  const stepValid = stepBlocker.map((b) => b === null);
  const canCreate = stepValid.every(Boolean);

  const leave = (discard: boolean) => {
    if (discard) draft.clear();
    setLeaveOpen(false);
    navigate(base);
  };

  const submit = () => {
    if (!canCreate || create.isPending) return;
    setError(null);
    // Each source's visibility becomes audience rules now that the query roles are known.
    const withRules = withSourceVisibilityRules(form.sources, everyone);
    create.mutate(toCreateInput({ ...form, sources: withRules }), {
      onSuccess: ({ id, sources, warnings }) => {
        draft.clear();
        const uploads: SetupUploadSource[] = [];
        for (const source of withRules) {
          const sourceId = sources[source.name.trim()];
          if (!sourceId) continue;
          rememberSourceRules(sourceId, source.audience ?? []);
          const staged = source.staged ?? [];
          if (source.type !== 'upload' || staged.length === 0) continue;
          const files = staged.flatMap((m) => {
            const content = getStagedFile(m.id);
            return content && !checkStagedFile(m, []).problem ? [{ content, name: m.name, size: m.size, contentType: m.contentType }] : [];
          });
          staged.forEach((m) => dropStagedFile(m.id));
          if (files.length === 0) continue;
          const visibility = source.stagedVisibility ?? EVERYONE_VISIBILITY;
          startUploads(id, sourceId, files, visibility, visibilityTags(visibility, everyone));
          uploads.push({ sourceId, name: source.name.trim() });
        }
        if (uploads.length === 0) {
          navigate(contextEngineUrl(scope.org, id), { state: { warnings } satisfies CreateContextEngineLocationState });
          return;
        }
        setSetup({ id, name: form.name.trim(), warnings, uploads, sourceCount: form.sources.length, roleCount: form.roles.length });
      },
      onError: (e) => {
        if (e instanceof HttpError && e.status === 409) setError('A context engine with this name already exists.');
        else if (e instanceof HttpError && e.status === 401) setError('The context engine rejected the credential. Check the engine token in runtime config.');
        else if (e instanceof HttpError && e.status === 403) setError("You don't have permission to create context engines. Ask an engine administrator for the space.manage action.");
        else if (e instanceof HttpError) setError(`Couldn't create the context engine: ${engineMessage(e)}`);
        else setError("Couldn't create the context engine. Please try again.");
      },
    });
  };

  return (
    <PageContent>
      <Button startIcon={<ArrowLeft size={16} />} onClick={() => (dirty && !setup ? setLeaveOpen(true) : navigate(base))} sx={{ mb: 2 }}>
        Back to context engines
      </Button>
      <PageTitle>
        <PageTitle.Header>Create Context Engine</PageTitle.Header>
      </PageTitle>

      {setup ? (
        <Box sx={{ mt: 3 }}>
          <SetupProgress
            engineId={setup.id}
            engineName={setup.name}
            sourceCount={setup.sourceCount}
            roleCount={setup.roleCount}
            warnings={setup.warnings}
            uploads={setup.uploads}
            onOpen={() => navigate(contextEngineUrl(scope.org, setup.id), { state: { warnings: setup.warnings, openFiles: setup.uploads[0]?.sourceId } satisfies CreateContextEngineLocationState })}
          />
        </Box>
      ) : (
        <Stack direction="row" gap={4} alignItems="flex-start" sx={{ mt: 3 }}>
          <Box sx={{ width: { xs: '100%', md: 240 }, flexShrink: 0, pt: 1 }}>
            <VerticalStepper activeStep={activeStep} steps={STEP_LABELS} onStepClick={setActiveStep} />
          </Box>
          <Box sx={{ flex: 1, maxWidth: activeStep === 3 ? 1080 : 960, mt: 2 }}>
            {showRestored && (
              <Alert severity="info" variant="outlined" onClose={() => setShowRestored(false)} sx={{ mb: 3 }}>
                We restored the draft you left in this session. API keys and tokens are never stored, so re-enter them before creating.
              </Alert>
            )}

            {error && (
              <Alert severity="error" variant="outlined" onClose={() => setError(null)} sx={{ mb: 3 }}>
                {error}
              </Alert>
            )}

            {activeStep === 0 && (
              <SourcesStep
                orgHandle={scope.org}
                sources={form.sources}
                onAdd={(source) => dispatch({ type: 'addSource', source })}
                onUpdate={(index, source) => dispatch({ type: 'updateSource', index, source })}
                onRemove={(index) => dispatch({ type: 'removeSource', index })}
                roleNames={roleNames}
              />
            )}
            {activeStep === 1 && <AccessStep orgHandle={scope.org} roles={form.roles} onChange={(value) => dispatch({ type: 'roles', value })} />}
            {activeStep === 2 && (
              <ModelsStep
                embedding={form.embedding}
                llm={form.llm}
                shareApiKey={form.shareApiKey}
                onEmbeddingChange={(value) => dispatch({ type: 'embedding', value })}
                onLlmChange={(value) => dispatch({ type: 'llm', value })}
                onShareApiKeyChange={(value) => dispatch({ type: 'shareApiKey', value })}
              />
            )}
            {activeStep === 3 && <StorageStep orgHandle={scope.org} storage={form.storage} onChange={(kind, value) => dispatch({ type: 'storage', kind, value })} />}
            {activeStep === 4 && (
              <ReviewStep
                form={form}
                roleNames={roleNames}
                everyone={everyone}
                myGroups={myGroups}
                draftSavedAt={draft.savedAt}
                onNameChange={(value) => dispatch({ type: 'name', value })}
                onDescriptionChange={(value) => dispatch({ type: 'description', value })}
                onEdit={setActiveStep}
              />
            )}

            <Stack direction="row" alignItems="center" gap={1.5} sx={{ mt: 4 }}>
              <Button variant="outlined" disabled={create.isPending} onClick={activeStep === 0 ? () => (dirty ? setLeaveOpen(true) : navigate(base)) : () => setActiveStep((s) => Math.max(0, s - 1))}>
                {activeStep === 0 ? 'Cancel' : 'Back'}
              </Button>
              {activeStep < LAST_STEP ? (
                <Button variant="contained" disabled={!stepValid[activeStep]} onClick={() => setActiveStep((s) => Math.min(LAST_STEP, s + 1))}>
                  Next
                </Button>
              ) : (
                <Button variant="contained" disabled={!canCreate || create.isPending} startIcon={create.isPending ? <CircularProgress size={16} color="inherit" /> : undefined} onClick={submit}>
                  {create.isPending ? 'Creating…' : 'Create Context Engine'}
                </Button>
              )}
              {stepBlocker[activeStep] && (
                <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
                  {stepBlocker[activeStep]}
                </Typography>
              )}
            </Stack>
          </Box>
        </Stack>
      )}

      <Dialog open={leaveOpen} onClose={() => setLeaveOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Leave without creating?</DialogTitle>
        <DialogContent>
          <DialogContentText>Your sources, roles and model choices are kept as a draft for this browser session. API keys and tokens are not stored and will need re-entering.</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLeaveOpen(false)}>Stay</Button>
          <Button color="error" onClick={() => leave(true)}>
            Discard draft
          </Button>
          <Button variant="contained" onClick={() => leave(false)}>
            Keep draft and leave
          </Button>
        </DialogActions>
      </Dialog>
    </PageContent>
  );
}
