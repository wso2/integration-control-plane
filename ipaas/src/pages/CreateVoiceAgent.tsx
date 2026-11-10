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

import { Alert, Button, Grid, PageContent, PageTitle, Skeleton, Stack, Step, StepLabel, Stepper, Typography } from '@wso2/oxygen-ui';
import { ArrowLeft, Mic } from '@wso2/oxygen-ui-icons-react';
import { useState, type ComponentType, type JSX } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { LiveKitStep, SttStep, TtsStep, TuningStep, type VoiceAgentStepProps } from '../components/VoiceAgent/VoiceAgentSteps';
import VoiceAgentTargetStep, { AgentEndpointStatus } from '../components/VoiceAgent/VoiceAgentTargetStep';
import EmptyListing from '../components/EmptyListing';
import IntegrationCreationLoader from '../components/IntegrationCreationLoader';
import { VOICE_AGENT_CREATION_STEPS } from '../constants/integrationCreation';
import { useLeaveGuard, useUnsavedChanges } from '../contexts/UnsavedChangesContext';
import { useAgentVoiceEndpoint } from '../hooks/useAgentVoiceEndpoint';
import { useAppNavigate } from '../hooks/useAppNavigate';
import { useComponentByHandler, useComponents } from '../hooks/useComponents';
import { useActiveProjects, useProjectByHandler } from '../hooks/useProjects';
import { useCreateVoiceAgent, useLinkedVoiceAgents, voicedAgentHandlers } from '../hooks/useVoiceAgents';
import { newComponentUrl, newProjectUrl, type ComponentScope, type OrgScope, type ProjectScope } from '../nav';
import { componentOverviewUrl, createVoiceAgentUrl, enableVoiceAgentUrl, voiceAgentsUrl } from '../paths';
import type { Component } from '../types/component';
import type { Project } from '../types/project';
import type { VoiceAgentSettings } from '../types/voiceAgent';
import PageNotFound from './PageNotFound';
import { isLiveAiAgent } from '../utils/identifyIntegration';
import { DEFAULT_VOICE_AGENT_SETTINGS, validateAgentStep, validateLiveKitStep, validateSttStep, validateTtsStep, validateTuningStep, visibleStepErrors, type StepErrors } from '../utils/voiceAgent';

type StepKey = 'agent' | 'livekit' | 'stt' | 'tts' | 'tune';

interface WizardStep {
  key: StepKey;
  label: string;
  description: string;
  Form: ComponentType<VoiceAgentStepProps> | null;
  validate: (s: VoiceAgentSettings, voicedAgents: ReadonlySet<string>) => StepErrors;
}

const ALL_STEPS: WizardStep[] = [
  { key: 'agent', label: 'Configure agent', description: 'Choose which agent this voice agent should connect to.', Form: null, validate: validateAgentStep },
  { key: 'livekit', label: 'Configure LiveKit', description: 'Provide the LiveKit server credentials used to host real-time voice sessions.', Form: LiveKitStep, validate: validateLiveKitStep },
  { key: 'stt', label: 'Configure speech to text', description: "Choose the provider and model used to transcribe the caller's speech.", Form: SttStep, validate: validateSttStep },
  { key: 'tts', label: 'Configure text to speech', description: 'Choose the provider, model, and voice used to synthesize spoken responses.', Form: TtsStep, validate: validateTtsStep },
  { key: 'tune', label: 'Tune and deploy', description: 'Configure interaction timing, turn detection, and deployment options, then deploy.', Form: TuningStep, validate: validateTuningStep },
];

const STEPPER_SX = { position: 'sticky', top: 24 } as const;
const STATUS_SX = { mb: 3, maxWidth: 720 } as const;
const PAGE_SX = { pt: 5 } as const;
const LOADER_PAGE_SX = { pt: 5, minHeight: '60vh', display: 'flex', flexDirection: 'column' } as const;

type GeneralHandoff = Pick<VoiceAgentSettings, 'displayName' | 'name' | 'description' | 'targetMode' | 'targetAgentHandler' | 'targetAgentWsUrl'> & { projectId: string };

interface HandoffState {
  voiceAgentGeneral?: GeneralHandoff;
  voiceAgentReturn?: GeneralHandoff;
}

const toHandoff = (s: VoiceAgentSettings, projectId: string): GeneralHandoff => ({
  displayName: s.displayName,
  name: s.name,
  description: s.description,
  targetMode: s.targetMode,
  targetAgentHandler: s.targetAgentHandler,
  targetAgentWsUrl: s.targetAgentWsUrl,
  projectId,
});

type WizardMode = 'org' | 'project' | 'agent';

function CreateVoiceAgentSkeleton(): JSX.Element {
  return (
    <PageContent fullWidth sx={PAGE_SX}>
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

function LoadError({ message, onRetry }: { message: string; onRetry: () => void }): JSX.Element {
  return (
    <PageContent fullWidth sx={PAGE_SX}>
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={onRetry}>
            Retry
          </Button>
        }>
        {message}
      </Alert>
    </PageContent>
  );
}

export function CreateVoiceAgentOrg(scope: OrgScope): JSX.Element {
  const navigate = useAppNavigate();
  const { data: projects, isLoading, isError, refetch } = useActiveProjects();
  if (isLoading) return <CreateVoiceAgentSkeleton />;
  if (isError || !projects) return <LoadError message="Could not load your projects." onRetry={() => void refetch()} />;
  if (projects.length === 0) {
    return (
      <PageContent fullWidth sx={PAGE_SX}>
        <EmptyListing
          icon={<Mic size={48} />}
          title="No projects yet"
          description="A voice agent belongs to a project. Create a project, then create the voice agent in it."
          showAction
          actionLabel="Create project"
          onAction={() => navigate(newProjectUrl(scope))}
        />
      </PageContent>
    );
  }
  return <CreateVoiceAgentWizard org={scope.org} mode="org" projects={projects} project={projects[0]} />;
}

export default function CreateVoiceAgent(scope: ProjectScope): JSX.Element {
  const { data: project, isLoading, isError, refetch } = useProjectByHandler(scope.project);
  if (isLoading) return <CreateVoiceAgentSkeleton />;
  if (isError) return <LoadError message="Could not load the project." onRetry={() => void refetch()} />;
  if (!project) return <PageNotFound title="Project not found" />;
  return <CreateVoiceAgentWizard org={scope.org} mode="project" projects={[project]} project={project} />;
}

export function EnableVoiceAgent(scope: ComponentScope): JSX.Element {
  const { data: project, isLoading, isError, refetch } = useProjectByHandler(scope.project);
  if (isLoading) return <CreateVoiceAgentSkeleton />;
  if (isError) return <LoadError message="Could not load the project." onRetry={() => void refetch()} />;
  if (!project) return <PageNotFound title="Project not found" />;
  return <EnableVoiceAgentInProject org={scope.org} project={project} agentHandler={scope.component} />;
}

function EnableVoiceAgentInProject({ org, project, agentHandler }: { org: string; project: Project; agentHandler: string }): JSX.Element {
  const agentQuery = useComponentByHandler(project.id, agentHandler);
  const linked = useLinkedVoiceAgents(org, project.id, agentHandler);
  const { data: agent } = agentQuery;
  if (agentQuery.isLoading || linked.isLoading) return <CreateVoiceAgentSkeleton />;
  if (agentQuery.isError) return <LoadError message="Could not load the AI agent." onRetry={() => void agentQuery.refetch()} />;
  if (!agent) return <PageNotFound title="Integration not found" />;
  if (!isLiveAiAgent(agent)) return <PageNotFound title="Not an AI agent" description="Voice agents can be enabled only for AI agents." actionTo={componentOverviewUrl(org, project.handler, agent.handler)} actionLabel="Back to integration" />;
  if (linked.isError) return <LoadError message="Could not check whether this AI agent already has a voice agent." onRetry={() => void linked.refetch()} />;
  return <CreateVoiceAgentWizard org={org} mode="agent" projects={[project]} project={project} agent={agent} existingVoiceAgent={linked.voiceAgents.at(0)} />;
}

function VoiceAgentAlreadyEnabled({ org, project, agent, voiceAgent }: { org: string; project: Project; agent: Component; voiceAgent: Component }): JSX.Element {
  const navigate = useAppNavigate();
  return (
    <PageContent fullWidth sx={PAGE_SX}>
      <Button startIcon={<ArrowLeft size={16} />} onClick={() => navigate(componentOverviewUrl(org, project.handler, agent.handler))} sx={{ mb: 3 }}>
        Back to AI agent
      </Button>
      <EmptyListing
        icon={<Mic size={48} />}
        title="Voice agent already enabled"
        description={`${agent.displayName || agent.handler} already has the voice agent ${voiceAgent.displayName || voiceAgent.handler}. An AI agent can have one voice agent.`}
        showAction
        actionLabel="Open voice agent"
        onAction={() => navigate(componentOverviewUrl(org, project.handler, voiceAgent.handler))}
      />
    </PageContent>
  );
}

interface WizardProps {
  org: string;
  mode: WizardMode;
  projects: Project[];
  project: Project;
  agent?: Component;
  existingVoiceAgent?: Component;
}

function CreateVoiceAgentWizard({ org, mode, projects, project, agent, existingVoiceAgent }: WizardProps): JSX.Element {
  const navigate = useAppNavigate();
  const routerNavigate = useNavigate();
  const guardNavigation = useLeaveGuard();
  const location = useLocation();
  const create = useCreateVoiceAgent();

  const [{ received, restored }] = useState(() => {
    const state = location.state as HandoffState | null;
    return { received: mode === 'org' ? undefined : state?.voiceAgentGeneral, restored: state?.voiceAgentReturn };
  });
  const handoff = restored ?? received;
  const skipTarget = mode === 'agent' || !!received;
  const steps = skipTarget ? ALL_STEPS.slice(1) : ALL_STEPS;

  const [initialSettings] = useState<VoiceAgentSettings>(() => {
    if (handoff) return { ...DEFAULT_VOICE_AGENT_SETTINGS, ...handoff };
    if (mode === 'agent' && agent) return { ...DEFAULT_VOICE_AGENT_SETTINGS, targetMode: 'platform', targetAgentHandler: agent.handler, displayName: `${agent.displayName || agent.handler} - Voice agent` };
    return DEFAULT_VOICE_AGENT_SETTINGS;
  });
  const [settings, setSettings] = useState<VoiceAgentSettings>(initialSettings);
  const [projectId, setProjectId] = useState(handoff?.projectId && projects.some((p) => p.id === handoff.projectId) ? handoff.projectId : project.id);
  const [activeStep, setActiveStep] = useState(0);
  const [touched, setTouched] = useState<ReadonlySet<keyof VoiceAgentSettings>>(() => new Set());
  const [attemptedSteps, setAttemptedSteps] = useState<ReadonlySet<string>>(() => new Set());
  const allowLeave = useUnsavedChanges(settings !== initialSettings && !create.isSuccess);
  const targetProject = projects.find((p) => p.id === projectId) ?? project;

  const { data: components } = useComponents(org, targetProject.id);
  const platformTarget = settings.targetMode === 'platform';
  const isTargetAgent = (c: Component): boolean => platformTarget && c.handler === settings.targetAgentHandler;
  const targetAgent = agent && isTargetAgent(agent) ? agent : components?.find((c) => isTargetAgent(c) && isLiveAiAgent(c));
  const endpoint = useAgentVoiceEndpoint(org, targetProject.id, targetAgent);
  const voicedAgents = voicedAgentHandlers(components ?? []);
  const resolvedSettings = platformTarget ? { ...settings, targetAgentWsUrl: endpoint.status === 'ready' ? endpoint.url : '' } : settings;
  const agentBlocked = platformTarget && (endpoint.status !== 'ready' || voicedAgents.has(settings.targetAgentHandler));

  const step = steps[activeStep];
  const stepErrors = step.validate(resolvedSettings, voicedAgents);
  const stepComplete = Object.keys(stepErrors).length === 0;
  const visibleErrors = visibleStepErrors(stepErrors, touched, step.key === 'tune' || attemptedSteps.has(step.key));
  const isLastStep = activeStep === steps.length - 1;

  const onChange = (patch: Partial<VoiceAgentSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
    setTouched((prev) => new Set([...prev, ...(Object.keys(patch) as (keyof VoiceAgentSettings)[])]));
  };

  const handOff = (): boolean => {
    const state: HandoffState = { voiceAgentGeneral: toHandoff(settings, targetProject.id) };
    const to = settings.targetMode === 'platform' ? enableVoiceAgentUrl(org, targetProject.handler, settings.targetAgentHandler) : mode === 'org' ? createVoiceAgentUrl(org, targetProject.handler) : null;
    if (!to) return false;
    allowLeave();
    const sourceState: HandoffState = { ...(location.state as HandoffState | null), voiceAgentReturn: state.voiceAgentGeneral };
    routerNavigate(`${location.pathname}${location.search}`, { replace: true, state: sourceState });
    navigate(to, { state });
    return true;
  };

  const next = () => {
    if (!stepComplete) {
      setAttemptedSteps((prev) => new Set(prev).add(step.key));
      return;
    }
    if (step.key === 'agent' && handOff()) return;
    if (!isLastStep) {
      setActiveStep(activeStep + 1);
      return;
    }
    if (agentBlocked) return;
    create.mutate(
      { orgHandler: org, projectId: targetProject.id, settings: resolvedSettings },
      {
        onSuccess: (component) => {
          allowLeave();
          navigate(componentOverviewUrl(org, targetProject.handler, component.handler || component.id));
        },
      },
    );
  };

  const back = () => {
    if (received && activeStep === 0) {
      guardNavigation(() => navigate(-1));
      return;
    }
    setActiveStep(activeStep - 1);
  };

  const exitUrl = mode === 'agent' && agent ? componentOverviewUrl(org, targetProject.handler, agent.handler) : mode === 'project' ? newComponentUrl({ org, project: targetProject.handler }) : voiceAgentsUrl(org);
  const exitLabel = mode === 'agent' ? 'Back to AI agent' : mode === 'project' ? 'Back to create integration' : 'Back to voice agents';

  if (create.isPending || create.isSuccess) {
    return (
      <PageContent fullWidth sx={LOADER_PAGE_SX}>
        <IntegrationCreationLoader label="voice agent" subLabel={resolvedSettings.displayName.trim()} isPending={create.isPending} isSuccess={create.isSuccess} steps={VOICE_AGENT_CREATION_STEPS} successText="Voice agent created!" />
      </PageContent>
    );
  }
  if (agent && existingVoiceAgent) return <VoiceAgentAlreadyEnabled org={org} project={targetProject} agent={agent} voiceAgent={existingVoiceAgent} />;

  return (
    <PageContent fullWidth sx={PAGE_SX}>
      <Button startIcon={<ArrowLeft size={16} />} onClick={() => guardNavigation(() => navigate(exitUrl))} sx={{ mb: 3 }}>
        {exitLabel}
      </Button>
      <PageTitle sx={{ mb: 4 }}>
        <PageTitle.Header>Create a voice agent</PageTitle.Header>
      </PageTitle>
      <Grid container spacing={4}>
        <Grid size={{ xs: 12, md: 3 }}>
          <Stepper activeStep={activeStep} orientation="vertical" sx={STEPPER_SX}>
            {steps.map((s) => (
              <Step key={s.key}>
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
          {targetAgent && step.key !== 'agent' && endpoint.status !== 'ready' && endpoint.status !== 'loading' && (
            <Stack sx={STATUS_SX}>
              <AgentEndpointStatus state={endpoint} agentName={targetAgent.displayName || targetAgent.handler} />
            </Stack>
          )}
          {step.Form ? (
            <step.Form settings={settings} errors={visibleErrors} onChange={onChange} onReplace={setSettings} />
          ) : (
            <VoiceAgentTargetStep
              settings={settings}
              errors={visibleErrors}
              onChange={onChange}
              onReplace={setSettings}
              orgHandler={org}
              projects={projects}
              projectId={targetProject.id}
              onProjectChange={setProjectId}
              lockProject={mode !== 'org'}
              agentEndpoint={endpoint}
              voicedAgents={voicedAgents}
            />
          )}
          {create.isError && (
            <Alert severity="error" sx={{ mt: 3, maxWidth: 560 }}>
              {create.error instanceof Error ? create.error.message : 'Could not create the voice agent.'}
            </Alert>
          )}
          <Stack direction="row" gap={1.5} sx={{ mt: 4 }}>
            <Button variant="outlined" onClick={back} disabled={activeStep === 0 && !received}>
              Back
            </Button>
            <Button variant="contained" onClick={next} disabled={isLastStep && agentBlocked}>
              {isLastStep ? 'Deploy voice agent' : 'Next'}
            </Button>
          </Stack>
        </Grid>
      </Grid>
    </PageContent>
  );
}
