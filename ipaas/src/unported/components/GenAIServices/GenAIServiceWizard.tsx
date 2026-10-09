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

import { Alert, Box, Button, Checkbox, Chip, CircularProgress, IconButton, InputAdornment, ListItemText, MenuItem, Select, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import TextField from '../../../components/common/TextField';
import { Eye, EyeOff, Plus, Trash2 } from '@wso2/oxygen-ui-icons-react';
import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { useProviderTemplate, useProviderTemplates } from '../../hooks/useGenaiServices';
import { useEnvTemplates } from '../../../hooks/useDeploymentPipelines';
import { GENAI_LOGO_BASE, GENAI_PROVIDER_META, SERVICE_URL_FIELD } from '../../../constants/genaiServices';
import { templateToDraft } from '../../utils/genaiServices';
import VerticalStepper from '../../../components/VerticalStepper';
import type { ConnectionSchemaEntry, CreateGenAiServiceArgs } from '../../../types/genaiServices';

interface GenAIServiceWizardProps {
  orgHandle: string;
  submitting: boolean;
  submitError: string | null;
  onSubmit: (args: CreateGenAiServiceArgs) => void;
  onCancel: () => void;
}

interface EndpointRow {
  id: number;
  name: string;
  environmentIds: string[];
  values: Record<string, string>;
}

const STEPS = ['Select service provider', 'Register service', 'Add endpoints'];
const requiredSx = { '& .MuiFormLabel-asterisk': { color: 'error.main' } };
const LOGO_BASE = `${import.meta.env.BASE_URL}${GENAI_LOGO_BASE}`;

export default function GenAIServiceWizard({ orgHandle, submitting, submitError, onSubmit, onCancel }: GenAIServiceWizardProps): JSX.Element {
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');

  // Step-2 details.
  const [name, setName] = useState('');
  const [version, setVersion] = useState('');
  const [summary, setSummary] = useState('');
  const [serviceUrl, setServiceUrl] = useState('');

  // Derived from the chosen provider template.
  const [connectionEntries, setConnectionEntries] = useState<ConnectionSchemaEntry[]>([]);
  const [serviceDefContent, setServiceDefContent] = useState('');
  const [serviceUrlLocked, setServiceUrlLocked] = useState(false);

  // Step-3 endpoints.
  const rowId = useRef(1);
  const [endpoints, setEndpoints] = useState<EndpointRow[]>([]);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());

  const { data: templates = [], isLoading: templatesLoading } = useProviderTemplates();
  const { data: template, isLoading: templateLoading } = useProviderTemplate(selectedTemplateId);
  const { data: environments = [], isLoading: envLoading } = useEnvTemplates(orgHandle);
  const envName = (id: string) => environments.find((e) => e.id === id)?.env_name ?? id;

  // The endpoint URL is captured as its own field; the rest are "additional parameters".
  const paramEntries = useMemo(() => connectionEntries.filter((e) => e.name !== SERVICE_URL_FIELD), [connectionEntries]);

  // When a template loads, seed the connection schema + service definition + default URL.
  // Keyed on the template id, so user edits to name/version/summary aren't clobbered.
  useEffect(() => {
    if (!template) return;
    const draft = templateToDraft(template);
    setConnectionEntries(draft.connectionEntries);
    setServiceDefContent(draft.serviceDefContent);
    setServiceUrlLocked(draft.serviceUrlLocked);
    setServiceUrl(draft.serviceUrl);
    setVersion((v) => v || draft.version);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template?.templateId]);

  const newEndpoint = (): EndpointRow => ({ id: rowId.current++, name: '', environmentIds: [], values: { [SERVICE_URL_FIELD]: serviceUrl } });

  const patchEndpoint = (id: number, patch: Partial<EndpointRow>) => setEndpoints((rows) => rows.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  const setEndpointValue = (id: number, key: string, value: string) => setEndpoints((rows) => rows.map((e) => (e.id === id ? { ...e, values: { ...e.values, [key]: value } } : e)));

  const envsForEndpoint = (id: number) => environments.filter((env) => !endpoints.some((e) => e.id !== id && e.environmentIds.includes(env.id)));
  const allEnvsAssigned = environments.length > 0 && environments.every((env) => endpoints.some((e) => e.environmentIds.includes(env.id)));

  const step0Valid = !!selectedTemplateId;
  const step1Valid = name.trim() !== '' && serviceUrl.trim() !== '';
  const isEndpointComplete = useCallback((e: EndpointRow) => e.name.trim() !== '' && e.environmentIds.length > 0 && connectionEntries.every((entry) => (e.values[entry.name] ?? '').trim() !== ''), [connectionEntries]);
  const canRegister = useMemo(() => endpoints.some(isEndpointComplete), [endpoints, isEndpointComplete]);

  const goNext = () => {
    if (step === 1 && endpoints.length === 0) setEndpoints([newEndpoint()]);
    setStep((s) => (s + 1) as 0 | 1 | 2);
  };

  const register = () => {
    if (!canRegister || submitting) return;
    // Only send fully-populated rows — canRegister passes as long as at least one row is complete.
    const completeEndpoints = endpoints.filter(isEndpointComplete);
    onSubmit({
      draft: { name, version, summary, serviceUrl, serviceUrlLocked, serviceDefContent, connectionEntries },
      endpoints: completeEndpoints.map(({ name: epName, environmentIds, values }) => ({ name: epName, environmentIds, values })),
    });
  };

  const toggleReveal = (key: string) =>
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 600, mb: 3 }}>
        Register a GenAI Service
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
          {/* Step 1 — provider */}
          {step === 0 && (
            <>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.5 }}>
                Select service provider
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Choose the GenAI provider you want to register.
              </Typography>
              {templatesLoading ? (
                <CircularProgress size={22} sx={{ display: 'block', my: 3 }} />
              ) : (
                <Stack direction="row" flexWrap="wrap" gap={2}>
                  {templates.map((t) => {
                    const selected = selectedTemplateId === t.templateId;
                    const meta = GENAI_PROVIDER_META[t.name];
                    return (
                      <Box
                        key={t.templateId}
                        role="button"
                        tabIndex={0}
                        aria-pressed={selected}
                        onClick={() => setSelectedTemplateId(t.templateId)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelectedTemplateId(t.templateId);
                          }
                        }}
                        sx={{
                          cursor: 'pointer',
                          border: '1px solid',
                          borderColor: selected ? 'primary.main' : 'divider',
                          bgcolor: selected ? 'action.hover' : 'transparent',
                          borderRadius: 1,
                          p: 2,
                          width: 340,
                          transition: 'border-color 0.15s',
                          '&:hover': { borderColor: 'primary.main' },
                        }}>
                        <Stack direction="row" gap={1.5} alignItems="flex-start">
                          {meta?.logo && <Box component="img" src={`${LOGO_BASE}${meta.logo}`} alt={t.name} sx={{ width: 32, height: 32, flexShrink: 0, mt: 0.25 }} />}
                          <Stack gap={0.5}>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                              {t.name}
                            </Typography>
                            {meta?.description && (
                              <Typography variant="caption" color="text.secondary">
                                {meta.description}
                              </Typography>
                            )}
                          </Stack>
                        </Stack>
                      </Box>
                    );
                  })}
                </Stack>
              )}
            </>
          )}

          {/* Step 2 — details */}
          {step === 1 && (
            <>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
                Register service
              </Typography>
              {templateLoading && <CircularProgress size={20} sx={{ display: 'block', mb: 2 }} />}
              <Stack gap={2} sx={{ maxWidth: 560 }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} gap={2}>
                  <TextField label="Name" required fullWidth value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter service name" sx={{ ...requiredSx, flex: 1 }} />
                  <TextField label="Version" fullWidth value={version} onChange={(e) => setVersion(e.target.value)} placeholder="v1" sx={{ flex: 1 }} />
                </Stack>
                <TextField label="Summary" fullWidth multiline rows={2} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Enter a short summary" />
                <TextField
                  label="Service URL"
                  required
                  fullWidth
                  value={serviceUrl}
                  onChange={(e) => setServiceUrl(e.target.value)}
                  disabled={serviceUrlLocked}
                  placeholder="https://api.provider.com/v1"
                  sx={requiredSx}
                  helperText={serviceUrlLocked ? 'Provided by the selected provider.' : ' '}
                />
              </Stack>
            </>
          )}

          {/* Step 3 — endpoints */}
          {step === 2 && (
            <>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.5 }}>
                Add endpoints
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Define an endpoint with its URL and connection parameters, and choose the environments it applies to.
              </Typography>
              {envLoading && <CircularProgress size={20} sx={{ display: 'block', my: 2 }} />}

              <Stack gap={2}>
                {endpoints.map((ep) => (
                  <Box key={ep.id} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 2 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {ep.name.trim() || 'Define new endpoint'}
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
                      <Stack direction={{ xs: 'column', sm: 'row' }} gap={2}>
                        <TextField label="Name" required size="small" fullWidth value={ep.name} onChange={(e) => patchEndpoint(ep.id, { name: e.target.value })} placeholder="ProdEndpoint" sx={{ ...requiredSx, flex: 1 }} />
                        <TextField
                          label="Endpoint URL"
                          required
                          size="small"
                          fullWidth
                          value={ep.values[SERVICE_URL_FIELD] ?? ''}
                          onChange={(e) => setEndpointValue(ep.id, SERVICE_URL_FIELD, e.target.value)}
                          placeholder="https://api.provider.com/v1"
                          sx={{ ...requiredSx, flex: 1 }}
                        />
                      </Stack>

                      {paramEntries.length > 0 && (
                        <Box>
                          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                            Additional Parameters
                          </Typography>
                          <Stack gap={2}>
                            {paramEntries.map((entry) => {
                              const revealKey = `${ep.id}:${entry.name}`;
                              const isRevealed = revealed.has(revealKey);
                              return (
                                <TextField
                                  key={entry.name}
                                  label={entry.name}
                                  required={!entry.isOptional}
                                  size="small"
                                  fullWidth
                                  type={entry.isSensitive && !isRevealed ? 'password' : 'text'}
                                  value={ep.values[entry.name] ?? ''}
                                  onChange={(e) => setEndpointValue(ep.id, entry.name, e.target.value)}
                                  sx={entry.isOptional ? undefined : requiredSx}
                                  InputProps={
                                    entry.isSensitive
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
                              );
                            })}
                          </Stack>
                        </Box>
                      )}

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
                          onChange={(e) => patchEndpoint(ep.id, { environmentIds: typeof e.target.value === 'string' ? e.target.value.split(',') : (e.target.value as string[]) })}
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
                          {envsForEndpoint(ep.id).map((env) => (
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
                  <Button startIcon={<Plus size={18} />} disabled={allEnvsAssigned} onClick={() => setEndpoints((rows) => [...rows, newEndpoint()])} sx={{ mt: 1.5 }}>
                    Add another endpoint
                  </Button>
                </span>
              </Tooltip>
            </>
          )}

          {/* Navigation */}
          <Stack direction="row" gap={1.5} sx={{ mt: 4 }}>
            <Button variant="outlined" onClick={step === 0 ? onCancel : () => setStep((s) => (s - 1) as 0 | 1 | 2)} disabled={submitting}>
              {step === 0 ? 'Cancel' : 'Back'}
            </Button>
            {step < 2 ? (
              <Button variant="contained" disabled={(step === 0 && !step0Valid) || (step === 1 && !step1Valid)} onClick={goNext}>
                Next
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
