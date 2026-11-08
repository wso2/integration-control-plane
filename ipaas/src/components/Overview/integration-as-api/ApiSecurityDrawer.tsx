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

import { Alert, Box, Button, CircularProgress, Divider, DrawerPanel, FormControlLabel, MenuItem, Radio, RadioGroup, Select, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@wso2/oxygen-ui';
import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { API_KEY_SCHEME_DESCRIPTION, DEFAULT_API_KEY_HEADER, OAUTH_SCHEME_DESCRIPTION } from '../../../constants/apiConsumption';
import { useEndpointSecurity, useSetEndpointSecurity } from '../../../hooks/useConsumers';
import { Scopes } from '../../../constants/permissions';
import { useCan } from '../../../hooks/useCan';
import type { EndpointOption, SecurityConfig, SecurityMode } from '../../../types/consumers';
import type { Environment } from '../../../types/environment';
import { apiErrorMessage, httpStatusOf, isPermissionError } from '../../../utils/apiErrors';
import { endpointLoadNotice, friendlyApiError, readOnlyApiSettingsNotice } from '../../../utils/apiSecurity';
import { hasJwtFormErrors, jwtFormErrors, jwtFormOf, toJwtSecurity, type JwtForm } from '../../../utils/jwtSecurity';
import OAuthSettingsSection from './OAuthSettingsSection';
import { useEndpointDrawer } from './useEndpointDrawer';
import * as styles from './apiConsumption.styles';
import { useLeaveGuard, useUnsavedChanges } from '../../../contexts/UnsavedChangesContext';

const SAVE_FAILED = 'Could not save the security configuration.';

interface ApiSecurityDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Component name — the BFF's `componentName` path segment. */
  componentName: string;
  /** Environment name — the BFF's `environmentName` path segment. */
  envName: string;
  /** The environment's display name, for the note on where the change applies. */
  envLabel?: string;
  /** Environments to choose between, when more than one takes security changes; envName is the chosen one. */
  environments?: Environment[];
  onEnvironmentChange?: (envName: string) => void;
  /** Endpoints of this environment; the drawer configures one at a time. */
  endpoints: EndpointOption[];
  /** Endpoint selected when the drawer opens. */
  activeEndpointName?: string;
  /** The deployment track whose API is configured; absent means the default track. */
  deploymentTrackId?: string;
}

/** The configuration a save sends: PUT replaces it whole, so the jwt block always goes complete. */
function securityConfigOf(mode: SecurityMode, apiKeyHeader: string, jwtForm: JwtForm, issuers: string[] | undefined): SecurityConfig {
  if (mode === 'api-key') return { mode, apiKey: { header: apiKeyHeader.trim() || DEFAULT_API_KEY_HEADER } };
  if (mode === 'jwt') return { mode, jwt: toJwtSecurity(jwtForm, issuers) };
  return { mode: 'none' };
}

/**
 * Cloud-only "Configure security" drawer for one exposed endpoint API, in one environment: the
 * pipeline's entry environment, since later ones take the API only by promotion. Mirrors the APIM
 * SecurityDrawer's layout (endpoint selector + security-scheme table), with the OAuth options below
 * the table while OAuth is the scheme.
 */
export default function ApiSecurityDrawer({ open, onClose, componentName, envName, envLabel, environments, onEnvironmentChange, deploymentTrackId, endpoints, activeEndpointName }: ApiSecurityDrawerProps): JSX.Element {
  const canUpdate = useCan()(Scopes.ENDPOINT_UPDATE);
  const [mode, setMode] = useState<SecurityMode>('none');
  const [apiKeyHeader, setApiKeyHeader] = useState(DEFAULT_API_KEY_HEADER);
  const [jwtForm, setJwtForm] = useState<JwtForm>(() => jwtFormOf(undefined));
  const [error, setError] = useState<string | null>(null);

  const { selectedIdx, selectEndpoint, selectedEndpoint, endpointRef, syncKey } = useEndpointDrawer({ open, componentName, envName, deploymentTrackId, endpoints, activeEndpointName });

  const { data: security, isLoading: loadingSecurity, error: securityError } = useEndpointSecurity(endpointRef, open);
  const setSecurityMutation = useSetEndpointSecurity(endpointRef);
  const saving = setSecurityMutation.isPending;

  // Seed the form once per (endpoint, open), so later edits survive a refetch.
  const syncedRef = useRef('');
  useEffect(() => {
    if (!open) {
      syncedRef.current = '';
      return;
    }
    if (security && syncedRef.current !== syncKey) {
      syncedRef.current = syncKey;
      setMode(security.mode);
      setApiKeyHeader(security.apiKey?.header || DEFAULT_API_KEY_HEADER);
      setJwtForm(jwtFormOf(security.jwt));
      setError(null);
    }
  }, [open, security, syncKey]);

  const notice = endpointLoadNotice(securityError, {
    notExposed: 'This endpoint isn’t exposed as an API yet. Set its visibility to Public and deploy, then come back to configure security.',
    unavailable: 'API security isn’t available in this environment.',
    readFailed: 'Could not read the current security configuration.',
  });

  const readOnlyNotice = readOnlyApiSettingsNotice(security);
  const readOnly = readOnlyNotice !== null;

  const isApiKey = mode === 'api-key';
  const isOAuth = mode === 'jwt';
  const jwtErrors = useMemo(() => (isOAuth ? jwtFormErrors(jwtForm) : {}), [isOAuth, jwtForm]);
  const invalid = hasJwtFormErrors(jwtErrors);

  // Clicking the selected radio again clears back to `none` — the only way to open the API.
  const selectScheme = (scheme: Exclude<SecurityMode, 'none'>) => setMode((m) => (m === scheme ? 'none' : scheme));

  const issuers = security?.jwt?.issuers;
  const draft = securityConfigOf(mode, apiKeyHeader, jwtForm, issuers);
  const saved = useMemo(() => (security ? securityConfigOf(security.mode, security.apiKey?.header || DEFAULT_API_KEY_HEADER, jwtFormOf(security.jwt), security.jwt?.issuers) : null), [security]);

  const handleApply = async () => {
    if (!endpointRef || invalid) return;
    setError(null);
    try {
      await setSecurityMutation.mutateAsync(draft);
      onClose();
    } catch (err) {
      if (isPermissionError(err)) return;
      // A 400 names the value the gateway can't enforce, so the BFF's sentence is the useful part.
      setError(httpStatusOf(err) === 400 ? `${SAVE_FAILED} ${apiErrorMessage(err, 'Check the values and try again.')}` : friendlyApiError(err, SAVE_FAILED));
    }
  };

  useUnsavedChanges(open && !!saved && JSON.stringify(draft) !== JSON.stringify(saved));
  const guardNavigation = useLeaveGuard();

  const handleCancel = () =>
    guardNavigation(() => {
      setError(null);
      onClose();
    });

  return (
    <DrawerPanel open={open} onClose={handleCancel}>
      <DrawerPanel.Header>
        <DrawerPanel.Title>Configure security</DrawerPanel.Title>
        <DrawerPanel.Actions>
          <DrawerPanel.CloseButton />
        </DrawerPanel.Actions>
      </DrawerPanel.Header>

      <DrawerPanel.Body>
        {!selectedEndpoint ? (
          <Alert severity="info">No endpoint associated with this integration.</Alert>
        ) : (
          <Stack gap={2.5}>
            {error && <Alert severity="error">{error}</Alert>}
            {notice && !error && <Alert severity={notice.severity}>{notice.text}</Alert>}
            {readOnlyNotice && !notice && !error && <Alert severity="info">{readOnlyNotice}</Alert>}
            {envLabel && !readOnly && !notice && (
              <Typography variant="body2" color="text.secondary">
                Changes apply in <strong>{envLabel}</strong>. Promote to apply them to later environments.
              </Typography>
            )}

            {environments && onEnvironmentChange && (
              <Stack direction="row" alignItems="center" gap={2}>
                <Typography variant="body2" fontWeight={500}>
                  Environment:
                </Typography>
                <Select size="small" value={envName} onChange={(e) => guardNavigation(() => onEnvironmentChange(String(e.target.value)))} sx={styles.endpointSelect}>
                  {environments.map((env) => (
                    <MenuItem key={env.id} value={env.id}>
                      {env.name}
                    </MenuItem>
                  ))}
                </Select>
              </Stack>
            )}

            <Stack direction="row" alignItems="center" gap={2}>
              <Typography variant="body2" fontWeight={500}>
                Endpoints:
              </Typography>
              <Select size="small" value={selectedIdx} onChange={(e) => guardNavigation(() => selectEndpoint(Number(e.target.value)))} disabled={endpoints.length <= 1} sx={styles.endpointSelect}>
                {endpoints.map((ep, i) => (
                  <MenuItem key={ep.name} value={i}>
                    {ep.displayName}
                  </MenuItem>
                ))}
              </Select>
            </Stack>

            {loadingSecurity ? (
              <Box sx={styles.loadingRow}>
                <CircularProgress size={20} />
              </Box>
            ) : security?.stateUnknown ? null : (
              <>
                <RadioGroup value={mode} name="security-scheme">
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={styles.tableHeadCell}>Security scheme</TableCell>
                        <TableCell sx={styles.tableHeadCell}>Security header</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      <TableRow>
                        <TableCell sx={styles.schemeCell}>
                          <FormControlLabel value="api-key" control={<Radio checked={isApiKey} onClick={() => !readOnly && selectScheme('api-key')} size="small" disabled={readOnly} />} label="API key" disabled={readOnly} />
                        </TableCell>
                        <TableCell>
                          <TextField size="small" value={apiKeyHeader} onChange={(e) => setApiKeyHeader(e.target.value)} disabled={!isApiKey || readOnly} fullWidth inputProps={{ 'aria-label': 'API key header' }} />
                          <Typography variant="caption" color="text.secondary" sx={styles.schemeDescription}>
                            {API_KEY_SCHEME_DESCRIPTION}
                          </Typography>
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell sx={styles.schemeCell}>
                          <FormControlLabel value="jwt" control={<Radio checked={isOAuth} onClick={() => !readOnly && selectScheme('jwt')} size="small" disabled={readOnly} />} label="OAuth" disabled={readOnly} />
                        </TableCell>
                        <TableCell>
                          <TextField
                            size="small"
                            value={jwtForm.headerName}
                            onChange={(e) => setJwtForm({ ...jwtForm, headerName: e.target.value })}
                            disabled={!isOAuth || readOnly}
                            fullWidth
                            error={!!jwtErrors.headerName}
                            helperText={jwtErrors.headerName}
                            inputProps={{ 'aria-label': 'OAuth token header' }}
                          />
                          <Typography variant="caption" color="text.secondary" sx={styles.schemeDescription}>
                            {OAUTH_SCHEME_DESCRIPTION}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </RadioGroup>

                {isOAuth && (
                  <>
                    <Divider />
                    <OAuthSettingsSection value={jwtForm} onChange={setJwtForm} errors={jwtErrors} issuers={issuers} operations={security?.operations ?? []} disabled={readOnly || saving} />
                  </>
                )}
              </>
            )}
          </Stack>
        )}
      </DrawerPanel.Body>

      <DrawerPanel.Footer>
        <Button variant="outlined" color="inherit" onClick={handleCancel} disabled={saving}>
          Cancel
        </Button>
        {canUpdate && (
          <Button variant="contained" onClick={() => void handleApply()} disabled={saving || readOnly || invalid || !selectedEndpoint || loadingSecurity || Boolean(securityError)} startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}>
            {saving ? 'Applying…' : 'Apply'}
          </Button>
        )}
      </DrawerPanel.Footer>
    </DrawerPanel>
  );
}
