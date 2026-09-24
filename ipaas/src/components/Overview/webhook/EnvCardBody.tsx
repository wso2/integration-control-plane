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

import { Box, CircularProgress, Divider, Typography } from '@wso2/oxygen-ui';
import { useState, type ReactNode } from 'react';
import { useEnvEndpoints } from '../../../hooks/useDeployments';
import type { EnvCardBodyProps } from '../../../types/integration';
import EnvCardSkeleton from '../_shared/EnvCardSkeleton';
import EndpointUrlsPanel from '../_shared/EndpointUrlsPanel';
import ServiceInsights from '../integration-as-api/ServiceInsights';

/**
 * Webhook body: the incoming endpoint URLs + the insights metrics (events
 * received, processing errors, error rate, latency) — the same layout as a
 * service card's, but without the OpenAPI/swagger viewer (webhooks publish no
 * contract). Matches Devant's webhook overview.
 */
export default function EnvCardBody({ component, env, projectId, versionId, releaseId, hasDeployment, loadingDeployment, deploymentStatusV2 }: EnvCardBodyProps): ReactNode {
  const { data: envEndpoints = [] } = useEnvEndpoints(component.id, versionId, releaseId, { pollUntilReady: hasDeployment });
  const [selectedEpIdx, setSelectedEpIdx] = useState(0);
  const activeEndpoint = envEndpoints[selectedEpIdx] ?? envEndpoints[0];

  const showEndpointPanel = hasDeployment && envEndpoints.length > 0;
  const notDeployed = !loadingDeployment && !hasDeployment;
  const insightsApiId = activeEndpoint?.apimId ?? component.apiId ?? '';
  const showInsights = !!env.critical && !!env.id && !!env.name && !!projectId && !!insightsApiId;

  if (loadingDeployment) return <EnvCardSkeleton />;

  return (
    <>
      <Divider sx={{ my: 2 }} />

      {deploymentStatusV2 === 'IN_PROGRESS' && (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 2 }}>
          <CircularProgress size={20} sx={{ color: 'warning.main' }} />
        </Box>
      )}

      {showEndpointPanel && deploymentStatusV2 !== 'IN_PROGRESS' && <EndpointUrlsPanel endpoints={envEndpoints} selectedIdx={selectedEpIdx} onSelect={setSelectedEpIdx} componentId={component.id} deploymentTrackId={versionId} />}

      {notDeployed && deploymentStatusV2 !== 'IN_PROGRESS' && (
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
          This webhook has not been deployed to this environment yet.
        </Typography>
      )}

      {showInsights && <ServiceInsights envName={env.name} envId={env.id} apimEnvId={env.apimEnvId} projectId={projectId} apiId={insightsApiId} />}
    </>
  );
}
