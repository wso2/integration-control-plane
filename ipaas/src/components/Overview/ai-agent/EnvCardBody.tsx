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

import { Alert, Button, Divider, Stack, Typography } from '@wso2/oxygen-ui';
import { Sparkles } from '@wso2/oxygen-ui-icons-react';
import type { ReactNode } from 'react';
import { useEndpointSecurity } from '../../../hooks/useConsumers';
import { useEnvEndpoints } from '../../../hooks/useDeployments';
import { useLinkedVoiceAgents } from '../../../hooks/useVoiceAgents';
import type { EnvCardBodyProps } from '../../../types/integration';
import { friendlyApiError } from '../../../utils/apiSecurity';
import AgentChat from '../../AgentChat';
import EndpointUrlsPanel from '../_shared/EndpointUrlsPanel';
import { isVoiceEndpoint } from '../../../utils/voiceAgent';
import { useSelectedAgentEndpoint } from './selectedEndpoint';

//AI Agent env-card body
export default function EnvCardBody({ component, env, orgHandler, projectId, versionId, releaseId, hasDeployment }: EnvCardBodyProps): ReactNode {
  // Per-env endpoints for the current release (drives the URLs/Download-Spec panel).
  const { data: endpoints = [] } = useEnvEndpoints(component.id, versionId, releaseId);
  const [selectedId, setSelectedId] = useSelectedAgentEndpoint(component.id, env.id);
  const selectedEpIdx = Math.max(
    0,
    endpoints.findIndex((e) => e.id === selectedId),
  );
  const selectedEndpoint = endpoints[selectedEpIdx];
  const voiceAgent = useLinkedVoiceAgents(orgHandler, projectId, component.handler).voiceAgents.at(0);

  // The agent's URL on Agent Manager's AI gateway, where every agent is deployed. It is the only URL the card
  // lists: the endpoint's own routes (its OpenChoreo external route and its in-cluster project URL) carry
  // neither the agent's API key nor its gateway policy. '' while the gateway has none, which shows as "—".
  const securityRef = selectedEndpoint ? { projectName: projectId, componentName: component.id, environmentName: env.id, endpointName: selectedEndpoint.id, deploymentTrackId: versionId } : null;
  const { data: apiSecurity, isError: isSecurityError, error: securityError, isFetching: isSecurityFetching, refetch: refetchSecurity } = useEndpointSecurity(securityRef, !!selectedEndpoint);
  const agentGatewayUrl = apiSecurity?.publicUrl ?? '';

  if (!hasDeployment) {
    return (
      <>
        <Divider sx={{ my: 2 }} />
        <Stack alignItems="center" justifyContent="center" gap={1} sx={{ py: 4 }}>
          <Sparkles size={24} style={{ opacity: 0.4 }} />
          <Typography variant="body2" color="text.secondary">
            Deploy this agent to start chatting with it.
          </Typography>
        </Stack>
      </>
    );
  }

  // The chat is rendered for any deployed agent, whatever the rollout state. It reports its
  // own readiness — endpoint discovery, gateway exposure and the connection chip — so a
  // placeholder here would only duplicate that, less precisely.
  return (
    <>
      <Divider sx={{ my: 2 }} />
      <EndpointUrlsPanel endpoints={endpoints} selectedIdx={selectedEpIdx} onSelect={(i) => setSelectedId(endpoints[i].id)} agentGatewayUrl={agentGatewayUrl} />
      {/* A failed read is not a missing URL: the row stays "—", and this says why and offers another try. */}
      {isSecurityError && (
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          action={
            <Button color="inherit" size="small" disabled={isSecurityFetching} onClick={() => void refetchSecurity()}>
              {isSecurityFetching ? 'Retrying…' : 'Retry'}
            </Button>
          }>
          {friendlyApiError(securityError, 'Could not read the agent’s AI gateway URL.')}
        </Alert>
      )}
      {isVoiceEndpoint(selectedEndpoint) ? (
        <Alert severity="info" sx={{ mt: 2 }}>
          {voiceAgent ? (
            <>
              This WebSocket endpoint serves voice conversations through the voice agent <strong>{voiceAgent.displayName || voiceAgent.handler}</strong>. Click <strong>Test voice</strong> to talk to this AI agent.
            </>
          ) : (
            <>
              This WebSocket endpoint serves voice conversations. To talk to this AI agent by voice, click <strong>Enable voice agent</strong> at the top of the page, then click <strong>Test voice</strong>.
            </>
          )}
        </Alert>
      ) : (
        <AgentChat projectId={projectId} componentId={component.id} versionId={versionId} releaseId={releaseId} environmentName={env.id} envCritical={!!env.critical} />
      )}
    </>
  );
}
