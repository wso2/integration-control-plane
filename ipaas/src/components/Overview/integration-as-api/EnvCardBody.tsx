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
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useApiDefinition, useComponentDeployment, useEnvEndpoints } from '../../../hooks/useDeployments';
import { useEndpointSecurity } from '../../../hooks/useConsumers';
import { useOrgUuid } from '../../../hooks/useOrgUuid';
import { IS_CLOUD } from '../../../features';
import type { EnvCardBodyProps } from '../../../types/integration';
import EnvCardSkeleton from '../_shared/EnvCardSkeleton';
import EndpointUrlsPanel from '../_shared/EndpointUrlsPanel';
import ConsumersPanel from './ConsumersPanel';
import ServiceInsights from './ServiceInsights';
import SwaggerOperationsList, { type SwaggerDocument } from './SwaggerOperationsList';
import GraphqlOperationsList from './GraphqlOperationsList';

/**
 * Integration-as-API's content-only body: a deployment-in-progress spinner, the
 * endpoint URLs panel, the swagger operations (or a "same contract as the
 * previous env" note), a not-deployed placeholder, and per-env service insights
 * for critical environments. The shared shell provides the Card/header chrome.
 */
export default function EnvCardBody({ component, env, prevEnv, projectId, versionId, releaseId, orgHandler, hasDeployment, loadingDeployment, deploymentStatusV2 }: EnvCardBodyProps): ReactNode {
  const orgUuid = useOrgUuid() ?? '';

  // Per-env endpoints for the current release.
  const { data: envEndpoints = [] } = useEnvEndpoints(component.id, versionId, releaseId, { pollUntilReady: hasDeployment });

  // Previous-env deployment + endpoints, for the swagger contract comparison.
  const { data: prevEnvDeployment } = useComponentDeployment(prevEnv ? orgHandler : '', prevEnv ? orgUuid : '', prevEnv ? component.id : '', prevEnv ? versionId : '', prevEnv ? prevEnv.id : '');
  const prevEnvReleaseId = prevEnvDeployment?.releaseId ?? '';
  const prevEnabled = !!prevEnv && !!prevEnvReleaseId;
  const { data: prevEnvEndpoints = [] } = useEnvEndpoints(prevEnabled ? component.id : '', prevEnabled ? versionId : '', prevEnabled ? prevEnvReleaseId : '');

  const [selectedEpIdx, setSelectedEpIdx] = useState(0);
  const activeEndpoint = envEndpoints[selectedEpIdx] ?? envEndpoints[0];
  const isGraphql = activeEndpoint?.type === 'GraphQL';

  // The enforcing API Platform gateway URL for the selected endpoint (cloud-only; the hook throws in
  // wip/icp). Passed to EndpointUrlsPanel so an exposed external endpoint shows the apip URL instead
  // of the raw OpenChoreo external route.
  const securityRef = IS_CLOUD && activeEndpoint ? { componentName: component.id, environmentName: env.id, endpointName: activeEndpoint.id } : null;
  const { data: apiSecurity } = useEndpointSecurity(securityRef, IS_CLOUD && !!activeEndpoint);

  // GraphQL is introspected live (GraphqlOperationsList) — the swagger/contract path is REST-only.
  const { data: swagger } = useApiDefinition(hasDeployment && !isGraphql ? activeEndpoint?.apimRevisionId : null);

  const prevEndpoint = useMemo(() => {
    if (!prevEnvEndpoints.length || !activeEndpoint) return null;
    return prevEnvEndpoints.find((ep) => ep.displayName === activeEndpoint.displayName) ?? null;
  }, [prevEnvEndpoints, activeEndpoint]);

  const { data: prevSwagger, isLoading: loadingPrevSwagger } = useApiDefinition(hasDeployment && !isGraphql ? prevEndpoint?.apimRevisionId : null);

  // Compare swagger omitting the 'security' field (same logic as devant).
  const isSwaggerChanged = useMemo(() => {
    if (!prevEnv?.name || !prevEndpoint?.apimRevisionId) return true; // no prev env → always show swagger
    if (loadingPrevSwagger) return true; // prev spec still loading → show current swagger optimistically
    if (!swagger || !prevSwagger) return false; // data unavailable → show placeholder
    const omitSecurity = (s: object): Record<string, unknown> => {
      const c = { ...(s as Record<string, unknown>) };
      delete c['security'];
      return c;
    };
    return JSON.stringify(omitSecurity(swagger)) !== JSON.stringify(omitSecurity(prevSwagger));
  }, [swagger, prevSwagger, prevEndpoint, prevEnv, loadingPrevSwagger]);

  const showEndpointPanel = hasDeployment && !!envEndpoints.length;
  const serviceNotDeployed = !loadingDeployment && !hasDeployment;
  // Use the endpoint's apimId for insights — component.apiId is often null for generic services.
  const insightsApiId = activeEndpoint?.apimId ?? component.apiId ?? '';
  const showInsights = !!env.critical && !!env.id && !!env.name && !!projectId;

  if (loadingDeployment) return <EnvCardSkeleton />;

  return (
    <>
      <Divider sx={{ my: 2 }} />

      {deploymentStatusV2 === 'IN_PROGRESS' && (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 2 }}>
          <CircularProgress size={20} sx={{ color: 'warning.main' }} />
        </Box>
      )}

      {showEndpointPanel && deploymentStatusV2 !== 'IN_PROGRESS' && (
        <EndpointUrlsPanel endpoints={envEndpoints} selectedIdx={selectedEpIdx} onSelect={setSelectedEpIdx} componentId={component.id} deploymentTrackId={versionId} externalUrlOverride={apiSecurity?.publicUrl || undefined} />
      )}

      {hasDeployment &&
        deploymentStatusV2 !== 'IN_PROGRESS' &&
        (isGraphql ? (
          <GraphqlOperationsList activeEndpoint={activeEndpoint} isDeploymentReady envCritical={!!env.critical} />
        ) : isSwaggerChanged ? (
          !!swagger && <SwaggerOperationsList swagger={swagger as SwaggerDocument} />
        ) : (
          !!prevEnv?.name && (
            <Box sx={{ display: 'flex', alignItems: 'center', mt: 1, mb: 1.5, p: 1, bgcolor: 'action.selected', borderLeft: '3px solid', borderColor: 'primary.main', minWidth: 200 }}>
              <Typography variant="body2">
                The contract is same as the <strong>{prevEnv.name}</strong> environment&apos;s matching endpoint.
              </Typography>
            </Box>
          )
        ))}

      {serviceNotDeployed && deploymentStatusV2 !== 'IN_PROGRESS' && (
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
          This component has not been deployed to this environment yet.
        </Typography>
      )}

      {/* Cloud-only in-console API consumption: consumer applications and the
          exposed API's security config. Keyed by the BFF's
          component/environment/endpoint triple — in cloud the component name is
          the component id and the endpoint name is the endpoint id. */}
      {IS_CLOUD && showEndpointPanel && deploymentStatusV2 !== 'IN_PROGRESS' && !!activeEndpoint && (
        <ConsumersPanel componentName={component.id} projectName={projectId} envName={env.id} envLabel={env.name} endpointName={activeEndpoint.id} endpoints={envEndpoints.map((ep) => ({ name: ep.id, displayName: ep.displayName || ep.id }))} />
      )}

      {showInsights && <ServiceInsights envName={env.name} envId={env.id} apimEnvId={env.apimEnvId} projectId={projectId} apiId={insightsApiId} />}
    </>
  );
}
