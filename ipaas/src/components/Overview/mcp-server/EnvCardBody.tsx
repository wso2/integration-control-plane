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
import { useMcpServerTools } from '../../../hooks/useConsumers';
import { useEnvEndpoints } from '../../../hooks/useDeployments';
import { useEndpointTestAccess } from '../../../hooks/useEndpointTestAccess';
import ApiKeyAuthOffer from '../../ApiKeyAuthOffer';
import { useMcpTools } from '../../../hooks/useMcpTools';
import type { EnvCardBodyProps } from '../../../types/integration';
import { isDeploymentHealthy } from '../../../utils/deploymentStatus';
import { MCP_REDIRECT_MESSAGE } from '../../../utils/mcp';
import { httpCodeOf, isPermissionError } from '../../../utils/apiErrors';
import type { EndpointRef } from '../../../types/consumers';
import EnvCardSkeleton from '../_shared/EnvCardSkeleton';
import EndpointUrlsPanel from '../_shared/EndpointUrlsPanel';
import McpToolTile from './McpToolTile';
import type { McpTool } from '../../../types/mcp';

/**
 * MCP Server env-card body: the list of tools the deployed MCP server exposes.
 *
 * Discovers the deployed endpoint, obtains a test credential for it, then lists
 * tools over the MCP SDK (`useMcpTools`) — mirroring devant's MCP overview, which
 * replaces the swagger/operations view with a tools list. The credential and the
 * enforcing gateway URL come from `useEndpointTestAccess`: the API Platform for an
 * MCP proxy, Agent Manager's AI gateway for an MCP server published there. The AI
 * gateway answers no browser's CORS preflight, so that server's tools come from the
 * BFF instead (`AiGatewayTools`), which reads what Agent Manager listed.
 * Shared by both MCP flavors (server-from-source and proxy) via the registry.
 */
export default function EnvCardBody({ component, env, projectId, versionId, releaseId, hasDeployment, loadingDeployment, deploymentStatusV2 }: EnvCardBodyProps): ReactNode {
  // Tools can only be listed once the server is actually deployed and running — an
  // in-progress deployment has no reachable `/mcp` endpoint yet, and a degraded one
  // (crash-looping, or never rendered) never will.
  const isDeploymentReady = hasDeployment && isDeploymentHealthy(deploymentStatusV2);
  const { data: endpoints = [] } = useEnvEndpoints(component.id, versionId, releaseId);

  // Default to the MCP-capable endpoint. The user can still switch endpoints in the panel.
  const mcpIdx = useMemo(() => {
    const i = endpoints.findIndex((e) => e.publicUrl);
    return i >= 0 ? i : 0;
  }, [endpoints]);
  const [selectedEpIdx, setSelectedEpIdx] = useState<number | null>(null);
  const activeIdx = selectedEpIdx ?? mcpIdx;
  const activeEndpoint = endpoints[activeIdx] ?? endpoints[0];

  // Enforcing gateway URL + a short-lived api-key from the API Platform.
  const accessRef: EndpointRef | null = useMemo(
    () => (activeEndpoint ? { projectName: projectId, componentName: component.id, environmentName: env.id, endpointName: activeEndpoint.id, deploymentTrackId: versionId } : null),
    [projectId, component.id, env.id, activeEndpoint, versionId],
  );
  const access = useEndpointTestAccess(accessRef, { enabled: !!accessRef && isDeploymentReady });

  // Tools are listed through the gateway and nothing else. The raw external route is
  // open (no policy engine in its path), so falling back to it would hand the test key
  // to a host that never validates it.
  const mcpUrl = access.mcpUrl;

  const apiKey = access.apiKey;
  // Wait for the credential before connecting — except on a `none`-mode endpoint,
  // which is open and needs none.
  const isAuthorized = access.isAuthorized;
  const keyError = access.keyError;

  const { tools, isLoading, error, isForbidden, isUnauthorized, isRedirect, refetch } = useMcpTools({
    mcpUrl,
    apiKey,
    authHeader: access.authHeader,
    // An AI gateway MCP server's tools come from the BFF instead.
    enabled: isDeploymentReady && !!mcpUrl && isAuthorized && !access.aiGateway,
  });
  const aiGatewayTools = useMcpServerTools(accessRef, isDeploymentReady && !!access.aiGateway);

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

      {showEndpointPanel &&
        (access.aiGateway ? (
          <EndpointUrlsPanel endpoints={endpoints} selectedIdx={activeIdx} onSelect={setSelectedEpIdx} aiGatewayUrl={access.gatewayUrl} />
        ) : (
          <EndpointUrlsPanel endpoints={endpoints} selectedIdx={activeIdx} onSelect={setSelectedEpIdx} externalUrlOverride={access.gatewayUrl || undefined} />
        ))}

      {!isDeploymentReady ? (
        <Alert severity="info" sx={{ mt: 1.5 }}>
          Deploy to view MCP tools.
        </Alert>
      ) : access.aiGateway ? (
        <AiGatewayTools tools={aiGatewayTools.data} isLoading={aiGatewayTools.isLoading} error={aiGatewayTools.error} refetch={() => void aiGatewayTools.refetch()} />
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
      ) : access.needsApiKeyAuth ? (
        <ApiKeyAuthOffer access={access} sx={{ mt: 1.5 }} />
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
                isForbidden || isRedirect ? undefined : (
                  <Button color="inherit" size="small" onClick={refetch}>
                    Retry
                  </Button>
                )
              }>
              {isForbidden ? "You don't have permission to view this MCP server's tools." : isRedirect ? MCP_REDIRECT_MESSAGE : 'Failed to fetch MCP tools.'}
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

interface AiGatewayToolsProps {
  tools: McpTool[] | undefined;
  isLoading: boolean;
  error: unknown;
  refetch: () => void;
}

/** An AI gateway MCP server's tools, listed by the BFF. */
function AiGatewayTools({ tools, isLoading, error, refetch }: AiGatewayToolsProps): ReactNode {
  if (isLoading) {
    return (
      <Stack alignItems="center" sx={{ py: 3 }}>
        <CircularProgress size={20} />
      </Stack>
    );
  }
  if (error) {
    const notRoutable = httpCodeOf(error) === 'MCP_SERVER_NOT_ROUTABLE';
    const unreachable = httpCodeOf(error) === 'MCP_SERVER_UNREACHABLE';
    const forbidden = isPermissionError(error);
    return (
      <Alert
        severity={notRoutable ? 'info' : forbidden ? 'warning' : 'error'}
        sx={{ mt: 1.5 }}
        action={
          notRoutable || forbidden ? undefined : (
            <Button color="inherit" size="small" onClick={refetch}>
              Retry
            </Button>
          )
        }>
        {notRoutable
          ? "This MCP server isn't reachable in this environment yet. Its tools show once it's running."
          : forbidden
            ? "You don't have permission to view this MCP server's tools."
            : unreachable
              ? "This MCP server didn't answer. Check that it's running, then retry."
              : 'Failed to fetch MCP tools.'}
      </Alert>
    );
  }
  if (!tools?.length) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
        No tools available.
      </Typography>
    );
  }
  return (
    <Box sx={{ mt: 1.5 }}>
      {tools.map((tool) => (
        <McpToolTile key={tool.name} tool={tool} />
      ))}
    </Box>
  );
}
