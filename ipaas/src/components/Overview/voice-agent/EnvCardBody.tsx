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

import { Alert, Divider, Skeleton, Stack, Typography } from '@wso2/oxygen-ui';
import { Mic } from '@wso2/oxygen-ui-icons-react';
import type { ReactNode } from 'react';
import { useEnvEndpoints } from '../../../hooks/useDeployments';
import type { EnvCardBodyProps } from '../../../types/integration';
import { isDeploymentHealthy } from '../../../utils/deploymentStatus';
import VoiceAgentTester from '../../VoiceAgent/VoiceAgentTester';

/** The endpoint the BFF publishes the token service on (ipaas-service models.VoiceAgentTokenEndpointName). */
const TOKEN_ENDPOINT_NAME = 'token-service';

const URL_SX = { fontFamily: 'monospace', wordBreak: 'break-all' } as const;

export default function EnvCardBody({ component, versionId, releaseId, hasDeployment, deploymentStatusV2 }: EnvCardBodyProps): ReactNode {
  const { data: endpoints, isLoading, isError } = useEnvEndpoints(component.id, versionId, releaseId);

  if (!hasDeployment) {
    return (
      <>
        <Divider sx={{ my: 2 }} />
        <Stack alignItems="center" gap={1} sx={{ py: 4 }}>
          <Mic size={24} style={{ opacity: 0.4 }} />
          <Typography variant="body2" color="text.secondary">
            This voice agent is not deployed in this environment.
          </Typography>
        </Stack>
      </>
    );
  }
  if (isLoading) {
    return (
      <>
        <Divider sx={{ my: 2 }} />
        <Skeleton variant="text" width="60%" />
        <Skeleton variant="rounded" height={120} sx={{ mt: 1 }} />
      </>
    );
  }
  if (isError) {
    return (
      <>
        <Divider sx={{ my: 2 }} />
        <Alert severity="error">Could not load the token service endpoint.</Alert>
      </>
    );
  }

  const tokenServiceUrl = endpoints?.find((e) => e.id === TOKEN_ENDPOINT_NAME)?.publicUrl;
  return (
    <>
      <Divider sx={{ my: 2 }} />
      <Stack gap={2}>
        {tokenServiceUrl ? (
          <>
            <Stack gap={0.5}>
              <Typography variant="subtitle2">Token service</Typography>
              <Typography variant="body2" sx={URL_SX}>
                {tokenServiceUrl}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Your app calls GET /getToken?roomName=…&amp;participantName=… here for a LiveKit room token, then joins the room to talk to the agent.
              </Typography>
            </Stack>
            <Alert severity="warning">This URL is public: anyone who has it can start calls that use your LiveKit and provider accounts. Share it only with apps you trust, and stop the voice agent when you are not using it.</Alert>
            <VoiceAgentTester tokenServiceUrl={tokenServiceUrl} disabled={!isDeploymentHealthy(deploymentStatusV2)} />
          </>
        ) : (
          <Alert severity="info">The token service URL appears here once the voice agent finishes rolling out.</Alert>
        )}
      </Stack>
    </>
  );
}
