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

import { Box, MenuItem, PageContent, PageTitle, Select, Stack } from '@wso2/oxygen-ui';
import { useEffect, useMemo, useState, type JSX } from 'react';
import ComingSoon from './ComingSoon';
import McpPlayground from '../components/McpPlayground/McpPlayground';
import DeploymentTrackBar from '../components/DeploymentTrackBar';
import { useGeneratedTestKey } from '../hooks/useApim';
import { useComponentByHandler } from '../hooks/useComponents';
import { useComponentDeployment, useEnvEndpoints } from '../hooks/useDeployments';
import { useEnvironments } from '../hooks/useEnvironments';
import { useOrgUuid } from '../hooks/useOrgUuid';
import { useProjectId } from '../hooks/useProjects';
import type { ComponentScope } from '../nav';
import type { EnvEndpoint } from '../types/component';

import NotDeployedAlert from '../components/NotDeployedAlert';
const TEST_KEY_HEADER = 'test-key';

/** Network-visibility URL resolvers (mirrors the endpoint URLs panel). */
const VISIBILITY_OPTIONS: { value: string; label: string; getUrl: (ep: EnvEndpoint) => string }[] = [
  { value: 'public', label: 'Public', getUrl: (ep) => ep.publicUrl || ep.defaultPublicUrl || ep.invokeUrl || '' },
  { value: 'organization', label: 'Organization', getUrl: (ep) => ep.organizationUrl || ep.defaultOrganizationUrl || '' },
  { value: 'project', label: 'Project', getUrl: (ep) => ep.projectUrl || '' },
];

/**
 * MCP Server "Test" page: resolves the deployed MCP endpoint + a freshly minted
 * `test-key` for the selected environment/track, then hands them to the in-house
 * {@link McpPlayground} (the interactive connect / list-tools / invoke / ping surface).
 */
export default function McpTest(scope: ComponentScope): JSX.Element {
  const orgUuid = useOrgUuid() ?? '';
  const { projectId, project } = useProjectId(scope.project);
  const { data: component } = useComponentByHandler(projectId, scope.component);
  const isMcp = component?.componentSubType === 'MCP';

  const { data: environments = [] } = useEnvironments(scope.org, projectId);

  const tracks = useMemo(() => component?.deploymentTracks ?? [], [component?.deploymentTracks]);
  const [selectedTrackId, setSelectedTrackId] = useState('');
  useEffect(() => {
    if (!tracks.length) return;
    setSelectedTrackId((prev) => (prev && tracks.some((t) => t.id === prev) ? prev : (tracks.find((t) => t.latest)?.id ?? tracks[0].id)));
  }, [component?.id, tracks]);

  const [selectedEnvId, setSelectedEnvId] = useState('');
  useEffect(() => {
    if (!environments.length) return;
    setSelectedEnvId((prev) => (prev && environments.some((e) => e.id === prev) ? prev : environments[0].id));
  }, [environments]);
  const selectedEnv = environments.find((e) => e.id === selectedEnvId) ?? null;

  const { data: deployment } = useComponentDeployment(component ? scope.org : '', component ? orgUuid : '', component?.id ?? '', selectedTrackId, selectedEnv?.id ?? '');
  const releaseId = deployment?.releaseId ?? '';
  const { data: endpoints = [] } = useEnvEndpoints(component?.id ?? '', selectedTrackId, releaseId);

  // Only endpoints with an APIM id are testable; the user picks the endpoint + visibility.
  const testableEndpoints = useMemo(() => endpoints.filter((e) => e.apimId), [endpoints]);
  const [selectedEndpointId, setSelectedEndpointId] = useState('');
  const [selectedVisibility, setSelectedVisibility] = useState('');

  const activeEndpointId = testableEndpoints.some((e) => e.id === selectedEndpointId) ? selectedEndpointId : (testableEndpoints[0]?.id ?? '');
  const activeEndpoint = testableEndpoints.find((e) => e.id === activeEndpointId) ?? null;

  const visibilityOptions = useMemo(() => (activeEndpoint ? VISIBILITY_OPTIONS.filter((v) => v.getUrl(activeEndpoint) && (!activeEndpoint.networkVisibilities?.length || activeEndpoint.networkVisibilities.includes(v.label))) : []), [activeEndpoint]);
  const activeVisibility = visibilityOptions.some((v) => v.value === selectedVisibility) ? selectedVisibility : (visibilityOptions[0]?.value ?? '');

  const baseUrl = visibilityOptions.find((v) => v.value === activeVisibility)?.getUrl(activeEndpoint!) ?? '';
  const mcpUrl = baseUrl ? `${baseUrl}/mcp` : '';
  const apimId = activeEndpoint?.apimId ?? null;
  // Only a live deployment can answer MCP calls; every other state explains itself.
  const isActive = deployment?.deploymentStatusV2 === 'ACTIVE';

  const endpointSwitcher = { options: testableEndpoints.map((e) => ({ label: e.displayName, value: e.id })), value: activeEndpointId, onChange: setSelectedEndpointId };
  const visibilitySwitcher = { options: visibilityOptions.map((v) => ({ label: v.label, value: v.value })), value: activeVisibility, onChange: setSelectedVisibility };

  const { token, isFetching: tokenFetching, regenerate } = useGeneratedTestKey({ apimId, critical: !!selectedEnv?.critical });

  // Non-MCP components keep this route's previous Coming Soon behaviour.
  if (component && !isMcp) {
    return <ComingSoon title="Coming Soon" description="Testing tools are currently under development." />;
  }

  const envSelector = environments.length > 1 && (
    <Select
      size="small"
      value={selectedEnvId}
      onChange={(e) => setSelectedEnvId(e.target.value as string)}
      inputProps={{ 'aria-label': 'Environment' }}
      sx={{ fontSize: '0.8125rem', '& .MuiOutlinedInput-notchedOutline': { borderRadius: 5 }, '& .MuiSelect-select': { py: 0.5, px: 1.5 }, minWidth: 140 }}>
      {environments.map((env) => (
        <MenuItem key={env.id} value={env.id}>
          {env.name}
        </MenuItem>
      ))}
    </Select>
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {tracks.length > 0 && <DeploymentTrackBar tracks={tracks} selectedId={selectedTrackId} onChange={setSelectedTrackId} orgHandler={scope.org} projectHandler={project?.handler ?? scope.project} componentHandler={scope.component} />}

      <PageContent sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2} flexWrap="wrap">
          <PageTitle>
            <PageTitle.Header>Test</PageTitle.Header>
          </PageTitle>
          {envSelector}
        </Stack>
        {!isActive || !mcpUrl ? (
          <NotDeployedAlert status={deployment?.deploymentStatusV2} />
        ) : (
          <McpPlayground url={mcpUrl} token={token || null} headerName={TEST_KEY_HEADER} isTokenFetching={tokenFetching} onTokenRegenerate={regenerate} endpointSwitcher={endpointSwitcher} visibilitySwitcher={visibilitySwitcher} />
        )}
      </PageContent>
    </Box>
  );
}
