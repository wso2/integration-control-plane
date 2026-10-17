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

import { Alert, Autocomplete, Box, Button, CircularProgress, Divider, IconButton, InputAdornment, OutlinedInput, PageContent, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import TextField from '../components/common/TextField';
import { Check, Copy, Eye, EyeOff, Key } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import SwaggerUI from 'swagger-ui-react';
import 'swagger-ui-react/swagger-ui.css';
import '../swagger-ui-overrides.scss';
import { endpointLoadNotice } from '../utils/apiSecurity';
import { isBrowserReachable, visibilityUrlOptions } from '../utils/endpoints';
import { useApimSwagger } from '../hooks/useApim';
import { useComponentByHandler } from '../hooks/useComponents';
import { useEndpointPolicies } from '../hooks/useConsumers';
import { useEndpointTestAccess } from '../hooks/useEndpointTestAccess';
import { useComponentDeployment, useEnvEndpoints } from '../hooks/useDeployments';
import { useEnvironments } from '../hooks/useEnvironments';
import { useOrgUuid } from '../hooks/useOrgUuid';
import DeploymentTrackBar from '../components/DeploymentTrackBar';
import NotFound from '../components/NotFound';
import { useProjectId } from '../hooks/useProjects';
import type { EndpointRef } from '../types/consumers';
import { broaden, resourceUrl, type ComponentScope } from '../nav';

import NotDeployedAlert from '../components/NotDeployedAlert';
import EnvironmentSelect from '../components/common/EnvironmentSelect';
/** Header the APIM gateway reads the test key from. Cloud uses the api-key-auth header instead. */

// Hides SwaggerUI top chrome — keeps only the operations list with try-it-out
const HideTopPlugin = () => ({
  components: {
    InfoContainer: () => null,
    Info: () => null,
    Servers: () => null,
    ServersContainer: () => null,
    SchemesContainer: () => null,
    AuthorizeBtn: () => null,
    AuthorizeBtnContainer: () => null,
  },
});

export default function TestConsole(scope: ComponentScope): JSX.Element {
  const orgUuid = useOrgUuid() ?? '';

  const { projectId } = useProjectId(scope.project);

  // Component + environments
  const { data: component, isLoading: loadingComponent } = useComponentByHandler(projectId, scope.component);
  const { data: environments = [] } = useEnvironments(scope.org, projectId);

  // Deployment track selection (default to latest) — derived rather than synced via an effect,
  // since an effect+render round trip here would delay useComponentDeployment/useEnvEndpoints below.
  const tracks = useMemo(() => component?.deploymentTracks ?? [], [component?.deploymentTracks]);
  // An integration has one implicit deployment track.
  const selectedTrackId = tracks.find((t) => t.latest)?.id ?? tracks[0]?.id ?? '';

  // Environment selection (by ID for stability across refetches) — same reasoning.
  const [selectedEnvIdState, setSelectedEnvId] = useState('');
  const selectedEnvId = environments.some((e) => e.id === selectedEnvIdState) ? selectedEnvIdState : (environments[0]?.id ?? '');
  const selectedEnv = environments.find((e) => e.id === selectedEnvId) ?? null;

  // Deployment for selected env (provides releaseId)
  const { data: deployment } = useComponentDeployment(component ? scope.org : '', component ? orgUuid : '', component?.id ?? '', selectedTrackId, selectedEnv?.id ?? '');
  const releaseId = deployment?.releaseId ?? '';

  // Endpoints for the selected env + track
  const { data: endpoints = [], isLoading: loadingEndpoints } = useEnvEndpoints(component?.id ?? '', selectedTrackId, releaseId);

  // Selected endpoint — derived rather than synced via an effect, since useApimSwagger below
  // keys off selectedEndpoint and an effect+render round trip would delay it becoming enabled.
  const [selectedEndpointIdState, setSelectedEndpointId] = useState('');
  const selectedEndpointId = endpoints.some((e) => e.id === selectedEndpointIdState) ? selectedEndpointIdState : (endpoints[0]?.id ?? '');
  const selectedEndpoint = endpoints.find((e) => e.id === selectedEndpointId) ?? null;

  // environmentName is the environment slug, which toEnvironment puts in `id` — `name` is the label.
  // The test key comes from the BFF's test-key route (component/environment/endpoint triple), and
  // the enforcing API Platform gateway URL from the endpoint's security config.
  const testKeyEndpointRef: EndpointRef | null = useMemo(
    () => (component && selectedEnv && selectedEndpoint ? { projectName: projectId, componentName: component.id, environmentName: selectedEnv.id, endpointName: selectedEndpoint.id } : null),
    [projectId, component, selectedEnv, selectedEndpoint],
  );
  // Mint the initial test key when the console resolves an api-key-secured endpoint;
  // the button below explicitly refreshes it on demand after that.
  const access = useEndpointTestAccess(testKeyEndpointRef, !!testKeyEndpointRef);
  // Try-it-out runs in the browser, so the gateway must return CORS headers for this origin.
  const { data: endpointPolicies } = useEndpointPolicies(testKeyEndpointRef, !!testKeyEndpointRef);
  const testKeyHeader = access.authHeader;
  const corsBlocked = !!endpointPolicies && endpointPolicies.cors?.enabled === false;

  // Public is the gateway host where a key is enforced; without one the option is dropped, not downgraded to the endpoint's open route.
  const visibilityOptions = useMemo(() => {
    if (!selectedEndpoint) return [];
    const options = visibilityUrlOptions(selectedEndpoint, access.gatewayUrl);
    return access.gatewayUrl ? options : options.filter((o) => o.key !== 'public');
  }, [selectedEndpoint, access.gatewayUrl]);
  const [selectedVisibilityKey, setSelectedVisibilityKey] = useState('');
  const selectedVisibility = visibilityOptions.find((v) => v.key === selectedVisibilityKey) ?? visibilityOptions[0] ?? null;
  const invokeUrl = selectedVisibility?.url ?? '';
  const testable = !!selectedVisibility && isBrowserReachable(selectedVisibility.key);

  // Security header / test key
  // Both are read inside SwaggerUI's requestInterceptor to avoid stale closures.
  const securityHeaderRef = useRef('');
  const testKeyHeaderRef = useRef(testKeyHeader);
  testKeyHeaderRef.current = testKeyHeader;
  const [securityHeader, setSecurityHeader] = useState('');
  const updateSecurityHeader = (value: string) => {
    securityHeaderRef.current = value;
    setSecurityHeader(value);
  };
  const [showKey, setShowKey] = useState(false);
  const [keyCopied, setKeyCopied] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);

  // Not offered for an open endpoint: the BFF's test-key route switches enforcement to api-key,
  // so minting one would secure an endpoint the user deliberately left open.
  const canGetTestKey = !!testKeyEndpointRef && (access.mode === 'api-key' || access.mode === 'jwt');
  const fetchingKey = access.isMinting;
  const unavailableNotice = endpointLoadNotice(access.securityError, {
    notExposed: 'This endpoint isn’t exposed as an API yet, so there is no gateway URL to test against. Set its visibility to Public and deploy, then come back.',
    unavailable: 'API testing isn’t available in this environment.',
    readFailed: 'Could not read this endpoint’s security configuration.',
  });
  const keyError = access.keyError;

  // Cleared, not just replaced: the hook keys a minted key to its endpoint, so selecting one with
  // no key must not leave the previous endpoint's credential in the field.
  useEffect(() => {
    updateSecurityHeader(access.apiKey ?? '');
  }, [access.apiKey]);

  const handleGetTestKey = async () => {
    if (!canGetTestKey) return;
    const key = await access.mintKey();
    if (key) updateSecurityHeader(key);
  };

  // Swagger spec for the selected endpoint: its base64 OpenAPI arrives in `apimRevisionId`.
  // `||`, not `??`: an empty value is as unusable as a missing one.
  const { data: swaggerRaw, isLoading: loadingSwagger } = useApimSwagger(selectedEndpoint?.apimRevisionId || null);
  const swagger = swaggerRaw ?? null;

  // Override the swagger spec's server URL with the selected invoke URL so
  // SwaggerUI try-it-out executes against the actual deployment endpoint.
  const swaggerWithServer = useMemo(() => {
    if (!swagger || !invokeUrl) return swagger;
    return { ...(swagger as Record<string, unknown>), servers: [{ url: invokeUrl }] };
  }, [swagger, invokeUrl]);

  if (loadingComponent) {
    return (
      <PageContent sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 8 }}>
        <CircularProgress />
      </PageContent>
    );
  }

  if (!component) {
    return <NotFound message="Component not found" backTo={resourceUrl(broaden(scope)!, 'overview')} backLabel="Back to Project" />;
  }

  const envSelector = environments.length > 1 && (
    <EnvironmentSelect
      environments={environments}
      value={selectedEnvId}
      onChange={(id) => {
        setSelectedEnvId(id);
        setSelectedEndpointId('');
      }}
      deployment={{ orgHandler: scope.org, orgUuid, componentId: component?.id ?? '', versionId: selectedTrackId }}
    />
  );

  return (
    <Box sx={{ position: 'relative', overflow: 'hidden', flex: 1 }}>
      {tracks.length > 0 && <DeploymentTrackBar extra={envSelector} />}

      <PageContent>
        <Typography variant="h1" sx={{ mb: 3 }}>
          Test Console
        </Typography>

        {/* Nothing deployed to call — explain rather than render an empty endpoint picker. */}
        {!deployment || deployment.deploymentStatusV2 !== 'ACTIVE' ? (
          <NotDeployedAlert status={deployment ? deployment.deploymentStatusV2 : null} />
        ) : (
          <>
            {/* Controls panel */}
            <Box sx={{ maxWidth: 720, mb: 3 }}>
              <Stack direction="column" gap={2}>
                {/* Endpoint */}
                <Stack direction="row" alignItems="center" gap={2}>
                  <Typography variant="body2" sx={{ minWidth: 140, fontWeight: 500, color: 'text.secondary' }}>
                    Endpoint
                  </Typography>
                  {loadingEndpoints ? (
                    <CircularProgress size={20} />
                  ) : selectedEndpoint ? (
                    <Autocomplete
                      size="small"
                      options={endpoints}
                      getOptionLabel={(ep) => ep.displayName}
                      value={selectedEndpoint}
                      onChange={(_, ep) => {
                        if (ep) setSelectedEndpointId(ep.id);
                      }}
                      disableClearable
                      sx={{ minWidth: 220 }}
                      renderInput={(params) => <TextField {...params} />}
                    />
                  ) : (
                    <Typography variant="body2" color="text.secondary">
                      No endpoints
                    </Typography>
                  )}
                </Stack>

                {/* Visibility */}
                {visibilityOptions.length > 0 && (
                  <Stack direction="row" alignItems="center" gap={2}>
                    <Typography variant="body2" sx={{ minWidth: 140, fontWeight: 500, color: 'text.secondary' }}>
                      Visibility
                    </Typography>
                    <Autocomplete
                      size="small"
                      options={visibilityOptions}
                      getOptionLabel={(v) => v.label}
                      value={selectedVisibility ?? visibilityOptions[0]}
                      onChange={(_, v) => setSelectedVisibilityKey(v.key)}
                      disableClearable
                      sx={{ minWidth: 180 }}
                      renderInput={(params) => <TextField {...params} />}
                    />
                  </Stack>
                )}

                {/* Invoke URL */}
                {invokeUrl && (
                  <Stack direction="row" alignItems="center" gap={2}>
                    <Typography variant="body2" sx={{ minWidth: 140, fontWeight: 500, color: 'text.secondary' }}>
                      Invoke URL
                    </Typography>
                    <OutlinedInput
                      size="small"
                      value={invokeUrl}
                      readOnly
                      sx={{ flex: 1, fontFamily: 'monospace', fontSize: '0.8rem' }}
                      endAdornment={
                        <InputAdornment position="end">
                          <Tooltip title={urlCopied ? 'Copied!' : 'Copy to Clipboard'}>
                            <IconButton
                              size="small"
                              onClick={() => {
                                navigator.clipboard.writeText(invokeUrl);
                                setUrlCopied(true);
                                setTimeout(() => setUrlCopied(false), 2000);
                              }}>
                              {urlCopied ? <Check size={16} /> : <Copy size={16} />}
                            </IconButton>
                          </Tooltip>
                        </InputAdornment>
                      }
                    />
                  </Stack>
                )}

                {/* Security Header — hidden for a visibility that cannot be called from a browser. */}
                {testable && (
                  <Stack direction="row" alignItems="flex-start" gap={2}>
                    <Typography variant="body2" sx={{ minWidth: 140, fontWeight: 500, color: 'text.secondary', pt: 1 }}>
                      Security Header
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontWeight: 400 }}>
                        {testKeyHeader}
                      </Typography>
                    </Typography>
                    <Stack direction="column" gap={0.5} sx={{ flex: 1 }}>
                      <Stack direction="row" alignItems="center" gap={1}>
                        <OutlinedInput
                          size="small"
                          type={showKey ? 'text' : 'password'}
                          value={securityHeader}
                          onChange={(e) => updateSecurityHeader(e.target.value)}
                          placeholder="Paste or fetch a test key"
                          sx={{ flex: 1, fontFamily: 'monospace', fontSize: '0.8rem' }}
                          endAdornment={
                            <InputAdornment position="end">
                              <Tooltip title={showKey ? 'Hide' : 'Show'}>
                                <IconButton size="small" onClick={() => setShowKey((s) => !s)}>
                                  {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                                </IconButton>
                              </Tooltip>
                              <Tooltip title={keyCopied ? 'Copied!' : 'Copy'}>
                                <IconButton
                                  size="small"
                                  disabled={!securityHeader}
                                  onClick={() => {
                                    navigator.clipboard.writeText(securityHeader);
                                    setKeyCopied(true);
                                    setTimeout(() => setKeyCopied(false), 2000);
                                  }}>
                                  {keyCopied ? <Check size={16} /> : <Copy size={16} />}
                                </IconButton>
                              </Tooltip>
                            </InputAdornment>
                          }
                        />
                        <Button
                          variant="outlined"
                          size="small"
                          startIcon={fetchingKey ? <CircularProgress size={14} color="inherit" /> : <Key size={14} />}
                          disabled={fetchingKey || !canGetTestKey}
                          onClick={handleGetTestKey}
                          sx={{ whiteSpace: 'nowrap', textTransform: 'none' }}>
                          Get Test Key
                        </Button>
                      </Stack>
                      {keyError && (
                        <Typography variant="caption" color="error">
                          {keyError}
                        </Typography>
                      )}
                    </Stack>
                  </Stack>
                )}
              </Stack>
            </Box>

            <Divider sx={{ mb: 3 }} />

            {/* Swagger UI */}
            {loadingSwagger ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress />
              </Box>
            ) : access.isUnavailable ? (
              // 409 is a state ("not exposed yet"); any other status is a read that failed and may succeed on a retry.
              <Alert severity={unavailableNotice?.severity ?? 'info'}>{unavailableNotice?.text ?? 'This endpoint is not exposed on the API Platform gateway yet, so it cannot be tested from here.'}</Alert>
            ) : !testable && selectedVisibility ? (
              <Alert severity="info">{selectedVisibility.label} endpoints are not publicly accessible.</Alert>
            ) : swaggerWithServer ? (
              <>
                {corsBlocked && (
                  <Alert severity="warning" sx={{ mb: 2 }}>
                    CORS is disabled on this endpoint, so the gateway returns no Access-Control-Allow-Origin and the browser will not let this page use the responses — a request carrying the key header is refused at the preflight. Enable CORS in the
                    endpoint&apos;s settings, or call the endpoint with curl using the key above.
                  </Alert>
                )}
                <Box
                  sx={{
                    '& .swagger-ui .topbar': { display: 'none' },
                    '& .swagger-ui .information-container': { display: 'none' },
                    '& .swagger-ui .scheme-container': { display: 'none' },
                  }}>
                  <SwaggerUI
                    spec={swaggerWithServer}
                    plugins={[HideTopPlugin]}
                    docExpansion="list"
                    requestInterceptor={(request) => {
                      if (securityHeaderRef.current) {
                        request.headers[testKeyHeaderRef.current] = securityHeaderRef.current;
                      }
                      return request;
                    }}
                  />
                </Box>
              </>
            ) : selectedEndpoint && !loadingSwagger ? (
              <Typography variant="body2" color="text.secondary">
                No API definition available for this endpoint.
              </Typography>
            ) : null}
          </>
        )}
      </PageContent>
    </Box>
  );
}
