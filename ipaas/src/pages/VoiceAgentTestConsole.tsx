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

import { Alert, Box, Button, MenuItem, PageContent, PageTitle, Select, Skeleton, Stack } from '@wso2/oxygen-ui';
import { useState, type JSX } from 'react';
import { useComponentByHandler } from '../hooks/useComponents';
import { useComponentDeployment, useEnvEndpoints } from '../hooks/useDeployments';
import { useEnvironments } from '../hooks/useEnvironments';
import { useOrgUuid } from '../hooks/useOrgUuid';
import { useProjectId } from '../hooks/useProjects';
import { useSelectedTrack } from '../hooks/useSelectedTrack';
import DeploymentTrackBar from '../components/DeploymentTrackBar';
import NotDeployedAlert from '../components/NotDeployedAlert';
import NotFound from '../components/NotFound';
import VoiceAgentTestPanel from '../components/VoiceAgent/VoiceAgentTestPanel';
import { PILL_SELECT_SX } from '../constants/styles';
import { resourceUrl, type ComponentScope } from '../nav';
import { orgProjectsUrl } from '../paths';
import type { Component } from '../types/component';
import type { Environment } from '../types/environment';
import { tokenServiceUrlOf, voiceAgentEnvironment } from '../utils/voiceAgent';

const ROOT_SX = { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 } as const;
const CONTENT_SX = { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 2 } as const;
const ENV_SELECT_SX = { ...PILL_SELECT_SX, minWidth: 160 } as const;

export default function VoiceAgentTestConsole(scope: ComponentScope): JSX.Element {
  const orgUuid = useOrgUuid();
  const projectQuery = useProjectId(scope.project);
  const { projectId } = projectQuery;
  const componentQuery = useComponentByHandler(projectId, scope.component);
  const { data: component, isLoading: loadingComponent } = componentQuery;

  if (projectQuery.isLoading || loadingComponent || !orgUuid) return <VoiceAgentTestSkeleton />;
  if (projectQuery.isError) {
    return (
      <PageContent fullWidth sx={CONTENT_SX}>
        <Alert severity="error" action={<Button onClick={() => void projectQuery.refetch()}>Retry</Button>}>
          Could not load the project.
        </Alert>
      </PageContent>
    );
  }
  if (!projectId) return <NotFound message="Project not found" backTo={orgProjectsUrl(scope.org)} backLabel="Back to projects" />;
  if (componentQuery.isError) {
    return (
      <PageContent fullWidth sx={CONTENT_SX}>
        <Alert severity="error" action={<Button onClick={() => void componentQuery.refetch()}>Retry</Button>}>
          Could not load the voice agent.
        </Alert>
      </PageContent>
    );
  }
  if (!component) return <NotFound message="Integration not found" backTo={resourceUrl({ level: 'projects', org: scope.org, project: scope.project }, 'overview')} backLabel="Back to project" />;
  return <VoiceAgentTest org={scope.org} orgUuid={orgUuid} projectId={projectId} component={component} />;
}

interface VoiceAgentTestProps {
  org: string;
  orgUuid: string;
  projectId: string;
  component: Component;
}

function VoiceAgentTest({ org, orgUuid, projectId, component }: VoiceAgentTestProps): JSX.Element {
  const envQuery = useEnvironments(org, projectId);
  const { data: environments = [], isLoading: loadingEnvs } = envQuery;
  const { trackId } = useSelectedTrack(component);
  const [pickedEnvId, setPickedEnvId] = useState('');
  const env = environments.find((e) => e.id === pickedEnvId) ?? voiceAgentEnvironment(environments);

  const body = () => {
    if (envQuery.isError) {
      return (
        <Alert severity="error" action={<Button onClick={() => void envQuery.refetch()}>Retry</Button>}>
          Could not load the project&apos;s environments.
        </Alert>
      );
    }
    if (loadingEnvs) return <Skeleton variant="rounded" height={480} />;
    if (!env) return <Alert severity="info">This project has no environments to test the voice agent in.</Alert>;
    return <EnvironmentTest key={env.id} org={org} orgUuid={orgUuid} component={component} trackId={trackId} env={env} />;
  };

  return (
    <Box sx={ROOT_SX}>
      <DeploymentTrackBar component={component} />
      <PageContent fullWidth sx={CONTENT_SX}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2} flexWrap="wrap">
          <PageTitle>
            <PageTitle.Header>Test</PageTitle.Header>
          </PageTitle>
          {env && (
            <Select size="small" value={env.id} onChange={(e) => setPickedEnvId(String(e.target.value))} inputProps={{ 'aria-label': 'Environment' }} sx={ENV_SELECT_SX}>
              {environments.map((e) => (
                <MenuItem key={e.id} value={e.id}>
                  {e.name}
                </MenuItem>
              ))}
            </Select>
          )}
        </Stack>
        {body()}
      </PageContent>
    </Box>
  );
}

interface EnvironmentTestProps {
  org: string;
  orgUuid: string;
  component: Component;
  trackId: string | undefined;
  env: Environment;
}

function EnvironmentTest({ org, orgUuid, component, trackId, env }: EnvironmentTestProps): JSX.Element {
  const deploymentQuery = useComponentDeployment(org, orgUuid, component.id, trackId, env.id);
  const { data: deployment, isLoading } = deploymentQuery;

  if (isLoading) return <Skeleton variant="rounded" height={480} />;
  if (deploymentQuery.isError) {
    return (
      <Alert severity="error" action={<Button onClick={() => void deploymentQuery.refetch()}>Retry</Button>}>
        Could not load the voice agent&apos;s deployment.
      </Alert>
    );
  }
  if (!deployment || deployment.deploymentStatusV2 !== 'ACTIVE') return <NotDeployedAlert status={deployment?.deploymentStatusV2} />;
  return <TokenServiceTest component={component} trackId={trackId} releaseId={deployment.releaseId} />;
}

function TokenServiceTest({ component, trackId, releaseId }: { component: Component; trackId: string | undefined; releaseId: string }): JSX.Element {
  const { data: endpoints, isLoading, isError, refetch } = useEnvEndpoints(component.id, trackId, releaseId);
  if (isLoading) return <Skeleton variant="rounded" height={480} />;
  if (isError) {
    return (
      <Alert severity="error" action={<Button onClick={() => void refetch()}>Retry</Button>}>
        Could not load the token service endpoint.
      </Alert>
    );
  }
  const tokenServiceUrl = tokenServiceUrlOf(endpoints);
  return <VoiceAgentTestPanel agentName={component.displayName || component.name} tokenServiceUrl={tokenServiceUrl} unavailableReason={tokenServiceUrl ? undefined : 'The token service has no public URL in this environment yet.'} />;
}

function VoiceAgentTestSkeleton(): JSX.Element {
  return (
    <PageContent fullWidth sx={CONTENT_SX}>
      <Skeleton variant="text" width={120} height={48} />
      <Skeleton variant="rounded" height={480} />
    </PageContent>
  );
}
