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

import { Alert, Box, Button, Checkbox, CircularProgress, Collapse, Divider, Drawer, FormControlLabel, IconButton, InputAdornment, MenuItem, Select, Stack, Switch, Table, TableBody, TableCell, TableHead, TableRow, Tooltip, Typography } from '@wso2/oxygen-ui';
import TextField from '../../components/common/TextField';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ChevronsLeft, ChevronsRight, Plus, Search, X } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useMemo, useState } from 'react';
import { useComponentEndpoints } from '../../hooks/useComponents';
import { useApimApi, useUpdateApimApi } from '../../hooks/useApim';

const OAUTH2 = 'oauth2';
const API_KEY = 'api_key';
const ITEMS_PER_PAGE = 5;

const METHOD_COLORS: Record<string, { badgeBg: string }> = {
  GET: { badgeBg: '#0095FF' },
  POST: { badgeBg: '#36B475' },
  PUT: { badgeBg: '#FF9D52' },
  DELETE: { badgeBg: '#FE523C' },
  PATCH: { badgeBg: '#01CEB5' },
  OPTIONS: { badgeBg: '#0566C8' },
  HEAD: { badgeBg: '#7B55D5' },
};
const DEFAULT_METHOD_COLORS = { badgeBg: '#9e9e9e' };

interface SecurityDrawerProps {
  open: boolean;
  onClose: () => void;
  apimId: string | null | undefined;
  componentId?: string;
  versionId?: string;
}

export default function SecurityDrawer({ open, onClose, apimId, componentId, versionId }: SecurityDrawerProps) {
  const updateMutation = useUpdateApimApi();
  const saving = updateMutation.isPending;
  const [error, setError] = useState<string | null>(null);

  const [securityScheme, setSecurityScheme] = useState<string[]>(['oauth2']);
  const [authHeader, setAuthHeader] = useState('Authorization');
  const [apiKeyHeader, setApiKeyHeader] = useState('api-key');
  const [backendJwt, setBackendJwt] = useState(false);
  const [userSelectedIdx, setUserSelectedIdx] = useState<number | null>(null);
  const [wasOpen, setWasOpen] = useState(false);
  const [operationSearch, setOperationSearch] = useState('');
  const [page, setPage] = useState(1);
  const [expandedOps, setExpandedOps] = useState<Set<string>>(new Set());
  const [operationAuthTypes, setOperationAuthTypes] = useState<Record<string, string>>({});

  const { data: endpoints = [] } = useComponentEndpoints(componentId ?? '', versionId ?? '');

  // The backend returns one entry per network visibility, so a single endpoint appears
  // multiple times with the same apimId — collapse to one entry per API for the dropdown.
  const uniqueEndpoints = useMemo(() => {
    const seen = new Set<string>();
    return endpoints.filter((ep) => {
      const key = ep.apimId ?? ep.displayName;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [endpoints]);

  // Each open defaults the selection to the endpoint matching the requested API (reset during render).
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setUserSelectedIdx(null);
  }

  // The active endpoint drives which API is loaded/configured; derived synchronously so the
  // drawer opens with the correct API id in the first render (no stale fetch, no correcting effect).
  const matchedIdx = useMemo(() => {
    const i = uniqueEndpoints.findIndex((ep) => ep.apimId === apimId);
    return i >= 0 ? i : 0;
  }, [uniqueEndpoints, apimId]);
  const selectedEndpointIdx = userSelectedIdx ?? matchedIdx;
  const effectiveApimId = uniqueEndpoints[selectedEndpointIdx]?.apimId ?? apimId;
  const { data: api = null, isLoading: loading } = useApimApi(open ? effectiveApimId : null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setOperationSearch('');
    setPage(1);
    setExpandedOps(new Set());
    if (api) {
      setSecurityScheme(api.securityScheme ?? ['oauth2']);
      setAuthHeader(api.authorizationHeader ?? 'Authorization');
      setApiKeyHeader(api.apiKeyHeader ?? 'api-key');
      setBackendJwt(api.enableBackendJWT ?? false);
      const ops = api.operations ?? [];
      const authTypes: Record<string, string> = {};
      ops.forEach((op) => {
        const key = `${op.verb.toUpperCase()}-${op.target}`;
        authTypes[key] = op.authType ?? 'Application & Application User';
      });
      setOperationAuthTypes(authTypes);
    } else {
      setOperationAuthTypes({});
    }
  }, [open, effectiveApimId, api]);

  const toggleScheme = (scheme: string) => {
    setSecurityScheme((prev) => (prev.includes(scheme) ? prev.filter((s) => s !== scheme) : [...prev, scheme]));
  };

  const handleApply = async () => {
    if (!effectiveApimId || !api) return;
    setError(null);
    const updatedOperations = (api.operations ?? []).map((op) => {
      const key = `${op.verb.toUpperCase()}-${op.target}`;
      return { ...op, authType: operationAuthTypes[key] ?? op.authType };
    });
    try {
      await updateMutation.mutateAsync({
        apimId: effectiveApimId,
        body: { ...api, securityScheme, authorizationHeader: authHeader, apiKeyHeader, enableBackendJWT: backendJwt, operations: updatedOperations },
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save security configuration. Please try again.');
    }
  };

  const handleCancel = () => {
    if (api) {
      setSecurityScheme(api.securityScheme ?? ['oauth2']);
      setAuthHeader(api.authorizationHeader ?? 'Authorization');
      setApiKeyHeader(api.apiKeyHeader ?? 'api-key');
      setBackendJwt(api.enableBackendJWT ?? false);
    }
    setError(null);
    setOperationSearch('');
    setPage(1);
    onClose();
  };

  const isOAuth2 = securityScheme.includes(OAUTH2);
  const isApiKey = securityScheme.includes(API_KEY);
  const isSecurityDisabled = !isOAuth2 && !isApiKey;

  const operations = api?.operations ?? [];
  const filteredOps = useMemo(() => (api?.operations ?? []).filter((op) => op.target.toLowerCase().includes(operationSearch.toLowerCase()) || op.verb.toLowerCase().includes(operationSearch.toLowerCase())), [api?.operations, operationSearch]);
  const totalPages = Math.max(1, Math.ceil(filteredOps.length / ITEMS_PER_PAGE));
  const pagedOps = filteredOps.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);
  const scopes = api?.scopes ?? [];

  return (
    <Drawer anchor="right" open={open} onClose={handleCancel} PaperProps={{ sx: { width: 960 } }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Header */}
        <Box sx={{ px: 3, py: 2, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h5">Configure Security</Typography>
          <IconButton size="small" onClick={handleCancel}>
            <X size={16} />
          </IconButton>
        </Box>

        {/* Content */}
        <Box sx={{ flex: 1, overflow: 'auto', px: 3, py: 2 }}>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', pt: 6 }}>
              <CircularProgress />
            </Box>
          ) : !effectiveApimId ? (
            <Alert severity="info">No API associated with this component.</Alert>
          ) : (
            <Stack gap={2.5}>
              {error && <Alert severity="error">{error}</Alert>}

              {/* Note */}
              <Typography variant="body2">
                <strong>Note:</strong> Deploy the integration after applying changes for the configuration to take effect.
              </Typography>

              {/* Endpoints dropdown */}
              {uniqueEndpoints.length > 0 && (
                <Stack direction="row" alignItems="center" gap={2}>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    Endpoints:
                  </Typography>
                  <Select size="small" value={selectedEndpointIdx} onChange={(e) => setUserSelectedIdx(Number(e.target.value))} disabled={uniqueEndpoints.length <= 1} sx={{ minWidth: 200 }}>
                    {uniqueEndpoints.map((ep, i) => (
                      <MenuItem key={ep.apimId ?? ep.displayName} value={i}>
                        {ep.displayName}
                      </MenuItem>
                    ))}
                  </Select>
                </Stack>
              )}

              {/* Security Scheme Table */}
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ color: 'text.secondary', fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Security Scheme</TableCell>
                    <TableCell sx={{ color: 'text.secondary', fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Security Header</TableCell>
                    <TableCell sx={{ color: 'text.secondary', fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Description</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  <TableRow>
                    <TableCell>
                      <FormControlLabel control={<Checkbox checked={isApiKey} onChange={() => toggleScheme(API_KEY)} size="small" />} label="API Key" />
                    </TableCell>
                    <TableCell>
                      <TextField size="small" value={apiKeyHeader} onChange={(e) => setApiKeyHeader(e.target.value)} disabled={!isApiKey} fullWidth />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        Secure your API with API Key protocol.
                      </Typography>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>
                      <FormControlLabel control={<Checkbox checked={isOAuth2} onChange={() => toggleScheme(OAUTH2)} size="small" />} label="OAuth2" />
                    </TableCell>
                    <TableCell>
                      <TextField size="small" value={authHeader} onChange={(e) => setAuthHeader(e.target.value)} disabled={!isOAuth2} fullWidth />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        Secure your API with OAuth 2 protocol.
                      </Typography>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>

              {/* Backend JWT */}
              {!isSecurityDisabled && <FormControlLabel control={<Checkbox checked={backendJwt} onChange={() => setBackendJwt((v) => !v)} size="small" />} label="Pass end-user attributes to upstream" />}

              {/* Resources */}
              {operations.length > 0 && (
                <>
                  <Divider />
                  <Typography variant="h6">Resources</Typography>
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 2, alignItems: 'start' }}>
                    {/* Operations list */}
                    <Stack gap={1}>
                      <TextField
                        size="small"
                        placeholder="Search Operations"
                        value={operationSearch}
                        onChange={(e) => {
                          setOperationSearch(e.target.value);
                          setPage(1);
                        }}
                        InputProps={{
                          startAdornment: (
                            <InputAdornment position="start">
                              <Search size={14} />
                            </InputAdornment>
                          ),
                        }}
                        fullWidth
                        sx={{ bgcolor: 'action.hover', borderRadius: 1 }}
                      />
                      <Stack gap={0.75}>
                        {pagedOps.map((op) => {
                          const verb = op.verb.toUpperCase();
                          const key = `${verb}-${op.target}`;
                          const colors = METHOD_COLORS[verb] ?? DEFAULT_METHOD_COLORS;
                          const isExpanded = expandedOps.has(key);
                          const toggle = () =>
                            setExpandedOps((prev) => {
                              const next = new Set(prev);
                              if (next.has(key)) next.delete(key);
                              else next.add(key);
                              return next;
                            });
                          return (
                            <Box key={key} sx={{ border: `0.5px solid ${colors.badgeBg}`, borderRadius: 0.5, overflow: 'hidden' }}>
                              <Stack direction="row" alignItems="center" gap={1.5} onClick={toggle} sx={{ px: 1, py: 0.75, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}>
                                <Box sx={{ bgcolor: colors.badgeBg, color: '#fff', fontWeight: 700, fontSize: '11px', minWidth: 64, px: 1, py: 0.5, borderRadius: 0.5, textAlign: 'center', flexShrink: 0 }}>{verb}</Box>
                                <Typography sx={{ flex: 1, fontSize: '13px', fontWeight: 500, fontFamily: 'monospace', color: '#222228', wordBreak: 'break-word' }}>{op.target}</Typography>
                                {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                              </Stack>
                              <Collapse in={isExpanded}>
                                <Box sx={{ px: 2, py: 1.5, borderTop: `0.5px solid ${colors.badgeBg}`, bgcolor: 'background.default' }}>
                                  <Stack gap={1.5}>
                                    {/* Security toggle */}
                                    <Stack direction="row" alignItems="center" gap={1}>
                                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                        Security
                                      </Typography>
                                      <Tooltip title="Enable or disable security for this resource">
                                        <Box component="span" sx={{ fontSize: 12, color: 'text.secondary', cursor: 'help' }}>
                                          ?
                                        </Box>
                                      </Tooltip>
                                      <Switch
                                        size="small"
                                        checked={(operationAuthTypes[key] ?? 'Application & Application User') !== 'None'}
                                        onChange={(e) =>
                                          setOperationAuthTypes((prev) => ({
                                            ...prev,
                                            [key]: e.target.checked ? 'Application & Application User' : 'None',
                                          }))
                                        }
                                        color="primary"
                                      />
                                    </Stack>
                                    {/* Permissions (Scopes) */}
                                    <Stack gap={0.5}>
                                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                        Permissions (Scopes)
                                      </Typography>
                                      {op.scopes?.length ? (
                                        <Stack direction="row" flexWrap="wrap" gap={0.5} sx={{ mt: 0.5 }}>
                                          {op.scopes.map((s) => (
                                            <Box key={s} sx={{ bgcolor: 'action.selected', borderRadius: 0.75, px: 1, py: 0.25, fontSize: '0.75rem' }}>
                                              {s}
                                            </Box>
                                          ))}
                                        </Stack>
                                      ) : (
                                        <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.8rem' }}>
                                          No permissions added
                                        </Typography>
                                      )}
                                    </Stack>
                                  </Stack>
                                </Box>
                              </Collapse>
                            </Box>
                          );
                        })}
                      </Stack>
                      {/* Pagination */}
                      {filteredOps.length > ITEMS_PER_PAGE && (
                        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mt: 0.5 }}>
                          <Typography variant="caption" color="text.secondary">
                            {(page - 1) * ITEMS_PER_PAGE + 1} - {Math.min(page * ITEMS_PER_PAGE, filteredOps.length)} of {filteredOps.length}
                          </Typography>
                          <Stack direction="row" alignItems="center" gap={0.25}>
                            <IconButton size="small" onClick={() => setPage(1)} disabled={page === 1}>
                              <ChevronsLeft size={14} />
                            </IconButton>
                            <IconButton size="small" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                              <ChevronLeft size={14} />
                            </IconButton>
                            <IconButton size="small" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                              <ChevronRight size={14} />
                            </IconButton>
                            <IconButton size="small" onClick={() => setPage(totalPages)} disabled={page === totalPages}>
                              <ChevronsRight size={14} />
                            </IconButton>
                          </Stack>
                        </Stack>
                      )}
                    </Stack>

                    {/* Permissions List */}
                    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 2 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600, mb: 2 }}>
                        Permissions List
                      </Typography>
                      <Stack alignItems="center" gap={1.5} sx={{ py: 1 }}>
                        {scopes.length === 0 ? (
                          <>
                            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', fontSize: '0.8rem' }}>
                              You don't have any permissions (scopes) defined as yet
                            </Typography>
                            <Button variant="contained" size="small" startIcon={<Plus size={13} />}>
                              Add Permission (Scope)
                            </Button>
                          </>
                        ) : (
                          <Stack gap={0.5} sx={{ width: '100%' }}>
                            {scopes.map((s, i) => (
                              <Typography key={i} variant="body2">
                                {s.scope?.name}
                              </Typography>
                            ))}
                          </Stack>
                        )}
                      </Stack>
                    </Box>
                  </Box>
                </>
              )}
            </Stack>
          )}
        </Box>

        {/* Footer */}
        <Box sx={{ px: 3, py: 2, borderTop: '1px solid', borderColor: 'divider', display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
          <Button variant="outlined" onClick={handleCancel} disabled={saving}>
            Cancel
          </Button>
          <Button variant="contained" onClick={() => void handleApply()} disabled={saving || loading || !effectiveApimId}>
            {saving ? <CircularProgress size={16} color="inherit" /> : 'Apply'}
          </Button>
        </Box>
      </Box>
    </Drawer>
  );
}
