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

import { Alert, Box, Button, CircularProgress, Divider, Stack, Typography } from '@wso2/oxygen-ui';
import { MCP } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useEnvEndpoints } from '../../../hooks/useDeployments';
import { useEndpointTestAccess } from '../../../hooks/useEndpointTestAccess';
import { useMcpTools } from '../../../hooks/useMcpTools';
import type { EnvCardBodyProps } from '../../../types/integration';
import { isDeploymentHealthy } from '../../../utils/deploymentStatus';
import type { EndpointRef } from '../../../types/consumers';
import EnvCardSkeleton from '../_shared/EnvCardSkeleton';
import EndpointUrlsPanel from '../_shared/EndpointUrlsPanel';
import McpToolTile from './McpToolTile';

/**
 * MCP Server env-card body: the list of tools the deployed MCP server exposes.
 *
 * Discovers the deployed endpoint, obtains a test credential for it, then lists
 * tools over the MCP SDK (`useMcpTools`) — mirroring devant's MCP overview, which
 * replaces the swagger/operations view with a tools list. The credential and the
 * enforcing gateway URL come from the API Platform (`useEndpointTestAccess`).
 * Shared by both MCP flavors (server-from-source and proxy) via the registry.
 */
export default function EnvCardBody({ component, env, projectId, versionId, releaseId, hasDeployment, loadingDeployment, deploymentStatusV2 }: EnvCardBodyProps): ReactNode {
  // Tools can only be listed once the server is actually deployed and running — an
  // in-progress deployment has no reachable `/mcp` endpoint yet, and a degraded one
  // (crash-looping, or never rendered) never will.
  const isDeploymentReady = hasDeployment && isDeploymentHealthy(deploymentStatusV2);
  const { data: endpoints = [] } = useEnvEndpoints(component.id, versionId, releaseId);

  // Default to the MCP-capable endpoint (tools are listed at `${baseUrl}/mcp`). The
  // user can still switch endpoints in the panel.
  const mcpIdx = useMemo(() => {
    const i = endpoints.findIndex((e) => e.publicUrl);
    return i >= 0 ? i : 0;
  }, [endpoints]);
  const [selectedEpIdx, setSelectedEpIdx] = useState<number | null>(null);
  const activeIdx = selectedEpIdx ?? mcpIdx;
  const activeEndpoint = endpoints[activeIdx] ?? endpoints[0];

  // Enforcing gateway URL + a short-lived api-key from the API Platform.
  const accessRef: EndpointRef | null = useMemo(() => (activeEndpoint ? { projectName: projectId, componentName: component.id, environmentName: env.id, endpointName: activeEndpoint.id } : null), [projectId, component.id, env.id, activeEndpoint]);
  const access = useEndpointTestAccess(accessRef, !!accessRef && isDeploymentReady);

  // Tools are listed through the apip gateway and nothing else. The raw external
  // route is open (no policy engine in its path), so falling back to it would hand
  // the test key to a host that never validates it.
  const baseUrl = access.gatewayUrl;

  const apiKey = access.apiKey;
  // Wait for the credential before connecting — except on a `none`-mode endpoint,
  // which is open and needs none.
  const isAuthorized = access.isAuthorized;
  const keyError = access.keyError;
  // jwt-secured endpoints are not auto-minted — the test-key route would flip
  // enforcement to api-key auth, which must be a deliberate choice.
  const needsManualKey = access.mode === 'jwt' && !access.apiKey;

  const { tools, isLoading, error, isForbidden, isUnauthorized, refetch } = useMcpTools({
    baseUrl,
    apiKey,
    authHeader: access.authHeader,
    enabled: isDeploymentReady && !!baseUrl && isAuthorized,
  });

  // Another surface can reap this key, so a 401 is worth one re-mint; useMcpTools re-runs on it.
  // A 403 is authenticated but not permitted, so a fresh key changes nothing.
  useEffect(() => {
    if (isUnauthorized) access.retryUnauthorized();
  }, [isUnauthorized, access]);

  if (loadingDeployment) return <EnvCardSkeleton />;

  if (!hasDeployment) {
    return (
      <>
        <Divider sx={{ my: 2 }} />
        <Stack alignItems="center" justifyContent="center" gap={1} sx={{ py: 4 }}>
          <MCP size={24} style={{ opacity: 0.4 }} />
          <Typography variant="body2" color="text.secondary">
            Deploy this MCP server to view its tools.
          </Typography>
        </Stack>
      </>
    );
  }

  const showEndpointPanel = hasDeployment && !!endpoints.length;

  return (
    <>
      <Divider sx={{ my: 2 }} />

      {showEndpointPanel && <EndpointUrlsPanel endpoints={endpoints} selectedIdx={activeIdx} onSelect={setSelectedEpIdx} externalUrlOverride={access.gatewayUrl || undefined} />}

      {!isDeploymentReady ? (
        <Alert severity="info" sx={{ mt: 1.5 }}>
          Deploy to view MCP tools.
        </Alert>
      ) : access.isUnavailable ? (
        // Terminal: with no gateway URL the tools call is never attempted, so this
        // must not fall through to the authorization spinner and hang there.
        <Alert severity="warning" sx={{ mt: 1.5 }}>
          This MCP server&apos;s endpoint isn&apos;t exposed on the API gateway yet, so its tools can&apos;t be listed. Redeploy the server, or check that its endpoint is exposed as an API.
        </Alert>
      ) : keyError ? (
        // Without a credential the tools call is never attempted, so surface the
        // minting failure rather than letting it read as "No tools available".
        <Alert severity="warning" sx={{ mt: 1.5 }}>
          {keyError}
        </Alert>
      ) : needsManualKey ? (
        <Alert
          severity="info"
          sx={{ mt: 1.5 }}
          action={
            <Button color="inherit" size="small" onClick={() => void access.mintKey()} disabled={access.isMinting}>
              Use a test key
            </Button>
          }>
          This MCP server is secured with OAuth. Listing its tools needs a test key, which switches the endpoint to API Key authentication.
        </Alert>
      ) : (
        <>
          {(isLoading || !isAuthorized) && (
            <Stack alignItems="center" sx={{ py: 3 }}>
              <CircularProgress size={20} />
            </Stack>
          )}

          {isAuthorized && !isLoading && error && (
            <Alert
              severity={isForbidden ? 'warning' : 'error'}
              action={
                isForbidden ? undefined : (
                  <Button color="inherit" size="small" onClick={refetch}>
                    Retry
                  </Button>
                )
              }>
              {isForbidden ? "You don't have permission to view this MCP server's tools." : 'Failed to fetch MCP tools.'}
            </Alert>
          )}

          {isAuthorized && !isLoading && !error && tools.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
              No tools available.
            </Typography>
          )}

          {isAuthorized && !isLoading && !error && tools.length > 0 && (
            <Box sx={{ mt: 1.5 }}>
              {tools.map((tool) => (
                <McpToolTile key={tool.name} tool={tool} />
              ))}
            </Box>
          )}
        </>
      )}
    </>
  );
}
