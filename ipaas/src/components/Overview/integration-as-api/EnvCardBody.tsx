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

import { Alert, Box, Button, CircularProgress, Divider, Typography } from '@wso2/oxygen-ui';
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useApiDefinition, useComponentDeployment, useEnvEndpoints, useRetryProxyReconciliation } from '../../../hooks/useDeployments';
import { useEndpointSecurity } from '../../../hooks/useConsumers';
import { useOrgUuid } from '../../../hooks/useOrgUuid';
import type { EnvCardBodyProps } from '../../../types/integration';
import type { ProxyReconciliationStatus } from '../../../types/deployment';
import EnvCardSkeleton from '../_shared/EnvCardSkeleton';
import EndpointUrlsPanel from '../_shared/EndpointUrlsPanel';
import ConsumersPanel from './ConsumersPanel';
import SecuritySummary from './SecuritySummary';
import ServiceInsights from './ServiceInsights';
import SwaggerOperationsList, { type SwaggerDocument } from './SwaggerOperationsList';
import GraphqlOperationsList from './GraphqlOperationsList';
import { gatewayExposureState } from '../../../utils/endpoints';
import { friendlyApiError } from '../../../utils/apiSecurity';
import { isProxyReconciliationActive, proxyReconciliationNotice } from '../../../utils/proxyReconciliation';
import { Rocket } from '@wso2/oxygen-ui-icons-react';
import EnvEmptyNotice from '../../EnvEmptyNotice';
import { ENV_CARD_INSIGHTS_ENABLED } from '../../../constants/insights';

/**
 * Integration-as-API's content-only body: a deployment-in-progress spinner, the
 * endpoint URLs panel, the swagger operations (or a "same contract as the
 * previous env" note), a not-deployed placeholder, and per-env service insights
 * for critical environments. The shared shell provides the Card/header chrome.
 */
export default function EnvCardBody({ component, env, prevEnv, projectId, versionId, releaseId, orgHandler, hasDeployment, loadingDeployment, deploymentStatusV2 }: EnvCardBodyProps): ReactNode {
  const orgUuid = useOrgUuid() ?? '';

  // Per-env endpoints for the current release.
  const { data: envEndpoints = [] } = useEnvEndpoints(component.id, versionId, releaseId);

  // Previous-env deployment + endpoints, for the swagger contract comparison.
  const { data: prevEnvDeployment } = useComponentDeployment(prevEnv ? orgHandler : '', prevEnv ? orgUuid : '', prevEnv ? component.id : '', prevEnv ? versionId : '', prevEnv ? prevEnv.id : '');
  const prevEnvReleaseId = prevEnvDeployment?.releaseId ?? '';
  const prevEnabled = !!prevEnv && !!prevEnvReleaseId;
  const { data: prevEnvEndpoints = [] } = useEnvEndpoints(prevEnabled ? component.id : '', prevEnabled ? versionId : '', prevEnabled ? prevEnvReleaseId : '');

  const [selectedEpIdx, setSelectedEpIdx] = useState(0);
  const activeEndpoint = envEndpoints[selectedEpIdx] ?? envEndpoints[0];
  const isGraphql = activeEndpoint?.type === 'GraphQL';
  const gatewayExposure = gatewayExposureState(activeEndpoint?.visibilityStatus);
  // An UNKNOWN host still means the API is on the gateway, so consumers and security stay available.
  const gatewayExposureEnabled = gatewayExposure.state === 'enabled' || gatewayExposure.state === 'unknown';

  // The API gateway's state for this environment's release; polled while it is being updated.
  const { data: deployment } = useComponentDeployment(orgHandler, orgUuid, component.id, versionId, env.id, {
    refetchInterval: (query) => (isProxyReconciliationActive(query.state.data?.proxyReconciliation) ? 3_000 : false),
  });
  const reconciliation = proxyReconciliationNotice(deployment?.proxyReconciliation);
  const retryReconciliation = useRetryProxyReconciliation(component.id, env.id, projectId, versionId);
  // A failed retry explains the status it was tried on; once the status moves on, that status speaks for itself.
  const [retryFailedOn, setRetryFailedOn] = useState<ProxyReconciliationStatus | undefined>();
  const retry = () => {
    const triedOn = deployment?.proxyReconciliation;
    retryReconciliation.mutate(undefined, { onError: () => setRetryFailedOn(triedOn) });
  };

  // The enforcing API Platform gateway URL for the selected endpoint. Passed to EndpointUrlsPanel so an exposed external endpoint shows the apip URL instead
  // of the raw OpenChoreo external route.
  const securityRef = activeEndpoint ? { componentName: component.id, environmentName: env.id, endpointName: activeEndpoint.id, deploymentTrackId: versionId } : null;
  const { data: apiSecurity, isLoading: loadingSecurity } = useEndpointSecurity(securityRef, !!activeEndpoint && gatewayExposureEnabled);
  // Consumers hold API keys, which an OAuth-secured API refuses. The keys stay live, though, and work
  // again if the API goes back to API key, so under OAuth the panel still lists them for revoking.
  // Waiting for the mode keeps the panel from switching between the two; a failed read, or a mode
  // that isn't known, counts as API key.
  const oauth = apiSecurity?.mode === 'jwt' && !apiSecurity.stateUnknown;

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
  const showInsights = ENV_CARD_INSIGHTS_ENABLED && !!env.critical && !!env.id && !!env.name && !!projectId;

  if (loadingDeployment) return <EnvCardSkeleton />;

  return (
    <>
      <Divider sx={{ my: 2 }} />

      {deploymentStatusV2 === 'IN_PROGRESS' && (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 2 }}>
          <CircularProgress size={20} sx={{ color: 'warning.main' }} />
        </Box>
      )}

      {showEndpointPanel && deploymentStatusV2 !== 'IN_PROGRESS' && <EndpointUrlsPanel endpoints={envEndpoints} selectedIdx={selectedEpIdx} onSelect={setSelectedEpIdx} externalUrlOverride={apiSecurity?.publicUrl || undefined} />}

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

      {serviceNotDeployed && deploymentStatusV2 !== 'IN_PROGRESS' && <EnvEmptyNotice icon={Rocket}>This integration has not been deployed to this environment yet.</EnvEmptyNotice>}

      {/* Cloud-only in-console API consumption: what this environment's API
          enforces, and its consumer applications. Keyed by the BFF's
          component/environment/endpoint triple and the deployment track, since
          each track has its own API — the component name is the component id
          and the endpoint name is the endpoint id. Security is configured from
          the header (ApiSecurityAction), not per environment. */}
      {showEndpointPanel && deploymentStatusV2 !== 'IN_PROGRESS' && !!activeEndpoint && !!securityRef && gatewayExposureEnabled && (
        <>
          <SecuritySummary endpointRef={securityRef} />
          {!loadingSecurity && <ConsumersPanel componentName={component.id} projectName={projectId} envName={env.id} envLabel={env.name} endpointName={activeEndpoint.id} deploymentTrackId={versionId} oauth={oauth} />}
        </>
      )}

      {/* A project-only endpoint has no consumers, so only an exposure in flight or failing is reported. */}
      {showEndpointPanel && deploymentStatusV2 !== 'IN_PROGRESS' && !!activeEndpoint && (gatewayExposure.state === 'transitioning' || gatewayExposure.state === 'failed') && (
        <Box sx={{ mt: 2, p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
          <Typography variant="body2" color={gatewayExposure.state === 'failed' ? 'error.main' : 'text.secondary'}>
            {gatewayExposure.state === 'transitioning'
              ? 'API exposure is being updated. Consumer and security settings will be available when the gateway deployment is ready.'
              : gatewayExposure.reason || 'API exposure could not be completed. Retry the visibility update.'}
          </Typography>
        </Box>
      )}

      {showEndpointPanel && deploymentStatusV2 !== 'IN_PROGRESS' && gatewayExposure.state === 'unknown' && (
        <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>
          The API is on the gateway, but which host it serves can’t be confirmed yet.
        </Typography>
      )}

      {hasDeployment && deploymentStatusV2 !== 'IN_PROGRESS' && reconciliation && (
        <Alert
          severity={reconciliation.severity}
          sx={{ mt: 2 }}
          action={
            reconciliation.retry ? (
              <Button color="inherit" size="small" disabled={retryReconciliation.isPending} onClick={retry}>
                {retryReconciliation.isPending ? 'Retrying…' : 'Retry'}
              </Button>
            ) : undefined
          }>
          {retryReconciliation.isError && retryFailedOn === deployment?.proxyReconciliation ? friendlyApiError(retryReconciliation.error, 'Could not retry the API gateway update.') : reconciliation.text}
        </Alert>
      )}

      {showInsights && <ServiceInsights envName={env.name} envId={env.id} apimEnvId={env.apimEnvId} projectId={projectId} apiId={insightsApiId} />}
    </>
  );
}
