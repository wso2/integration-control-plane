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

import { Alert, Box, Button, Checkbox, Chip, CircularProgress, FormControlLabel, IconButton, InputAdornment, ListItemText, MenuItem, Select, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import TextField from '../../../components/common/TextField';
import { ArrowLeft, ArrowRight, Eye, EyeOff, Plus, Trash2 } from '@wso2/oxygen-ui-icons-react';
import { useMemo, useRef, useState, type JSX } from 'react';
import { useEnvTemplates } from '../../../hooks/useDeploymentPipelines';
import { THIRD_PARTY_DEFAULT_SERVICE_TYPE, THIRD_PARTY_SERVICE_TYPES } from '../../constants/thirdPartyServices';
import { encodeServiceDef, extractServerUrl } from '../../utils/thirdPartyServices';
import VerticalStepper from '../../../components/VerticalStepper';
import type { ConnectionParam, EndpointConfigDraft } from '../../../types/genaiServices';
import type { ThirdPartyServiceDraft } from '../../../types/thirdPartyServices';

interface ThirdPartyServiceWizardProps {
  orgHandle: string;
  submitting: boolean;
  submitError: string | null;
  onSubmit: (draft: ThirdPartyServiceDraft) => void;
  onCancel: () => void;
}

type EndpointRow = EndpointConfigDraft & { id: number };

const STEPS = ['General Details', 'Endpoint Configuration'];
const requiredSx = { '& .MuiFormLabel-asterisk': { color: 'error.main' } };

export default function ThirdPartyServiceWizard({ orgHandle, submitting, submitError, onSubmit, onCancel }: ThirdPartyServiceWizardProps): JSX.Element {
  const [step, setStep] = useState<0 | 1>(0);

  // Step 1 — general details + definition.
  const [name, setName] = useState('');
  const [version, setVersion] = useState('v1');
  const [summary, setSummary] = useState('');
  const [serviceType, setServiceType] = useState(THIRD_PARTY_DEFAULT_SERVICE_TYPE);
  const [serviceDefContent, setServiceDefContent] = useState('');
  const [fileName, setFileName] = useState('');
  const [fileError, setFileError] = useState<string | null>(null);
  /** Endpoint URL prefilled from the uploaded definition's `servers` entry. */
  const [defaultServiceUrl, setDefaultServiceUrl] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // Step 2 — endpoints.
  const rowId = useRef(1);
  const [endpoints, setEndpoints] = useState<EndpointRow[]>([{ id: 0, name: '', serviceUrl: '', params: [], environmentIds: [] }]);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());

  const { data: environments = [], isLoading: envLoading } = useEnvTemplates(orgHandle);
  const envName = (id: string) => environments.find((e) => e.id === id)?.env_name ?? id;

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setFileError(null);
    file
      .text()
      .then((text) => {
        setServiceDefContent(encodeServiceDef(text));
        setFileName(file.name);
        const serverUrl = extractServerUrl(text);
        if (serverUrl) {
          setDefaultServiceUrl(serverUrl);
          // Prefill any endpoint that hasn't had a URL typed yet.
          setEndpoints((rows) => rows.map((r) => (r.serviceUrl.trim() === '' ? { ...r, serviceUrl: serverUrl } : r)));
        }
      })
      .catch(() => setFileError('Could not read the selected file.'));
  };

  const patch = (id: number, p: Partial<EndpointRow>) => setEndpoints((rows) => rows.map((r) => (r.id === id ? { ...r, ...p } : r)));
  const setParams = (id: number, params: ConnectionParam[]) => patch(id, { params });
  const envsFor = (id: number) => environments.filter((env) => !endpoints.some((r) => r.id !== id && r.environmentIds.includes(env.id)));
  const allEnvsAssigned = environments.length > 0 && environments.every((env) => endpoints.some((r) => r.environmentIds.includes(env.id)));

  const step1Valid = name.trim() !== '';
  const endpointComplete = (r: EndpointRow) => r.name.trim() !== '' && r.serviceUrl.trim() !== '' && r.environmentIds.length > 0 && r.params.every((p) => p.key.trim() !== '' && p.value.trim() !== '');
  // Every visible row must be complete (no partially-filled row is silently dropped) and names unique.
  const canRegister = useMemo(() => endpoints.length > 0 && endpoints.every(endpointComplete) && new Set(endpoints.map((r) => r.name.trim())).size === endpoints.length, [endpoints]);

  const toggleReveal = (key: string) =>
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const register = () => {
    if (!canRegister || submitting) return;
    // canRegister guarantees every row is complete, so submit all of them.
    onSubmit({ name, version, summary, serviceType, serviceDefContent, endpoints: endpoints.map(({ id: _id, ...rest }) => rest) });
  };

  return (
    <Box>
      <Button variant="text" size="small" startIcon={<ArrowLeft size={16} />} onClick={onCancel} sx={{ px: 0, mb: 2 }}>
        Back to Services
      </Button>
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 3 }}>
        Register a Third Party Service
      </Typography>

      {submitError && (
        <Alert severity="error" sx={{ mb: 3, maxWidth: 900 }}>
          {submitError}
        </Alert>
      )}

      <Stack direction={{ xs: 'column', md: 'row' }} gap={4}>
        <Box sx={{ width: { xs: '100%', md: 260 }, flexShrink: 0 }}>
          <VerticalStepper activeStep={step} steps={STEPS} />
        </Box>

        <Box sx={{ flex: 1, maxWidth: 760 }}>
          {step === 0 && (
            <Stack gap={2.5}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: -1.5 }}>
                General Details
              </Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} gap={2}>
                <Box sx={{ flex: 1 }}>
                  <TextField label="Name" required fullWidth value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter service name" sx={requiredSx} />
                </Box>
                <Box sx={{ flex: 1 }}>
                  <TextField label="Version" fullWidth value={version} onChange={(e) => setVersion(e.target.value)} placeholder="v1" helperText="Optional" />
                </Box>
              </Stack>
              <TextField label="Summary" fullWidth multiline rows={2} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Enter service summary" helperText="Optional" />

              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  Service Definition
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  Provide the service definition file
                </Typography>
                <Stack direction="row" alignItems="center" gap={1.5}>
                  <Button variant="outlined" onClick={() => fileRef.current?.click()}>
                    Select a File
                  </Button>
                  {fileName && (
                    <Chip
                      label={fileName}
                      size="small"
                      onDelete={() => {
                        setFileName('');
                        setServiceDefContent('');
                      }}
                    />
                  )}
                  <input ref={fileRef} type="file" hidden accept=".json,.yaml,.yml,.graphql,.wsdl,.proto,.xml" onChange={onPickFile} aria-label="Select service definition file" />
                </Stack>
                {fileError && (
                  <Typography variant="caption" color="error" sx={{ display: 'block', mt: 0.5 }}>
                    {fileError}
                  </Typography>
                )}
              </Box>

              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                  Service Type
                </Typography>
                <Select fullWidth size="small" value={serviceType} onChange={(e) => setServiceType(e.target.value as string)} inputProps={{ 'aria-label': 'Service Type' }}>
                  {THIRD_PARTY_SERVICE_TYPES.map((t) => (
                    <MenuItem key={t.value} value={t.value}>
                      {t.label}
                    </MenuItem>
                  ))}
                </Select>
              </Box>
            </Stack>
          )}

          {step === 1 && (
            <>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.5 }}>
                Endpoint Configuration
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Define each endpoint with its URL, any connection parameters, and the environments it applies to.
              </Typography>
              {envLoading && <CircularProgress size={20} sx={{ display: 'block', my: 2 }} />}

              <Stack gap={2}>
                {endpoints.map((ep) => (
                  <Box key={ep.id} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 2 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {ep.name.trim() || 'Define New Endpoint'}
                      </Typography>
                      {endpoints.length > 1 && (
                        <Tooltip title="Remove endpoint">
                          <IconButton size="small" color="error" aria-label="Remove endpoint" onClick={() => setEndpoints((rows) => rows.filter((x) => x.id !== ep.id))}>
                            <Trash2 size={16} />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Stack>

                    <Stack gap={2}>
                      <TextField label="Name" required size="small" fullWidth value={ep.name} onChange={(e) => patch(ep.id, { name: e.target.value })} placeholder="ProdEndpoint" sx={requiredSx} />
                      <TextField label="Endpoint URL" required size="small" fullWidth value={ep.serviceUrl} onChange={(e) => patch(ep.id, { serviceUrl: e.target.value })} placeholder="https://api.provider.com/v1" sx={requiredSx} />

                      <Box>
                        <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                          Additional Parameters
                        </Typography>
                        <Stack gap={1.5}>
                          {ep.params.map((param, idx) => {
                            const revealKey = `${ep.id}:${idx}`;
                            const isRevealed = revealed.has(revealKey);
                            return (
                              <Stack key={idx} direction="row" alignItems="center" gap={1.5}>
                                <TextField
                                  size="small"
                                  placeholder="Name"
                                  value={param.key}
                                  onChange={(e) =>
                                    setParams(
                                      ep.id,
                                      ep.params.map((p, i) => (i === idx ? { ...p, key: e.target.value } : p)),
                                    )
                                  }
                                  sx={{ flex: '0 0 30%' }}
                                />
                                <TextField
                                  size="small"
                                  fullWidth
                                  placeholder="Value"
                                  type={param.isSensitive && !isRevealed ? 'password' : 'text'}
                                  value={param.value}
                                  onChange={(e) =>
                                    setParams(
                                      ep.id,
                                      ep.params.map((p, i) => (i === idx ? { ...p, value: e.target.value } : p)),
                                    )
                                  }
                                  InputProps={
                                    param.isSensitive
                                      ? {
                                          endAdornment: (
                                            <InputAdornment position="end">
                                              <IconButton size="small" aria-label={isRevealed ? 'Hide value' : 'Show value'} onClick={() => toggleReveal(revealKey)} edge="end">
                                                {isRevealed ? <EyeOff size={16} /> : <Eye size={16} />}
                                              </IconButton>
                                            </InputAdornment>
                                          ),
                                        }
                                      : undefined
                                  }
                                />
                                <FormControlLabel
                                  control={
                                    <Checkbox
                                      size="small"
                                      checked={param.isSensitive}
                                      onChange={(e) =>
                                        setParams(
                                          ep.id,
                                          ep.params.map((p, i) => (i === idx ? { ...p, isSensitive: e.target.checked } : p)),
                                        )
                                      }
                                    />
                                  }
                                  label="Secret"
                                />
                                <Tooltip title="Remove parameter">
                                  <IconButton
                                    size="small"
                                    color="error"
                                    aria-label={`Remove parameter ${idx + 1}`}
                                    onClick={() =>
                                      setParams(
                                        ep.id,
                                        ep.params.filter((_, i) => i !== idx),
                                      )
                                    }>
                                    <Trash2 size={16} />
                                  </IconButton>
                                </Tooltip>
                              </Stack>
                            );
                          })}
                          <Box>
                            <Button size="small" startIcon={<Plus size={16} />} onClick={() => setParams(ep.id, [...ep.params, { key: '', value: '', isSensitive: false }])}>
                              Add Parameter
                            </Button>
                          </Box>
                        </Stack>
                      </Box>

                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          Allowed Environments
                        </Typography>
                        <Select
                          multiple
                          fullWidth
                          size="small"
                          displayEmpty
                          disabled={!ep.name.trim()}
                          value={ep.environmentIds}
                          onChange={(e) => patch(ep.id, { environmentIds: typeof e.target.value === 'string' ? e.target.value.split(',') : (e.target.value as string[]) })}
                          renderValue={(sel) =>
                            (sel as string[]).length === 0 ? (
                              <Typography variant="body2" color="text.disabled">
                                Select environments
                              </Typography>
                            ) : (
                              <Stack direction="row" gap={0.5} flexWrap="wrap">
                                {(sel as string[]).map((id) => (
                                  <Chip key={id} label={envName(id)} size="small" />
                                ))}
                              </Stack>
                            )
                          }
                          sx={{ mt: 0.5 }}>
                          {envsFor(ep.id).map((env) => (
                            <MenuItem key={env.id} value={env.id}>
                              <Checkbox size="small" checked={ep.environmentIds.includes(env.id)} sx={{ p: 0, mr: 1 }} />
                              <ListItemText primary={env.env_name} />
                            </MenuItem>
                          ))}
                        </Select>
                      </Box>
                    </Stack>
                  </Box>
                ))}
              </Stack>

              <Tooltip title={allEnvsAssigned ? 'All environments are already assigned to an endpoint.' : ''}>
                <span>
                  <Button startIcon={<Plus size={18} />} disabled={allEnvsAssigned} onClick={() => setEndpoints((rows) => [...rows, { id: rowId.current++, name: '', serviceUrl: defaultServiceUrl, params: [], environmentIds: [] }])} sx={{ mt: 1.5 }}>
                    Add another endpoint
                  </Button>
                </span>
              </Tooltip>
            </>
          )}

          <Stack direction="row" gap={1.5} sx={{ mt: 4 }}>
            <Button variant="outlined" onClick={step === 0 ? onCancel : () => setStep(0)} disabled={submitting}>
              {step === 0 ? 'Cancel' : 'Back'}
            </Button>
            {step === 0 ? (
              <Button variant="contained" endIcon={<ArrowRight size={16} />} disabled={!step1Valid} onClick={() => setStep(1)}>
                Define Endpoints
              </Button>
            ) : (
              <Button variant="contained" disabled={!canRegister || submitting} startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : undefined} onClick={register}>
                {submitting ? 'Registering…' : 'Register'}
              </Button>
            )}
          </Stack>
        </Box>
      </Stack>
    </Box>
  );
}
