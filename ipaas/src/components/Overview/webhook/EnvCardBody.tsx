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

import { Box, CircularProgress, Divider } from '@wso2/oxygen-ui';
import { useState, type ReactNode } from 'react';
import { useEnvEndpoints } from '../../../hooks/useDeployments';
import { useUserVisibleEndpoints } from '../../../hooks/useUserVisibleEndpoints';
import { isWorkflowIntegration } from '../../../utils/workflowIntegration';
import type { EnvCardBodyProps } from '../../../types/integration';
import EnvCardSkeleton from '../_shared/EnvCardSkeleton';
import EndpointUrlsPanel from '../_shared/EndpointUrlsPanel';
import ServiceInsights from '../integration-as-api/ServiceInsights';
import { Rocket } from '@wso2/oxygen-ui-icons-react';
import EnvEmptyNotice from '../../EnvEmptyNotice';
import { ENV_CARD_INSIGHTS_ENABLED } from '../../../constants/insights';

/**
 * Webhook body: the incoming endpoint URLs + the insights metrics (events
 * received, processing errors, error rate, latency) — the same layout as a
 * service card's, but without the OpenAPI/swagger viewer (webhooks publish no
 * contract). Matches Devant's webhook overview.
 *
 * `children` is a type's own content, shown under the endpoints and above the
 * insights (the workflow body's definitions and figures).
 */
export default function EnvCardBody({ component, env, projectId, versionId, releaseId, hasDeployment, loadingDeployment, deploymentStatusV2, children }: EnvCardBodyProps & { children?: ReactNode }): ReactNode {
  const { data: allEndpoints = [] } = useEnvEndpoints(component.id, versionId, releaseId);
  const envEndpoints = useUserVisibleEndpoints(allEndpoints, isWorkflowIntegration(component));
  const [selectedEpIdx, setSelectedEpIdx] = useState(0);
  const activeEndpoint = envEndpoints[selectedEpIdx] ?? envEndpoints[0];

  const showEndpointPanel = hasDeployment && envEndpoints.length > 0;
  const notDeployed = !loadingDeployment && !hasDeployment;
  const insightsApiId = activeEndpoint?.apimId ?? component.apiId ?? '';
  const showInsights = ENV_CARD_INSIGHTS_ENABLED && !!env.critical && !!env.id && !!env.name && !!projectId && !!insightsApiId;

  if (loadingDeployment) return <EnvCardSkeleton />;

  return (
    <>
      <Divider sx={{ my: 2 }} />

      {deploymentStatusV2 === 'IN_PROGRESS' && (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 2 }}>
          <CircularProgress size={20} sx={{ color: 'warning.main' }} />
        </Box>
      )}

      {showEndpointPanel && deploymentStatusV2 !== 'IN_PROGRESS' && <EndpointUrlsPanel endpoints={envEndpoints} selectedIdx={selectedEpIdx} onSelect={setSelectedEpIdx} />}

      {notDeployed && deploymentStatusV2 !== 'IN_PROGRESS' && <EnvEmptyNotice icon={Rocket}>This webhook has not been deployed to this environment yet.</EnvEmptyNotice>}

      {children}

      {showInsights && <ServiceInsights envName={env.name} envId={env.id} apimEnvId={env.apimEnvId} projectId={projectId} apiId={insightsApiId} />}
    </>
  );
}
