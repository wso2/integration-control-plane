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

import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  FormControl,
  FormControlLabel,
  FormLabel,
  Grid,
  IconButton,
  InputAdornment,
  MenuItem,
  Radio,
  RadioGroup,
  Stack,
  Tooltip,
  Typography,
  TextField,
} from '@wso2/oxygen-ui';
import { ArrowRight, ChevronDown, Copy, Eye, EyeOff, Pencil, Plus, RefreshCw, Trash2 } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useMemo, useState, type JSX } from 'react';
import StatusDot from '../_shared/StatusDot';
import { useOrgUuid } from '../../../hooks/useOrgUuid';
import { useComponentDeployment, useEnvEndpoints } from '../../../hooks/useDeployments';
import { useByoiEndpointsYaml, useRedeployTailscale, useSaveAndDeployTailscale, useTailscaleConfigMapDetails, useTailscaleConfigMaps, useTailscaleRelease, useTailscaleSecrets } from '../../../hooks/useTailscale';
import { OAUTH_CLIENT_SECRET } from '../../../constants/tailscale';
import type { TailscaleAuthMethod, TailscalePortMapping } from '../../../types/tailscale';
import type { Environment } from '../../../types/environment';
import { deploymentPollInterval } from '../../../utils/deploymentStatus';
import { joinPortMappings, safeAtob, tailscaleConfigMapName, tailscaleSecretName } from '../../../utils/tailscale';

interface TailscaleEnvCardProps {
  orgHandler: string;
  projectId: string;
  component: { id: string; handler: string };
  versionId: string;
  env: Environment;
  canManage: boolean;
}

const emptyForm: TailscalePortMapping = { name: '', port: 0, ip: '', targetPort: 0 };

export default function TailscaleEnvCard({ orgHandler, projectId, component, versionId, env, canManage }: TailscaleEnvCardProps): JSX.Element {
  const orgUuid = useOrgUuid();

  const { data: deployment } = useComponentDeployment(orgHandler, orgUuid ?? '', component.id, versionId, env.id, {
    refetchInterval: (query) => deploymentPollInterval(query.state.data?.deploymentStatusV2, 3000),
  });
  const releaseId = deployment?.releaseId ?? '';
  const status = deployment?.deploymentStatusV2 ?? 'NOT_DEPLOYED';

  const secretName = tailscaleSecretName(component.handler, env.name);
  const configMapName = tailscaleConfigMapName(component.handler, env.name);

  const { data: secrets = [] } = useTailscaleSecrets(projectId, env.id);
  const existingSecret = useMemo(() => secrets.find((s) => s.name === secretName), [secrets, secretName]);
  const configuredAuthMethod: TailscaleAuthMethod | null = existingSecret ? (existingSecret.keys?.includes(OAUTH_CLIENT_SECRET) ? 'clientSecret' : 'authKey') : null;

  const { data: configMaps = [] } = useTailscaleConfigMaps(projectId, env.id);
  const existingConfigMap = useMemo(() => configMaps.find((c) => c.name === configMapName), [configMaps, configMapName]);
  const { data: configMapDetails } = useTailscaleConfigMapDetails(projectId, env.id, existingConfigMap?.ID);
  const { data: byoi } = useByoiEndpointsYaml(projectId, component.id, releaseId);
  const { data: release } = useTailscaleRelease(projectId, component.id, releaseId);
  const { data: endpoints = [] } = useEnvEndpoints(component.id, versionId, releaseId);

  const endpointsYaml = byoi?.endpointYaml?.data ? safeAtob(byoi.endpointYaml.data) : '';
  const configYaml = configMapDetails?.data?.['config.yaml'];
  const savedMappings = useMemo(() => joinPortMappings(endpointsYaml, configYaml), [endpointsYaml, configYaml]);

  // ── editable state ──
  const [mappings, setMappings] = useState<TailscalePortMapping[]>([]);
  const [authMethod, setAuthMethod] = useState<TailscaleAuthMethod>('authKey');
  const [authKey, setAuthKey] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [form, setForm] = useState<TailscalePortMapping>(emptyForm);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Sync the editable list + configured auth method once the saved config loads.
  useEffect(() => setMappings(savedMappings), [savedMappings]);
  useEffect(() => {
    if (configuredAuthMethod) setAuthMethod(configuredAuthMethod);
  }, [configuredAuthMethod]);

  const saveAndDeploy = useSaveAndDeployTailscale(projectId);
  const redeploy = useRedeployTailscale();

  // Tailscale URL (protocol + selected endpoint), like Devant.
  const hostName = endpoints[0]?.hostName ?? '';
  const namespace = release?.environment?.namespaces?.[0]?.name ?? '';
  const [protocol, setProtocol] = useState<'http' | 'https'>('http');
  const [selectedPort, setSelectedPort] = useState<number | ''>('');
  // Keep the selected endpoint pointing at a port that still exists; reset to the
  // first mapping (or none) when the current selection is removed or unset.
  useEffect(() => {
    const valid = selectedPort !== '' && mappings.some((m) => m.port === selectedPort);
    if (!valid) setSelectedPort(mappings[0]?.port ?? '');
  }, [mappings, selectedPort]);
  const tailscaleUrl = hostName && namespace ? `${protocol}://${hostName}.${namespace}.svc.cluster.local${selectedPort ? `:${selectedPort}` : ''}` : '';

  const formValid = form.name.trim() && form.port > 0 && form.ip.trim() && form.targetPort > 0;
  const saving = saveAndDeploy.isPending;

  const resetForm = () => {
    setForm(emptyForm);
    setEditingIndex(null);
  };

  const commitForm = () => {
    if (!formValid) return;
    setMappings((prev) => {
      if (editingIndex !== null) return prev.map((m, i) => (i === editingIndex ? form : m));
      return [...prev, form];
    });
    resetForm();
  };

  const handleSave = () => {
    if (!releaseId) {
      setAlert({ type: 'error', message: 'This environment has no release yet. Build/deploy the proxy first.' });
      return;
    }
    saveAndDeploy.mutate(
      { componentId: component.id, handle: component.handler, envId: env.id, envName: env.name, releaseId, authMethod, authKey, clientSecret, mappings },
      {
        onSuccess: () => {
          setAuthKey('');
          setClientSecret('');
          setAlert({ type: 'success', message: `Saved Tailscale configuration for ${env.name}.` });
        },
        onError: (e) => setAlert({ type: 'error', message: e instanceof Error ? e.message : 'Save failed.' }),
      },
    );
  };

  const copyUrl = () => {
    navigator.clipboard.writeText(tailscaleUrl).catch(() => setAlert({ type: 'error', message: 'Failed to copy the URL to the clipboard.' }));
  };

  return (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Stack direction="row" alignItems="center" gap={2} sx={{ mb: 1.5 }}>
          <Typography variant="h6">{env.name}</Typography>
          <StatusDot status={status} />
          {canManage && releaseId && (
            <Button
              sx={{ ml: 'auto' }}
              size="small"
              variant="outlined"
              startIcon={redeploy.isPending ? <CircularProgress size={14} color="inherit" /> : <RefreshCw size={14} />}
              disabled={redeploy.isPending}
              onClick={() => redeploy.mutate({ componentId: component.id, releaseId }, { onError: (e) => setAlert({ type: 'error', message: e instanceof Error ? e.message : 'Re-deploy failed.' }) })}>
              {redeploy.isPending ? 'Deploying…' : 'Re-deploy'}
            </Button>
          )}
        </Stack>
        <Divider sx={{ mb: 2 }} />

        {alert && (
          <Alert severity={alert.type} onClose={() => setAlert(null)} sx={{ mb: 2 }}>
            {alert.message}
          </Alert>
        )}

        {/* Tailscale URL */}
        {hostName && namespace && (
          <Box sx={{ mb: 2 }}>
            <Stack direction="row" gap={2} alignItems="flex-end" flexWrap="wrap">
              <TextField labelPlacement="top" select size="small" label="Protocol" value={protocol} onChange={(e) => setProtocol(e.target.value as 'http' | 'https')} sx={{ width: 120 }}>
                <MenuItem value="http">HTTP</MenuItem>
                <MenuItem value="https">HTTPS</MenuItem>
              </TextField>
              {mappings.length > 0 && (
                <TextField labelPlacement="top" select size="small" label="Endpoint" value={selectedPort === '' ? '' : String(selectedPort)} onChange={(e) => setSelectedPort(Number(e.target.value))} sx={{ minWidth: 200 }}>
                  {mappings.map((m, idx) => (
                    <MenuItem key={`${m.port}-${idx}`} value={String(m.port)}>
                      {m.name} (:{m.port})
                    </MenuItem>
                  ))}
                </TextField>
              )}
              <TextField
                labelPlacement="top"
                size="small"
                label="Tailscale URL"
                value={tailscaleUrl}
                fullWidth
                sx={{ flex: 1, minWidth: 240 }}
                InputProps={{
                  readOnly: true,
                  endAdornment: (
                    <InputAdornment position="end">
                      <Tooltip title="Copy">
                        <IconButton size="small" onClick={copyUrl}>
                          <Copy size={14} />
                        </IconButton>
                      </Tooltip>
                    </InputAdornment>
                  ),
                }}
              />
            </Stack>
            <Divider sx={{ mt: 2 }} />
          </Box>
        )}

        {/* Authentication */}
        <Accordion disableGutters defaultExpanded={!configuredAuthMethod} sx={{ mb: 1 }}>
          <AccordionSummary expandIcon={<ChevronDown size={18} />}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ width: '100%', pr: 2 }}>
              <Typography variant="subtitle1">Authentication Configuration</Typography>
              {configuredAuthMethod && <Chip size="small" variant="outlined" color="primary" label={configuredAuthMethod === 'clientSecret' ? 'OAuth Client Secret' : 'Auth Key'} />}
            </Stack>
          </AccordionSummary>
          <AccordionDetails>
            <FormControl disabled={!canManage}>
              <FormLabel>Authentication Method</FormLabel>
              <RadioGroup
                row
                value={authMethod}
                onChange={(e) => {
                  const m = e.target.value as TailscaleAuthMethod;
                  setAuthMethod(m);
                  if (m === 'authKey') setClientSecret('');
                  else setAuthKey('');
                }}>
                <FormControlLabel value="authKey" control={<Radio size="small" />} label="Tailscale Auth Key" />
                <FormControlLabel value="clientSecret" control={<Radio size="small" />} label="OAuth Client Secret" />
              </RadioGroup>
            </FormControl>
            {authMethod === 'authKey' && (
              <Alert severity="warning" sx={{ my: 1 }}>
                Auth keys expire. For production, consider an OAuth client secret, which does not expire.
              </Alert>
            )}
            <TextField
              labelPlacement="top"
              fullWidth
              size="small"
              sx={{ mt: 1 }}
              disabled={!canManage || saving}
              type={showSecret ? 'text' : 'password'}
              label={authMethod === 'authKey' ? 'Tailscale Auth Key' : 'OAuth Client Secret'}
              value={authMethod === 'authKey' ? authKey : clientSecret}
              onChange={(e) => (authMethod === 'authKey' ? setAuthKey(e.target.value) : setClientSecret(e.target.value))}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setShowSecret((s) => !s)}>
                      {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
          </AccordionDetails>
        </Accordion>

        {/* Endpoint configurations */}
        <Accordion disableGutters defaultExpanded>
          <AccordionSummary expandIcon={<ChevronDown size={18} />}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ width: '100%', pr: 2 }}>
              <Typography variant="subtitle1">Endpoint Configurations</Typography>
              {mappings.length > 0 && <Chip size="small" variant="outlined" color="primary" label={`${mappings.length} endpoint${mappings.length === 1 ? '' : 's'}`} />}
            </Stack>
          </AccordionSummary>
          <AccordionDetails>
            {mappings.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
                No endpoints configured yet.
              </Typography>
            ) : (
              <Stack divider={<Divider />} sx={{ mb: 1 }}>
                <Grid container sx={{ py: 0.5, fontWeight: 600 }}>
                  <Grid size={{ xs: 3 }}>
                    <Typography variant="caption">Name</Typography>
                  </Grid>
                  <Grid size={{ xs: 2 }}>
                    <Typography variant="caption">Port</Typography>
                  </Grid>
                  <Grid size={{ xs: 1 }} />
                  <Grid size={{ xs: 3 }}>
                    <Typography variant="caption">Device IP</Typography>
                  </Grid>
                  <Grid size={{ xs: 2 }}>
                    <Typography variant="caption">Device Port</Typography>
                  </Grid>
                  <Grid size={{ xs: 1 }} />
                </Grid>
                {mappings.map((m, idx) => (
                  <Grid container alignItems="center" key={`${m.port}-${idx}`} sx={{ py: 0.5 }}>
                    <Grid size={{ xs: 3 }}>
                      <Typography variant="body2">{m.name}</Typography>
                    </Grid>
                    <Grid size={{ xs: 2 }}>
                      <Typography variant="body2">{m.port}</Typography>
                    </Grid>
                    <Grid size={{ xs: 1 }}>
                      <ArrowRight size={14} />
                    </Grid>
                    <Grid size={{ xs: 3 }}>
                      <Typography variant="body2" color={m.ip ? 'text.primary' : 'error'}>
                        {m.ip || 'Missing'}
                      </Typography>
                    </Grid>
                    <Grid size={{ xs: 2 }}>
                      <Typography variant="body2" color={m.targetPort ? 'text.primary' : 'error'}>
                        {m.targetPort || 'Missing'}
                      </Typography>
                    </Grid>
                    <Grid size={{ xs: 1 }}>
                      {canManage && (
                        <Stack direction="row">
                          <IconButton
                            size="small"
                            aria-label={`Edit ${m.name}`}
                            onClick={() => {
                              setForm(m);
                              setEditingIndex(idx);
                            }}>
                            <Pencil size={14} />
                          </IconButton>
                          <IconButton size="small" color="error" aria-label={`Remove ${m.name}`} onClick={() => setMappings((prev) => prev.filter((_, i) => i !== idx))}>
                            <Trash2 size={14} />
                          </IconButton>
                        </Stack>
                      )}
                    </Grid>
                  </Grid>
                ))}
              </Stack>
            )}

            {canManage && (
              <Box sx={{ mt: 2, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  {editingIndex !== null ? 'Edit endpoint' : 'Add endpoint'}
                </Typography>
                <Grid container spacing={1} alignItems="center">
                  <Grid size={{ xs: 3 }}>
                    <TextField labelPlacement="top" size="small" required fullWidth label="Name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                  </Grid>
                  <Grid size={{ xs: 2 }}>
                    <TextField labelPlacement="top" size="small" required fullWidth type="number" label="Port" value={form.port || ''} onChange={(e) => setForm((f) => ({ ...f, port: Number(e.target.value) }))} />
                  </Grid>
                  <Grid size={{ xs: 1 }} sx={{ textAlign: 'center' }}>
                    <ArrowRight size={16} />
                  </Grid>
                  <Grid size={{ xs: 3 }}>
                    <TextField labelPlacement="top" size="small" required fullWidth label="Device IP" value={form.ip} onChange={(e) => setForm((f) => ({ ...f, ip: e.target.value }))} />
                  </Grid>
                  <Grid size={{ xs: 2 }}>
                    <TextField labelPlacement="top" size="small" required fullWidth type="number" label="Device Port" value={form.targetPort || ''} onChange={(e) => setForm((f) => ({ ...f, targetPort: Number(e.target.value) }))} />
                  </Grid>
                  <Grid size={{ xs: 1 }}>
                    <Stack direction="row">
                      <Tooltip title={editingIndex !== null ? 'Update' : 'Add'}>
                        <span>
                          <IconButton size="small" color="primary" disabled={!formValid} onClick={commitForm} aria-label={editingIndex !== null ? 'Update endpoint' : 'Add endpoint'}>
                            {editingIndex !== null ? <Pencil size={16} /> : <Plus size={16} />}
                          </IconButton>
                        </span>
                      </Tooltip>
                      {editingIndex !== null && (
                        <Button size="small" onClick={resetForm}>
                          Cancel
                        </Button>
                      )}
                    </Stack>
                  </Grid>
                </Grid>
              </Box>
            )}
          </AccordionDetails>
        </Accordion>

        {canManage && (
          <Box sx={{ mt: 2 }}>
            <Button variant="contained" onClick={handleSave} disabled={saving} startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}>
              {saving ? 'Applying…' : 'Save & Deploy'}
            </Button>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
