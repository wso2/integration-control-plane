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

import { Alert, Button, CircularProgress, Grid, PageContent, Skeleton, Stack, Step, StepLabel, Stepper, Typography } from '@wso2/oxygen-ui';
import { ArrowLeft } from '@wso2/oxygen-ui-icons-react';
import { useState, type ComponentType, type JSX } from 'react';
import { useSearchParams } from 'react-router';
import { LiveKitStep, SttStep, TtsStep, TuningStep, type VoiceAgentStepProps } from '../components/VoiceAgent/VoiceAgentSteps';
import VoiceAgentTargetStep from '../components/VoiceAgent/VoiceAgentTargetStep';
import { useLeaveGuard, useUnsavedChanges } from '../contexts/UnsavedChangesContext';
import { useAppNavigate } from '../hooks/useAppNavigate';
import { useActiveProjects, useProjectByHandler } from '../hooks/useProjects';
import { useCreateVoiceAgent } from '../hooks/useVoiceAgents';
import { newComponentUrl, type ProjectScope } from '../nav';
import { componentOverviewUrl, VOICE_TARGET_AGENT_NAME_PARAM, VOICE_TARGET_AGENT_PARAM } from '../paths';
import type { Project } from '../types/project';
import type { VoiceAgentSettings } from '../types/voiceAgent';
import PageNotFound from './PageNotFound';
import { DEFAULT_VOICE_AGENT_SETTINGS, validateAgentStep, validateLiveKitStep, validateSttStep, validateTtsStep, validateTuningStep, type StepErrors } from '../utils/voiceAgent';

interface WizardStep {
  label: string;
  description: string;
  /** Null for the first step, which needs the wizard's project and is rendered by the wizard itself. */
  Form: ComponentType<VoiceAgentStepProps> | null;
  validate: (s: VoiceAgentSettings) => StepErrors;
}

const STEPS: WizardStep[] = [
  { label: 'Configure agent', description: 'Choose which agent this voice agent connects to.', Form: null, validate: validateAgentStep },
  { label: 'Connect LiveKit', description: 'The LiveKit project that carries the calls.', Form: LiveKitStep, validate: validateLiveKitStep },
  { label: 'Speech to text', description: "Transcribes the caller's speech for the agent.", Form: SttStep, validate: validateSttStep },
  { label: 'Text to speech', description: "Speaks the agent's answers.", Form: TtsStep, validate: validateTtsStep },
  { label: 'Tune and deploy', description: 'How the conversation flows. The defaults suit most agents.', Form: TuningStep, validate: validateTuningStep },
];

const STEPPER_SX = { position: 'sticky', top: 24 } as const;

function CreateVoiceAgentSkeleton(): JSX.Element {
  return (
    <PageContent sx={{ pt: 5 }}>
      <Skeleton variant="text" width={240} height={48} />
      <Grid container spacing={4} sx={{ mt: 2 }}>
        <Grid size={{ xs: 12, md: 3 }}>
          <Skeleton variant="rounded" height={260} />
        </Grid>
        <Grid size={{ xs: 12, md: 9 }}>
          <Skeleton variant="rounded" height={320} />
        </Grid>
      </Grid>
    </PageContent>
  );
}

export default function CreateVoiceAgent(scope: ProjectScope): JSX.Element {
  const { data: project, isLoading } = useProjectByHandler(scope.project);
  const { data: projects, isLoading: loadingProjects } = useActiveProjects();
  if (isLoading || loadingProjects) return <CreateVoiceAgentSkeleton />;
  if (!project || !projects) return <PageNotFound title="Project not found" />;
  return <CreateVoiceAgentWizard scope={scope} project={project} projects={projects} />;
}

function CreateVoiceAgentWizard({ scope, project, projects }: { scope: ProjectScope; project: Project; projects: Project[] }): JSX.Element {
  const navigate = useAppNavigate();
  const guardNavigation = useLeaveGuard();
  const create = useCreateVoiceAgent();
  const [params] = useSearchParams();
  // Opened from an AI agent's "Enable voice agents": that agent is the target and stays fixed.
  const lockedAgent = params.get(VOICE_TARGET_AGENT_PARAM);
  const [initialSettings] = useState<VoiceAgentSettings>(() =>
    lockedAgent ? { ...DEFAULT_VOICE_AGENT_SETTINGS, targetMode: 'platform', targetAgentHandler: lockedAgent, displayName: `${params.get(VOICE_TARGET_AGENT_NAME_PARAM) || lockedAgent} - Voice agent` } : DEFAULT_VOICE_AGENT_SETTINGS,
  );
  const [settings, setSettings] = useState<VoiceAgentSettings>(initialSettings);
  const [projectId, setProjectId] = useState(project.id);
  const [activeStep, setActiveStep] = useState(0);
  // Errors show only after the user tries to leave a step, not while they type into a fresh one.
  const [attempted, setAttempted] = useState<Set<number>>(new Set());
  const allowLeave = useUnsavedChanges(settings !== initialSettings && !create.isSuccess);
  const targetProject = projects.find((p) => p.id === projectId) ?? project;

  const step = STEPS[activeStep];
  const stepErrors = step.validate(settings);
  const visibleErrors = attempted.has(activeStep) ? stepErrors : {};
  const isLastStep = activeStep === STEPS.length - 1;

  const onChange = (patch: Partial<VoiceAgentSettings>) => setSettings((prev) => ({ ...prev, ...patch }));

  const next = () => {
    setAttempted((prev) => new Set(prev).add(activeStep));
    if (Object.keys(stepErrors).length > 0) return;
    if (!isLastStep) {
      setActiveStep(activeStep + 1);
      return;
    }
    create.mutate(
      { orgHandler: scope.org, projectId, settings },
      {
        onSuccess: (component) => {
          allowLeave();
          navigate(componentOverviewUrl(scope.org, targetProject.handler, component.handler || component.id));
        },
      },
    );
  };

  return (
    <PageContent sx={{ pt: 5 }}>
      <Button
        startIcon={<ArrowLeft size={16} />}
        onClick={() => guardNavigation(() => navigate(lockedAgent ? componentOverviewUrl(scope.org, project.handler, lockedAgent) : newComponentUrl(scope)))}
        sx={{ mb: 3 }}
        disabled={create.isPending}>
        {lockedAgent ? 'Back to the agent' : 'Back to create an integration'}
      </Button>
      <Typography variant="h1" sx={{ mb: 4 }}>
        Create a voice agent
      </Typography>
      <Grid container spacing={4}>
        <Grid size={{ xs: 12, md: 3 }}>
          <Stepper activeStep={activeStep} orientation="vertical" sx={STEPPER_SX}>
            {STEPS.map((s) => (
              <Step key={s.label}>
                <StepLabel>{s.label}</StepLabel>
              </Step>
            ))}
          </Stepper>
        </Grid>
        <Grid size={{ xs: 12, md: 9 }}>
          <Typography variant="h5" fontWeight={700}>
            {step.label}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            {step.description}
          </Typography>
          {step.Form ? (
            <step.Form settings={settings} errors={visibleErrors} onChange={onChange} onReplace={setSettings} />
          ) : (
            <VoiceAgentTargetStep
              settings={settings}
              errors={visibleErrors}
              onChange={onChange}
              onReplace={setSettings}
              orgHandler={scope.org}
              projects={projects}
              projectId={projectId}
              onProjectChange={setProjectId}
              locked={!!lockedAgent}
            />
          )}
          {create.isError && (
            <Alert severity="error" sx={{ mt: 3, maxWidth: 560 }}>
              {create.error instanceof Error ? create.error.message : 'Could not create the voice agent.'}
            </Alert>
          )}
          <Stack direction="row" gap={1.5} sx={{ mt: 4 }}>
            {activeStep > 0 && (
              <Button variant="outlined" onClick={() => setActiveStep(activeStep - 1)} disabled={create.isPending}>
                Back
              </Button>
            )}
            <Button variant="contained" onClick={next} disabled={create.isPending} startIcon={create.isPending ? <CircularProgress size={16} color="inherit" /> : undefined}>
              {isLastStep ? (create.isPending ? 'Deploying' : 'Deploy voice agent') : 'Next'}
            </Button>
          </Stack>
        </Grid>
      </Grid>
    </PageContent>
  );
}
