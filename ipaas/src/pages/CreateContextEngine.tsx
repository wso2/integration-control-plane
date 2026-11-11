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

import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, IconButton, PageContent, PageTitle, Stack } from '@wso2/oxygen-ui';
import { ArrowLeft, X } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useMemo, useReducer, useRef, useState, type JSX } from 'react';
import { useSearchParams } from 'react-router';
import { useAppNavigate } from '../hooks/useAppNavigate';
import { useRoles } from '../hooks/useAuth';
import { isContextEngineEnabled, useContextEngine, useContextEngineDraft, useCreateContextEngine, useSetUpContextEngine, useUploadAudience } from '../hooks/useContextEngine';
import { useAllEnvironments } from '../hooks/useEnvironments';
import {
  answerChoice,
  selectEnvironment,
  checkStagedFile,
  effectiveVisibility,
  engineMessage,
  isFormDirty,
  modelsStepBlocker,
  nameStepBlocker,
  sourcesStepBlocker,
  storageStepBlocker,
  toCreateInput,
  visibilityTags,
  withSourceVisibilityRules,
} from '../utils/contextEngine';
import { contextEngineUrl, contextEnginesUrl } from '../paths';
import { HttpError } from '../types/http';
import ComingSoon from './ComingSoon';
import VerticalStepper from '../components/VerticalStepper';
import NameStep from '../components/ContextEngine/steps/NameStep';
import SourcesStep from '../components/ContextEngine/steps/SourcesStep';
// import AccessStep from '../components/ContextEngine/steps/AccessStep'; — 'Grant Access' step hidden
import ModelsStep from '../components/ContextEngine/steps/ModelsStep';
import StorageStep from '../components/ContextEngine/steps/StorageStep';
import ReviewStep from '../components/ContextEngine/steps/ReviewStep';
import SetupProgress, { type SetupPhase, type SetupUploadSource } from '../components/ContextEngine/files/SetupProgress';
import { rememberSourceRules, startUploads } from '../hooks/contextUploads';
import { dropStagedFile, getStagedFile } from '../utils/stagedFiles';
import { contextEngineFormReducer, initialContextEngineForm } from '../components/ContextEngine/formReducer';
import type { ContextSourceConfig } from '../types/contextEngine';
import { wrapSx } from '../components/ContextEngine/styles';
import type { OrgScope } from '../nav';

// 'Grant Access' step hidden for now; access is granted after creation from the Access tab. Restore it (and the commented blocks below) to bring the step back.
const STEP_LABELS = ['Define Engine', 'Choose Sources', /* 'Grant Access', */ 'Configure Models', 'Configure Storage', 'Review & Create'];
const LAST_STEP = STEP_LABELS.length - 1;
const MODELS_STEP = STEP_LABELS.indexOf('Configure Models');
const STORAGE_STEP = STEP_LABELS.indexOf('Configure Storage');

/** Passed to the detail page so it can show which steps the engine could not complete yet. */
export interface CreateContextEngineLocationState {
  warnings?: string[];
  /** A File Upload source to open the Files drawer for on arrival. */
  openFiles?: string;
}

/** The engine the wizard created, and what it still has to hand over once the engine runs. */
interface CreatedEngine {
  id: string;
  name: string;
  sources: ContextSourceConfig[];
  roles: string[];
}

interface SetupResult {
  warnings: string[];
  uploads: SetupUploadSource[];
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
  const [created, setCreated] = useState<CreatedEngine | null>(null);
  const [result, setResult] = useState<SetupResult | null>(null);
  const [showRestored, setShowRestored] = useState(restored);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const create = useCreateContextEngine();
  const setUp = useSetUpContextEngine();
  const live = useContextEngine(created?.id ?? '', { pollOnError: true });
  const setupStarted = useRef(false);
  const [params] = useSearchParams();
  const environments = useAllEnvironments();
  const envList = useMemo(() => environments.data ?? [], [environments.data]);
  const [chosenEnv, setChosenEnv] = useState<string | null>(null);
  const environment = selectEnvironment(
    envList.map((e) => e.id),
    chosenEnv,
    params.get('env'),
  );
  const { data: orgRoles } = useRoles(scope.org);
  const roleNames = useMemo(() => Object.fromEntries((orgRoles ?? []).map((r) => [r.roleId, r.roleName])), [orgRoles]);
  // The roles "everyone who can query" stands for when files are shared; the creator's groups are unknown until the engine runs.
  const { everyone, myGroups } = useUploadAudience(scope.org, form.roles, null);
  const base = contextEnginesUrl(scope.org, environment || undefined);
  const dirty = isFormDirty(form);
  const engineState = live.data?.state;
  const phase: SetupPhase = result ? 'done' : engineState === 'failed' ? 'failed' : engineState === 'ready' ? 'setting-up' : 'starting';

  // Mirror the form into session storage so leaving the wizard loses nothing but secrets.
  useEffect(() => {
    if (create.isSuccess) return;
    if (dirty) saveDraft(form);
    else clearDraft();
  }, [form, dirty, create.isSuccess, saveDraft, clearDraft]);

  // The sources, roles and staged files live only in this page until the engine runs.
  const settingUp = !!created && !result && phase !== 'failed';

  // Warn before the tab closes on them.
  useEffect(() => {
    if (!settingUp) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [settingUp]);

  // Once the new engine runs, hand it the creator's grant, the sources and the roles, then the staged files.
  useEffect(() => {
    if (!created || engineState !== 'ready' || setupStarted.current) return;
    setupStarted.current = true;
    setUp.mutate(
      { engineId: created.id, input: { sources: created.sources, roles: created.roles } },
      {
        onSuccess: ({ sources, warnings }) => {
          const uploads: SetupUploadSource[] = [];
          for (const source of created.sources) {
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
            const visibility = effectiveVisibility(source.stagedVisibility);
            startUploads(created.id, sourceId, files, visibility, visibilityTags(visibility, everyone));
            uploads.push({ sourceId, name: source.name.trim() });
          }
          if (uploads.length === 0) {
            navigate(contextEngineUrl(scope.org, created.id), { state: { warnings } satisfies CreateContextEngineLocationState });
            return;
          }
          setResult({ warnings, uploads });
        },
        onError: (e) => setResult({ warnings: [`Set up the engine: ${engineMessage(e, 'the engine refused it')}`], uploads: [] }),
      },
    );
  }, [created, engineState, setUp, everyone, navigate, scope.org]);

  if (!isContextEngineEnabled()) {
    return <ComingSoon title="Coming Soon" description="Context Engines are currently under development." />;
  }

  // What still blocks each step; a step's Next is enabled once its entry is null.
  const setupBlockers: (string | null)[] = [
    nameStepBlocker(form.name, form.description) ?? (environment ? null : 'Choose an environment'),
    sourcesStepBlocker(form.sources),
    // null, — 'Grant Access' step hidden
    modelsStepBlocker(form),
    storageStepBlocker(form.storage),
  ];
  // The review step itself asks for nothing, so Create shows the first step still incomplete.
  const stepBlocker = [...setupBlockers, setupBlockers.find((b) => b !== null) ?? null];
  const stepValid = stepBlocker.map((b) => b === null);
  const canCreate = stepValid.every(Boolean);

  // A restored draft can be thrown away where it comes back, rather than by asking on the way out:
  // every exit keeps the draft, so Back and Cancel leave straight away like any other link.
  const discardDraft = () => {
    draft.clear();
    dispatch({ type: 'reset' });
    setActiveStep(0);
    setShowRestored(false);
  };

  const submit = () => {
    if (!canCreate || create.isPending) return;
    setError(null);
    // Each source's visibility becomes audience rules now that the query roles are known.
    const withRules = withSourceVisibilityRules(form.sources, everyone);
    create.mutate(toCreateInput({ ...form, sources: withRules }, environment), {
      onSuccess: (engine) => {
        draft.clear();
        setCreated({ id: engine.id, name: engine.name, sources: withRules, roles: form.roles });
      },
      onError: (e) => {
        if (e instanceof HttpError && e.status === 409) setError(`Couldn't create the context engine: ${engineMessage(e, 'the name is taken in this environment')}`);
        else if (e instanceof HttpError && e.status === 403) setError("You don't have permission to create context engines in this organization.");
        else if (e instanceof HttpError && e.status === 402) setError(`Couldn't create the context engine: ${engineMessage(e, 'your plan has no room for another engine')}`);
        else if (e instanceof HttpError) setError(`Couldn't create the context engine: ${engineMessage(e)}`);
        else setError("Couldn't create the context engine. Please try again.");
      },
    });
  };

  return (
    <PageContent sx={wrapSx}>
      <Button startIcon={<ArrowLeft size={16} />} onClick={() => (settingUp ? setLeaveOpen(true) : navigate(base))} sx={{ mb: 2 }}>
        Back to context engines
      </Button>
      <PageTitle>
        <PageTitle.Header>Create Context Engine</PageTitle.Header>
      </PageTitle>

      {created ? (
        <Box sx={{ mt: 3 }}>
          <SetupProgress
            engineId={created.id}
            engineName={created.name}
            phase={phase}
            statusUnknown={live.isError}
            sourceCount={created.sources.length}
            roleCount={created.roles.length}
            warnings={result?.warnings ?? []}
            uploads={result?.uploads ?? []}
            onOpen={() => navigate(contextEngineUrl(scope.org, created.id), { state: { warnings: result?.warnings, openFiles: result?.uploads[0]?.sourceId } satisfies CreateContextEngineLocationState })}
          />
        </Box>
      ) : (
        <Stack direction="row" gap={4} alignItems="flex-start" sx={{ mt: 3 }}>
          <Box sx={{ width: { xs: '100%', md: 240 }, flexShrink: 0, pt: 1 }}>
            <VerticalStepper activeStep={activeStep} steps={STEP_LABELS} onStepClick={setActiveStep} />
          </Box>
          <Box sx={{ flex: 1, maxWidth: activeStep === MODELS_STEP || activeStep === STORAGE_STEP ? 1080 : 960, mt: 2 }}>
            {showRestored && (
              <Alert
                severity="info"
                // MUI drops the close button when an action is set, so both sit in the action slot.
                action={
                  <Stack direction="row" alignItems="center" gap={0.5}>
                    <Button color="inherit" size="small" onClick={discardDraft}>
                      Discard draft
                    </Button>
                    <IconButton color="inherit" size="small" aria-label="Close" onClick={() => setShowRestored(false)}>
                      <X size={16} />
                    </IconButton>
                  </Stack>
                }
                sx={{ mb: 3 }}>
                Draft restored. Re-enter API keys and tokens.
              </Alert>
            )}

            {error && (
              <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 3 }}>
                {error}
              </Alert>
            )}

            {activeStep === 0 && (
              <NameStep
                name={form.name}
                description={form.description}
                onNameChange={(value) => dispatch({ type: 'name', value })}
                onDescriptionChange={(value) => dispatch({ type: 'description', value })}
                environments={envList}
                environment={environment}
                onEnvironmentChange={setChosenEnv}
              />
            )}
            {activeStep === 1 && (
              <SourcesStep
                orgHandle={scope.org}
                sources={form.sources}
                onAdd={(source) => dispatch({ type: 'addSource', source })}
                onUpdate={(index, source) => dispatch({ type: 'updateSource', index, source })}
                onRemove={(index) => dispatch({ type: 'removeSource', index })}
                roleNames={roleNames}
              />
            )}
            {/* 'Grant Access' step hidden — restore this branch (as activeStep === 2) and renumber the steps below to bring it back.
            {activeStep === 2 && <AccessStep orgHandle={scope.org} roles={form.roles} onChange={(value) => dispatch({ type: 'roles', value })} />} */}
            {activeStep === 2 && (
              <ModelsStep
                embedding={form.embedding}
                llm={form.llm}
                shareApiKey={form.shareApiKey}
                answerChoice={answerChoice(form)}
                answerLlm={form.answerLlm}
                onEmbeddingChange={(value) => dispatch({ type: 'embedding', value })}
                onLlmChange={(value) => dispatch({ type: 'llm', value })}
                onShareApiKeyChange={(value) => dispatch({ type: 'shareApiKey', value })}
                onAnswerChoiceChange={(value) => dispatch({ type: 'answerChoice', value })}
                onAnswerLlmChange={(value) => dispatch({ type: 'answerLlm', value })}
              />
            )}
            {activeStep === 3 && <StorageStep orgHandle={scope.org} storage={form.storage} onChange={(kind, value) => dispatch({ type: 'storage', kind, value })} />}
            {activeStep === 4 && <ReviewStep form={form} roleNames={roleNames} everyone={everyone} myGroups={myGroups} draftSavedAt={draft.savedAt} onEdit={setActiveStep} />}

            <Stack direction="row" alignItems="center" gap={1.5} sx={{ mt: 4 }}>
              <Button variant="outlined" disabled={create.isPending} onClick={activeStep === 0 ? () => navigate(base) : () => setActiveStep((s) => Math.max(0, s - 1))}>
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
            </Stack>
          </Box>
        </Stack>
      )}

      {/* Only a half set-up engine asks before leaving: a draft is kept anyway, and is discarded from its restore notice. */}
      <Dialog open={leaveOpen && settingUp} onClose={() => setLeaveOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Leave before setup finishes?</DialogTitle>
        <DialogContent>
          <DialogContentText>The engine is created, but its sources and access are not added yet. If you leave, add them from the engine&apos;s page.</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLeaveOpen(false)}>Stay</Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => {
              setLeaveOpen(false);
              navigate(base);
            }}>
            Leave
          </Button>
        </DialogActions>
      </Dialog>
    </PageContent>
  );
}
