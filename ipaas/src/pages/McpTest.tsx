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

import { Alert, Box, MenuItem, PageContent, PageTitle, Select, Stack } from '@wso2/oxygen-ui';
import { useEffect, useMemo, useState, type JSX } from 'react';
import ComingSoon from './ComingSoon';
import McpPlayground from '../components/McpPlayground/McpPlayground';
import { useEndpointTestAccess } from '../hooks/useEndpointTestAccess';
import { useComponentByHandler } from '../hooks/useComponents';
import { useComponentDeployment, useEnvEndpoints } from '../hooks/useDeployments';
import { useEnvironments } from '../hooks/useEnvironments';
import { useOrgUuid } from '../hooks/useOrgUuid';
import { useProjectId } from '../hooks/useProjects';
import type { ComponentScope } from '../nav';
import type { EndpointRef } from '../types/consumers';

import NotDeployedAlert from '../components/NotDeployedAlert';
import { PILL_SELECT_SX } from '../constants/styles';

/**
 * MCP Server "Test" page: resolves the deployed MCP endpoint's gateway URL + a test
 * credential for the selected environment, then hands them to the in-house
 * {@link McpPlayground} (the interactive connect / list-tools / invoke / ping surface).
 */
export default function McpTest(scope: ComponentScope): JSX.Element {
  const orgUuid = useOrgUuid() ?? '';
  const { projectId } = useProjectId(scope.project);
  const { data: component } = useComponentByHandler(projectId, scope.component);
  const isMcp = component?.componentSubType === 'MCP';

  const { data: environments = [] } = useEnvironments(scope.org, projectId);

  const tracks = useMemo(() => component?.deploymentTracks ?? [], [component?.deploymentTracks]);
  // An integration has one implicit deployment track.
  const selectedTrackId = tracks.find((t) => t.latest)?.id ?? tracks[0]?.id ?? '';

  const [selectedEnvId, setSelectedEnvId] = useState('');
  useEffect(() => {
    if (!environments.length) return;
    setSelectedEnvId((prev) => (prev && environments.some((e) => e.id === prev) ? prev : environments[0].id));
  }, [environments]);
  const selectedEnv = environments.find((e) => e.id === selectedEnvId) ?? null;

  const { data: deployment } = useComponentDeployment(component ? scope.org : '', component ? orgUuid : '', component?.id ?? '', selectedTrackId, selectedEnv?.id ?? '');
  const releaseId = deployment?.releaseId ?? '';
  const { data: endpoints = [] } = useEnvEndpoints(component?.id ?? '', selectedTrackId, releaseId);

  const testableEndpoints = useMemo(() => endpoints.filter((e) => e.publicUrl), [endpoints]);
  const [selectedEndpointId, setSelectedEndpointId] = useState('');

  const activeEndpointId = testableEndpoints.some((e) => e.id === selectedEndpointId) ? selectedEndpointId : (testableEndpoints[0]?.id ?? '');
  const activeEndpoint = testableEndpoints.find((e) => e.id === activeEndpointId) ?? null;

  // Only a live deployment can answer MCP calls; every other state explains itself.
  const isActive = deployment?.deploymentStatusV2 === 'ACTIVE';

  const accessRef: EndpointRef | null = useMemo(
    () => (component && selectedEnv && activeEndpoint ? { projectName: projectId, componentName: component.id, environmentName: selectedEnv.id, endpointName: activeEndpoint.id } : null),
    [projectId, component, selectedEnv, activeEndpoint],
  );
  const access = useEndpointTestAccess(accessRef, !!accessRef && isActive);

  // No gateway URL means nothing is testable: the endpoint's own route has no policy engine in its path.
  const baseUrl = access.gatewayUrl;
  const mcpUrl = baseUrl ? `${baseUrl}/mcp` : '';

  const endpointSwitcher = { options: testableEndpoints.map((e) => ({ label: e.displayName, value: e.id })), value: activeEndpointId, onChange: setSelectedEndpointId };

  const regenerate = () => void access.mintKey();
  // Not offered for an open endpoint: the test-key route switches enforcement to api-key, so
  // minting would secure an endpoint whose api-key scheme the user turned off.
  const canMint = access.mode === 'api-key';

  // Non-MCP components keep this route's previous Coming Soon behaviour.
  if (component && !isMcp) {
    return <ComingSoon title="Coming Soon" description="Testing tools are currently under development." />;
  }

  const envSelector = environments.length > 1 && (
    <Select size="small" value={selectedEnvId} onChange={(e) => setSelectedEnvId(e.target.value as string)} inputProps={{ 'aria-label': 'Environment' }} sx={{ ...PILL_SELECT_SX, minWidth: 140 }}>
      {environments.map((env) => (
        <MenuItem key={env.id} value={env.id}>
          {env.name}
        </MenuItem>
      ))}
    </Select>
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <PageContent sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2} flexWrap="wrap">
          <PageTitle>
            <PageTitle.Header>Test</PageTitle.Header>
          </PageTitle>
          {envSelector}
        </Stack>
        {!isActive ? (
          <NotDeployedAlert status={deployment?.deploymentStatusV2} />
        ) : !mcpUrl ? (
          // Deployed, but with no enforcing URL to call — a different state from "not deployed".
          <Alert severity="info">{access.isUnavailable ? 'This MCP server isn’t exposed as an API on the gateway yet, so it cannot be tested from here.' : 'No testable endpoint URL is available for this MCP server yet.'}</Alert>
        ) : (
          <>
            {access.keyError && (
              <Alert severity="warning" sx={{ mb: 1.5 }}>
                {access.keyError}
              </Alert>
            )}
            <McpPlayground url={mcpUrl} token={access.apiKey || null} headerName={access.authHeader} isTokenFetching={access.isMinting} onTokenRegenerate={canMint ? regenerate : undefined} endpointSwitcher={endpointSwitcher} />
          </>
        )}
      </PageContent>
    </Box>
  );
}
