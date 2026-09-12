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

import { Alert, Autocomplete, Box, Button, CircularProgress, Divider, IconButton, InputAdornment, MenuItem, OutlinedInput, PageContent, Select, Stack, TextField, Tooltip, Typography } from '@wso2/oxygen-ui';
import { Check, Copy, Eye, EyeOff, Key } from '@wso2/oxygen-ui-icons-react';
import { useMemo, useRef, useState, type JSX } from 'react';
import SwaggerUI from 'swagger-ui-react';
import 'swagger-ui-react/swagger-ui.css';
import '../swagger-ui-overrides.scss';
import { DEFAULT_API_KEY_HEADER } from '../constants/apiConsumption';
import { IS_CLOUD } from '../features';
import { isBrowserReachable, visibilityUrlOptions } from '../utils/endpoints';
import { useApimSwagger, useGenerateTestKey } from '../hooks/useApim';
import { useComponentByHandler } from '../hooks/useComponents';
import { useCreateEndpointTestKey, useEndpointSecurity } from '../hooks/useConsumers';
import { useComponentDeployment, useEnvEndpoints } from '../hooks/useDeployments';
import { useEnvironments } from '../hooks/useEnvironments';
import { useOrgUuid } from '../hooks/useOrgUuid';
import DeploymentTrackBar from '../components/DeploymentTrackBar';
import NotFound from '../components/NotFound';
import { useProjectId } from '../hooks/useProjects';
import type { EndpointRef } from '../types/consumers';
import { friendlyApiError } from '../utils/apiSecurity';
import { broaden, resourceUrl, type ComponentScope } from '../nav';

import NotDeployedAlert from '../components/NotDeployedAlert';
/** Header the APIM gateway reads the test key from. Cloud uses the api-key-auth header instead. */
const APIM_TEST_KEY_HEADER = 'test-key';
const TEST_KEY_HEADER = IS_CLOUD ? DEFAULT_API_KEY_HEADER : APIM_TEST_KEY_HEADER;

const ENV_STATUS_DOT: Record<string, string> = {
  ACTIVE: 'success.main',
  ERROR: 'error.main',
  FAILED: 'error.main',
  IN_PROGRESS: 'warning.main',
  SUSPENDED: 'text.disabled',
  NOT_DEPLOYED: 'text.disabled',
};

interface EnvDotProps {
  orgHandler: string;
  orgUuid: string;
  componentId: string;
  versionId: string;
  envId: string;
}

function EnvDot({ orgHandler, orgUuid, componentId, versionId, envId }: EnvDotProps) {
  const { data: dep } = useComponentDeployment(orgHandler, orgUuid, componentId, versionId, envId);
  const status = dep?.deploymentStatusV2?.toUpperCase() ?? '';
  const color = ENV_STATUS_DOT[status] ?? 'text.disabled';
  return <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: color, flexShrink: 0 }} />;
}

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

  const { projectId, project } = useProjectId(scope.project);

  // Component + environments
  const { data: component, isLoading: loadingComponent } = useComponentByHandler(projectId, scope.component);
  const { data: environments = [] } = useEnvironments(scope.org, projectId);

  // Deployment track selection (default to latest) — derived rather than synced via an effect,
  // since an effect+render round trip here would delay useComponentDeployment/useEnvEndpoints below.
  const tracks = useMemo(() => component?.deploymentTracks ?? [], [component?.deploymentTracks]);
  const [selectedTrackIdState, setSelectedTrackId] = useState('');
  const selectedTrackId = tracks.some((t) => t.id === selectedTrackIdState) ? selectedTrackIdState : (tracks.find((t) => t.latest)?.id ?? tracks[0]?.id ?? '');

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
  // Cloud mints the test key from the BFF's test-key route (component/environment/endpoint triple)
  // and exposes the enforcing API Platform gateway URL via the endpoint's security config; wip/icp
  // mint from APIM against apimId (below).
  const testKeyEndpointRef: EndpointRef | null = useMemo(
    () => (IS_CLOUD && component && selectedEnv && selectedEndpoint ? { componentName: component.id, environmentName: selectedEnv.id, endpointName: selectedEndpoint.id } : null),
    [component, selectedEnv, selectedEndpoint],
  );
  const { data: apiSecurity } = useEndpointSecurity(testKeyEndpointRef, IS_CLOUD && !!testKeyEndpointRef);
  // The apip gateway host is where the api-key/JWT is actually enforced; the raw visibility URLs are
  // open (policy-engine not in path), so a test key means nothing there.
  const gatewayInvokeUrl = apiSecurity?.publicUrl ?? '';

  // The options name the endpoint's actual visibilities. An exposed endpoint's Public URL is the
  // API Platform gateway host, so try-it-out (with the minted test key) still exercises the secured
  // API rather than the open raw route.
  const visibilityOptions = useMemo(() => (selectedEndpoint ? visibilityUrlOptions(selectedEndpoint, gatewayInvokeUrl) : []), [selectedEndpoint, gatewayInvokeUrl]);
  const [selectedVisibilityKey, setSelectedVisibilityKey] = useState('');
  const selectedVisibility = visibilityOptions.find((v) => v.key === selectedVisibilityKey) ?? visibilityOptions[0] ?? null;
  const invokeUrl = selectedVisibility?.url ?? '';
  const testable = !!selectedVisibility && isBrowserReachable(selectedVisibility.key);

  // Security header / test key
  // securityHeaderRef is read inside SwaggerUI's requestInterceptor to avoid stale closures.
  const securityHeaderRef = useRef('');
  const [securityHeader, setSecurityHeader] = useState('');
  const updateSecurityHeader = (value: string) => {
    securityHeaderRef.current = value;
    setSecurityHeader(value);
  };
  const [showKey, setShowKey] = useState(false);
  const [fetchingKey, setFetchingKey] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [keyCopied, setKeyCopied] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);

  const generateKeyMutation = useGenerateTestKey();

  // testKeyEndpointRef is defined above (it also drives the gateway invoke URL via useEndpointSecurity).
  const endpointTestKeyMutation = useCreateEndpointTestKey(testKeyEndpointRef);
  const canGetTestKey = IS_CLOUD ? !!testKeyEndpointRef : !!selectedEndpoint?.apimId;

  const handleGetTestKey = async () => {
    if (!canGetTestKey) return;
    setFetchingKey(true);
    setKeyError(null);
    try {
      const key = IS_CLOUD ? (await endpointTestKeyMutation.mutateAsync()).apiKey : (await generateKeyMutation.mutateAsync({ apimId: selectedEndpoint!.apimId!, keyType: selectedEnv?.critical ? 'Production' : 'Development' }))?.apikey;
      if (key) {
        updateSecurityHeader(key);
      } else {
        setKeyError('No test key available. Please check your permissions.');
      }
    } catch (err) {
      setKeyError(IS_CLOUD ? friendlyApiError(err, 'Could not mint a test key.') : 'Failed to fetch test key.');
    } finally {
      setFetchingKey(false);
    }
  };

  // Swagger spec for the selected endpoint. Cloud carries the endpoint's base64
  // OpenAPI in `apimRevisionId` (there is no APIM behind it); wip resolves an
  // APIM revision from the same field.
  // `||`, not `??`: an empty revision id is as unusable as a missing one and must
  // still fall through to the apimId.
  const { data: swaggerRaw, isLoading: loadingSwagger } = useApimSwagger(selectedEndpoint?.apimRevisionId || selectedEndpoint?.apimId || null);
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
    <Select
      size="small"
      value={selectedEnvId}
      onChange={(e) => {
        setSelectedEnvId(e.target.value as string);
        setSelectedEndpointId('');
      }}
      renderValue={(value) => {
        const env = environments.find((e) => e.id === value);
        if (!env) return null;
        return (
          <Stack direction="row" alignItems="center" gap={0.75}>
            <EnvDot orgHandler={scope.org} orgUuid={orgUuid} componentId={component?.id ?? ''} versionId={selectedTrackId} envId={env.id} />
            {env.name}
          </Stack>
        );
      }}
      inputProps={{ 'aria-label': 'Environment' }}
      sx={{
        fontSize: '0.8125rem',
        '& .MuiOutlinedInput-notchedOutline': { borderRadius: 5 },
        '& .MuiSelect-select': { py: 0.5, px: 1.5 },
        minWidth: 140,
      }}>
      {environments.map((env) => (
        <MenuItem key={env.id} value={env.id}>
          <Stack direction="row" alignItems="center" gap={0.75}>
            <EnvDot orgHandler={scope.org} orgUuid={orgUuid} componentId={component?.id ?? ''} versionId={selectedTrackId} envId={env.id} />
            {env.name}
          </Stack>
        </MenuItem>
      ))}
    </Select>
  );

  return (
    <Box sx={{ position: 'relative', overflow: 'hidden', flex: 1 }}>
      {tracks.length > 0 && <DeploymentTrackBar tracks={tracks} selectedId={selectedTrackId} onChange={setSelectedTrackId} orgHandler={scope.org} projectHandler={project?.handler ?? scope.project} componentHandler={component.handler} extra={envSelector} />}

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
                  ) : (
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
                        {TEST_KEY_HEADER}
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
            ) : !testable && selectedVisibility ? (
              <Alert severity="info">{selectedVisibility.label} endpoints are not publicly accessible.</Alert>
            ) : swaggerWithServer ? (
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
                      request.headers[TEST_KEY_HEADER] = securityHeaderRef.current;
                    }
                    return request;
                  }}
                />
              </Box>
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
