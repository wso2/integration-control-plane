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

import { Divider, Stack, Typography } from '@wso2/oxygen-ui';
import { Sparkles } from '@wso2/oxygen-ui-icons-react';
import { useState, type ReactNode } from 'react';
import { IS_CLOUD } from '../../../features';
import { useEndpointSecurity } from '../../../hooks/useConsumers';
import { useEnvEndpoints } from '../../../hooks/useDeployments';
import type { EnvCardBodyProps } from '../../../types/integration';
import AgentChat from '../../AgentChat';
import EndpointUrlsPanel from '../_shared/EndpointUrlsPanel';

//AI Agent env-card body
export default function EnvCardBody({ component, env, versionId, releaseId, hasDeployment }: EnvCardBodyProps): ReactNode {
  // Per-env endpoints for the current release (drives the URLs/Download-Spec panel).
  const { data: endpoints = [] } = useEnvEndpoints(component.id, versionId, releaseId);
  const [selectedEpIdx, setSelectedEpIdx] = useState(0);
  const selectedEndpoint = endpoints[selectedEpIdx] ?? endpoints[0];

  // The enforcing gateway URL for the selected endpoint (cloud-only; the hook is disabled
  // elsewhere). For an agent this comes from agent-manager, which registers it on the AI
  // gateway. Shown in place of the raw OpenChoreo external route.
  const securityRef = IS_CLOUD && selectedEndpoint ? { componentName: component.id, environmentName: env.id, endpointName: selectedEndpoint.id } : null;
  const { data: apiSecurity } = useEndpointSecurity(securityRef, IS_CLOUD && !!selectedEndpoint);

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

  // Show the deployed endpoint URLs whenever the agent is deployed
  const showEndpoints = endpoints.length > 0;

  // The chat is rendered for any deployed agent, whatever the rollout state. It reports its
  // own readiness — endpoint discovery, gateway exposure and the connection chip — so a
  // placeholder here would only duplicate that, less precisely.
  return (
    <>
      <Divider sx={{ my: 2 }} />
      {showEndpoints && <EndpointUrlsPanel endpoints={endpoints} selectedIdx={selectedEpIdx} onSelect={setSelectedEpIdx} componentId={component.id} deploymentTrackId={versionId} externalUrlOverride={apiSecurity?.publicUrl || undefined} />}
      <AgentChat componentId={component.id} versionId={versionId} releaseId={releaseId} environmentName={env.name} envCritical={!!env.critical} />
    </>
  );
}
