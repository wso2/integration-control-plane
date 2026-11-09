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
import { broaden, resourceUrl, type ComponentScope } from '../nav';
import { tokenServiceUrlOf } from '../utils/voiceAgent';

const ROOT_SX = { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 } as const;
const CONTENT_SX = { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 2 } as const;

export default function VoiceAgentTestConsole(scope: ComponentScope): JSX.Element {
  const orgUuid = useOrgUuid() ?? '';
  const { projectId } = useProjectId(scope.project);
  const componentQuery = useComponentByHandler(projectId, scope.component);
  const { data: component, isLoading: loadingComponent } = componentQuery;
  const envQuery = useEnvironments(scope.org, projectId);
  const { data: environments = [], isLoading: loadingEnvs } = envQuery;
  const { trackId } = useSelectedTrack(component);

  const [pickedEnvId, setPickedEnvId] = useState('');
  const env = environments.find((e) => e.id === pickedEnvId) ?? environments[0];

  const deploymentQuery = useComponentDeployment(component ? scope.org : '', component ? orgUuid : '', component?.id ?? '', trackId, env?.id ?? '');
  const { data: deployment, isLoading: loadingDeployment } = deploymentQuery;
  const releaseId = deployment?.releaseId ?? '';
  const { data: endpoints, isLoading: loadingEndpoints, isError, refetch } = useEnvEndpoints(component?.id ?? '', trackId, releaseId);

  if (loadingComponent) return <VoiceAgentTestSkeleton />;
  if (componentQuery.isError) {
    return (
      <PageContent fullWidth sx={CONTENT_SX}>
        <Alert severity="error" action={<Button onClick={() => void componentQuery.refetch()}>Retry</Button>}>
          Could not load the voice agent.
        </Alert>
      </PageContent>
    );
  }
  if (!component) return <NotFound message="Integration not found" backTo={resourceUrl(broaden(scope)!, 'overview')} backLabel="Back to project" />;

  const isActive = deployment?.deploymentStatusV2 === 'ACTIVE';
  const envSelector = environments.length > 0 && (
    <Select size="small" value={env?.id ?? ''} onChange={(e) => setPickedEnvId(String(e.target.value))} inputProps={{ 'aria-label': 'Environment' }} sx={{ ...PILL_SELECT_SX, minWidth: 160 }}>
      {environments.map((e) => (
        <MenuItem key={e.id} value={e.id}>
          {e.name}
        </MenuItem>
      ))}
    </Select>
  );

  const body = () => {
    if (envQuery.isError) {
      return (
        <Alert severity="error" action={<Button onClick={() => void envQuery.refetch()}>Retry</Button>}>
          Could not load the project&apos;s environments.
        </Alert>
      );
    }
    if (loadingEnvs) return <Skeleton variant="rounded" height={480} />;
    if (environments.length === 0) return <Alert severity="info">This project has no environments to test the voice agent in.</Alert>;
    if (loadingDeployment || (releaseId && loadingEndpoints)) return <Skeleton variant="rounded" height={480} />;
    if (deploymentQuery.isError) {
      return (
        <Alert severity="error" action={<Button onClick={() => void deploymentQuery.refetch()}>Retry</Button>}>
          Could not load the voice agent&apos;s deployment.
        </Alert>
      );
    }
    if (!isActive) return <NotDeployedAlert status={deployment?.deploymentStatusV2} />;
    if (isError) {
      return (
        <Alert severity="error" action={<Button onClick={() => void refetch()}>Retry</Button>}>
          Could not load the token service endpoint.
        </Alert>
      );
    }
    const tokenServiceUrl = tokenServiceUrlOf(endpoints);
    return <VoiceAgentTestPanel key={env?.id} agentName={component.displayName || component.name} tokenServiceUrl={tokenServiceUrl} unavailableReason={tokenServiceUrl ? undefined : 'The token service has no public URL in this environment yet.'} />;
  };

  return (
    <Box sx={ROOT_SX}>
      <DeploymentTrackBar component={component} />
      <PageContent fullWidth sx={CONTENT_SX}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2} flexWrap="wrap">
          <PageTitle>
            <PageTitle.Header>Test</PageTitle.Header>
          </PageTitle>
          {envSelector}
        </Stack>
        {body()}
      </PageContent>
    </Box>
  );
}

function VoiceAgentTestSkeleton(): JSX.Element {
  return (
    <PageContent fullWidth sx={CONTENT_SX}>
      <Skeleton variant="text" width={120} height={48} />
      <Skeleton variant="rounded" height={480} />
    </PageContent>
  );
}
