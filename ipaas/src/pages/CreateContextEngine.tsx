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

import { Alert, Box, Button, CircularProgress, PageContent, PageTitle, Stack } from '@wso2/oxygen-ui';
import { ArrowLeft } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useMemo, useReducer, useRef, useState, type JSX } from 'react';
import { useAppNavigate } from '../hooks/useAppNavigate';
import { useCan } from '../hooks/useCan';
import { Scopes } from '../constants/permissions';
import { useUnsavedChanges } from '../contexts/UnsavedChangesContext';
import { useRoles } from '../hooks/useAuth';
import { isContextEngineEnabled, useCreateContextEngine, useUploadAudience } from '../hooks/useContextEngine';
import {
  answerChoice,
  checkStagedFile,
  effectiveVisibility,
  engineMessage,
  integrationTypeFor,
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
import { stageEngineSources, type StagedEngineSource } from '../hooks/stagedEngineSources';
import { dropStagedFile, getStagedFile } from '../utils/stagedFiles';
import { contextEngineFormReducer, initialContextEngineForm } from '../components/ContextEngine/formReducer';
import type { ContextSourceConfig } from '../types/contextEngine';
import { wrapSx } from '../components/ContextEngine/styles';
import type { OrgScope } from '../nav';

// 'Grant Access' step hidden for now; access is granted after creation from the Access tab. Restore it (and the commented blocks below) to bring the step back.
const STEP_LABELS = ['Define engine', 'Choose sources', /* 'Grant access', */ 'Configure models', 'Configure storage', 'Review & create'];
const LAST_STEP = STEP_LABELS.length - 1;
const MODELS_STEP = STEP_LABELS.indexOf('Configure models');
const STORAGE_STEP = STEP_LABELS.indexOf('Configure storage');

/** The sources the engine serves itself, with their staged files, which this tab hands to the engine once it runs. */
function stagedEngineSources(sources: ContextSourceConfig[], everyone: string[]): StagedEngineSource[] {
  return sources
    .filter((source) => integrationTypeFor(source.type) === null)
    .map((source) => {
      const staged = source.staged ?? [];
      const files = staged.flatMap((m) => {
        const content = getStagedFile(m.id);
        return content && !checkStagedFile(m, []).problem ? [{ content, name: m.name, size: m.size, contentType: m.contentType }] : [];
      });
      staged.forEach((m) => dropStagedFile(m.id));
      const visibility = effectiveVisibility(source.stagedVisibility);
      return { source, files, visibility, audience: visibilityTags(visibility, everyone) };
    });
}

export default function CreateContextEngine(scope: OrgScope): JSX.Element {
  const navigate = useAppNavigate();
  const canManage = useCan()(Scopes.CONFIG_MANAGE);
  const [form, dispatch] = useReducer(contextEngineFormReducer, initialContextEngineForm);
  const [activeStep, setActiveStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const create = useCreateContextEngine();
  const { data: orgRoles } = useRoles(scope.org);
  const roleNames = useMemo(() => Object.fromEntries((orgRoles ?? []).map((r) => [r.roleId, r.roleName])), [orgRoles]);
  // The roles "everyone who can query" stands for when files are shared; the creator's groups are unknown until the engine runs.
  const { everyone, myGroups } = useUploadAudience(scope.org, form.roles, null);
  const base = contextEnginesUrl(scope.org);
  const dirty = isFormDirty(form);
  // Like the app's other create wizards, ask before leaving a filled-in form; nothing is kept once it is left.
  const allowLeave = useUnsavedChanges(dirty && !create.isSuccess);
  // Staged files live outside the form, so they are released when the wizard is left before creating.
  const formRef = useRef(form);
  formRef.current = form;
  const createdRef = useRef(false);
  createdRef.current = create.isSuccess;
  useEffect(
    () => () => {
      if (!createdRef.current) formRef.current.sources.forEach((s) => (s.staged ?? []).forEach((m) => dropStagedFile(m.id)));
    },
    [],
  );

  if (!isContextEngineEnabled()) {
    return <ComingSoon title="Coming Soon" description="Context Engines are currently under development." />;
  }

  // What still blocks each step; a step's Next is enabled once its entry is null.
  const setupBlockers: (string | null)[] = [
    nameStepBlocker(form.name, form.description),
    sourcesStepBlocker(form.sources),
    // null, — 'Grant Access' step hidden
    modelsStepBlocker(form),
    storageStepBlocker(form.storage),
  ];
  // The review step itself asks for nothing, so Create shows the first step still incomplete.
  const stepBlocker = [...setupBlockers, setupBlockers.find((b) => b !== null) ?? null];
  const stepValid = stepBlocker.map((b) => b === null);
  const canCreate = stepValid.every(Boolean);

  const submit = () => {
    if (!canCreate || create.isPending) return;
    setError(null);
    // Each source's visibility becomes audience rules now that the query roles are known.
    const withRules = withSourceVisibilityRules(form.sources, everyone);
    create.mutate(toCreateInput({ ...form, sources: withRules }), {
      onSuccess: (engine) => {
        stageEngineSources(engine.id, stagedEngineSources(withRules, everyone));
        allowLeave();
        navigate(contextEngineUrl(scope.org, engine.id));
      },
      onError: (e) => {
        if (e instanceof HttpError && e.status === 409) setError(`Couldn't create the context engine: ${engineMessage(e, 'the name is taken')}`);
        else if (e instanceof HttpError && e.status === 403) setError("You don't have permission to create context engines in this organization.");
        else if (e instanceof HttpError && e.status === 402) setError(`Couldn't create the context engine: ${engineMessage(e, 'your plan has no room for another engine')}`);
        else if (e instanceof HttpError) setError(`Couldn't create the context engine: ${engineMessage(e)}`);
        else setError("Couldn't create the context engine. Please try again.");
      },
    });
  };

  return (
    <PageContent sx={wrapSx}>
      <Button startIcon={<ArrowLeft size={16} />} disabled={create.isPending} onClick={() => navigate(base)} sx={{ mb: 2 }}>
        Back to context engines
      </Button>
      <PageTitle>
        <PageTitle.Header>Create Context Engine</PageTitle.Header>
      </PageTitle>

      {!canManage ? (
        <Alert severity="info" variant="outlined" sx={{ mt: 3 }}>
          Your role can&apos;t create context engines.
        </Alert>
      ) : (
        <Stack direction="row" gap={4} alignItems="flex-start" sx={{ mt: 3 }}>
          <Box sx={{ width: { xs: '100%', md: 240 }, flexShrink: 0, pt: 1 }}>
            <VerticalStepper activeStep={activeStep} steps={STEP_LABELS} onStepClick={setActiveStep} />
          </Box>
          <Box sx={{ flex: 1, maxWidth: activeStep === MODELS_STEP || activeStep === STORAGE_STEP ? 1080 : 960, mt: 2 }}>
            {error && (
              <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 3 }}>
                {error}
              </Alert>
            )}

            {activeStep === 0 && <NameStep name={form.name} description={form.description} onNameChange={(value) => dispatch({ type: 'name', value })} onDescriptionChange={(value) => dispatch({ type: 'description', value })} />}
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
            {activeStep === 4 && <ReviewStep form={form} roleNames={roleNames} everyone={everyone} myGroups={myGroups} onEdit={setActiveStep} />}

            <Stack direction="row" alignItems="center" gap={1.5} sx={{ mt: 4 }}>
              <Button variant="outlined" disabled={create.isPending} onClick={
                  activeStep === 0
                    ? () => {
                        allowLeave();
                        navigate(base);
                      }
                    : () => setActiveStep((s) => Math.max(0, s - 1))
                }>
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
    </PageContent>
  );
}
