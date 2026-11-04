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
import { AgentStep, LiveKitStep, SttStep, TtsStep, TuningStep, type VoiceAgentStepProps } from '../components/VoiceAgent/VoiceAgentSteps';
import { useLeaveGuard, useUnsavedChanges } from '../contexts/UnsavedChangesContext';
import { useAppNavigate } from '../hooks/useAppNavigate';
import { useProjectByHandler } from '../hooks/useProjects';
import { useCreateVoiceAgent } from '../hooks/useVoiceAgents';
import { narrow, newComponentUrl, resourceUrl, type ProjectScope } from '../nav';
import type { VoiceAgentSettings } from '../types/voiceAgent';
import PageNotFound from './PageNotFound';
import { DEFAULT_VOICE_AGENT_SETTINGS, validateAgentStep, validateLiveKitStep, validateSttStep, validateTtsStep, validateTuningStep, type StepErrors } from '../utils/voiceAgent';

interface WizardStep {
  label: string;
  description: string;
  Form: ComponentType<VoiceAgentStepProps>;
  validate: (s: VoiceAgentSettings) => StepErrors;
}

const STEPS: WizardStep[] = [
  { label: 'Configure agent', description: 'Name the voice agent and point it at the agent it speaks for.', Form: AgentStep, validate: validateAgentStep },
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
  if (isLoading) return <CreateVoiceAgentSkeleton />;
  if (!project) return <PageNotFound title="Project not found" />;
  return <CreateVoiceAgentWizard scope={scope} projectId={project.id} />;
}

function CreateVoiceAgentWizard({ scope, projectId }: { scope: ProjectScope; projectId: string }): JSX.Element {
  const navigate = useAppNavigate();
  const guardNavigation = useLeaveGuard();
  const create = useCreateVoiceAgent();
  const [settings, setSettings] = useState<VoiceAgentSettings>(DEFAULT_VOICE_AGENT_SETTINGS);
  const [activeStep, setActiveStep] = useState(0);
  // Errors show only after the user tries to leave a step, not while they type into a fresh one.
  const [attempted, setAttempted] = useState<Set<number>>(new Set());
  const allowLeave = useUnsavedChanges(settings !== DEFAULT_VOICE_AGENT_SETTINGS && !create.isSuccess);

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
          navigate(resourceUrl(narrow(scope, component.handler || component.id), 'overview'));
        },
      },
    );
  };

  return (
    <PageContent sx={{ pt: 5 }}>
      <Button startIcon={<ArrowLeft size={16} />} onClick={() => guardNavigation(() => navigate(newComponentUrl(scope)))} sx={{ mb: 3 }} disabled={create.isPending}>
        Back to create an integration
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
          <step.Form settings={settings} errors={visibleErrors} onChange={onChange} onReplace={setSettings} />
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
