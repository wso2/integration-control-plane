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

import { Alert, Box, Button, Checkbox, Chip, CircularProgress, Collapse, Divider, IconButton, InputAdornment, ListItemText, MenuItem, Select, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import TextField from '../../../../components/common/TextField';
import { ChevronDown, ChevronUp, CircleHelp, Eye, EyeOff, Plus, Trash2 } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { useConnectionConfig, useUpdateConnectionConfig } from '../../../hooks/useGenaiServices';
import { useEnvTemplates } from '../../../../hooks/useDeploymentPipelines';
import { SERVICE_URL_FIELD } from '../../../../constants/genaiServices';
import { connectionConfigToEndpoints, endpointsToConfigRequest } from '../../../utils/genaiServices';
import type { EndpointConfigDraft, GenAiService } from '../../../../types/genaiServices';

const requiredSx = { '& .MuiFormLabel-asterisk': { color: 'error.main' } };

/** An endpoint draft plus the ui-only fields the card needs (stable key + collapse state). */
type EndpointCard = EndpointConfigDraft & { id: number; isNew: boolean; expanded: boolean };

const toCards = (endpoints: EndpointConfigDraft[], seed: () => number): EndpointCard[] => endpoints.map((e) => ({ ...e, id: seed(), isNew: false, expanded: true }));
const persistedFields = (list: EndpointCard[]) => JSON.stringify(list.map(({ name, serviceUrl, params, environmentIds }) => ({ name, serviceUrl, params, environmentIds })));

export default function EndpointsTab({ service, orgHandle, canEdit }: { service: GenAiService; orgHandle: string; canEdit: boolean }): JSX.Element {
  const schema = service.connectionSchemas?.[0];
  const schemaId = schema?.id;
  const entries = useMemo(() => schema?.entries ?? [], [schema]);

  const { data: config, isLoading, isError, refetch } = useConnectionConfig(service.serviceId, schemaId);
  const { data: environments = [] } = useEnvTemplates(orgHandle);
  const envName = (id: string) => environments.find((e) => e.id === id)?.env_name ?? id;
  const save = useUpdateConnectionConfig(service.serviceId, schemaId ?? '');

  const rowId = useRef(1);
  const [cards, setCards] = useState<EndpointCard[]>([]);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    if (config) setCards(toCards(connectionConfigToEndpoints(config, entries), () => rowId.current++));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  const loadedSnapshot = useMemo(() => persistedFields(toCards(connectionConfigToEndpoints(config, entries), () => 0)), [config, entries]);
  const dirty = persistedFields(cards) !== loadedSnapshot;

  const patchCard = (id: number, patch: Partial<EndpointCard>) => setCards((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const envsForCard = (id: number) => environments.filter((env) => !cards.some((c) => c.id !== id && c.environmentIds.includes(env.id)));
  const allEnvsAssigned = environments.length > 0 && environments.every((env) => cards.some((c) => c.environmentIds.includes(env.id)));

  const addCard = () =>
    setCards((prev) => [
      ...prev,
      {
        id: rowId.current++,
        name: '',
        isNew: true,
        serviceUrl: '',
        params: entries.filter((e) => e.name !== SERVICE_URL_FIELD).map((e) => ({ key: e.name, value: '', isSensitive: e.isSensitive })),
        environmentIds: [],
        expanded: true,
      },
    ]);

  const valid = cards.length > 0 && cards.every((c) => c.name.trim() !== '' && c.environmentIds.length > 0 && c.serviceUrl.trim() !== '' && c.params.every((p) => p.value.trim() !== '')) && new Set(cards.map((c) => c.name.trim())).size === cards.length;

  const onUpdate = () => {
    if (!valid || !schemaId) return;
    setNotice(null);
    save.mutate(endpointsToConfigRequest(cards), {
      onSuccess: () => setNotice({ type: 'success', message: 'Endpoints updated.' }),
      onError: (e) => setNotice({ type: 'error', message: e instanceof Error ? e.message : 'Failed to update endpoints.' }),
    });
  };

  const onCancel = () => {
    if (config) setCards(toCards(connectionConfigToEndpoints(config, entries), () => rowId.current++));
    setNotice(null);
  };

  const toggleReveal = (key: string) =>
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  if (!schemaId) return <Alert severity="info">This service has no connection schema.</Alert>;
  if (isLoading)
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress />
      </Box>
    );
  if (isError) {
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={() => refetch()}>
            Retry
          </Button>
        }>
        Failed to load endpoints.
      </Alert>
    );
  }

  return (
    <Box>
      {notice && (
        <Alert severity={notice.type} onClose={() => setNotice(null)} sx={{ mb: 2 }}>
          {notice.message}
        </Alert>
      )}

      {cards.length === 0 && <Alert severity="info">No endpoints are defined for this service yet. Add an endpoint to configure its connection.</Alert>}

      <Stack gap={2}>
        {cards.map((card) => (
          <Box key={card.id} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
            {/* Card header */}
            <Stack direction="row" alignItems="center" gap={1.5} sx={{ px: 2, py: 1.5 }}>
              {card.isNew ? (
                <TextField size="small" required placeholder="Endpoint name" value={card.name} onChange={(e) => patchCard(card.id, { name: e.target.value })} sx={{ ...requiredSx, maxWidth: 220 }} />
              ) : (
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {card.name}
                </Typography>
              )}
              <Stack direction="row" gap={0.5} flexWrap="wrap" sx={{ flex: 1 }}>
                {card.environmentIds.map((id) => (
                  <Chip key={id} label={envName(id)} size="small" variant="outlined" />
                ))}
              </Stack>
              {canEdit && (
                <Tooltip title="Delete endpoint">
                  <IconButton size="small" color="error" aria-label={`Delete ${card.name || 'endpoint'}`} onClick={() => setCards((prev) => prev.filter((c) => c.id !== card.id))}>
                    <Trash2 size={16} />
                  </IconButton>
                </Tooltip>
              )}
              <IconButton size="small" aria-label={card.expanded ? 'Collapse' : 'Expand'} onClick={() => patchCard(card.id, { expanded: !card.expanded })}>
                {card.expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </IconButton>
            </Stack>

            <Collapse in={card.expanded}>
              <Divider />
              <Box sx={{ p: 2 }}>
                <Stack gap={2}>
                  <TextField label="Endpoint URL" required fullWidth size="small" value={card.serviceUrl} onChange={(e) => patchCard(card.id, { serviceUrl: e.target.value })} placeholder="https://api.provider.com/v1" disabled={!canEdit} sx={requiredSx} />

                  {card.params.length > 0 && (
                    <Box>
                      <Stack direction="row" alignItems="center" gap={0.5} sx={{ mb: 1 }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                          Additional Parameters
                        </Typography>
                        <Tooltip title="Parameters required to connect to the endpoint, such as authorization keys. These are consistent across all endpoints.">
                          <CircleHelp size={14} style={{ opacity: 0.6 }} />
                        </Tooltip>
                      </Stack>
                      <Divider sx={{ mb: 1.5 }} />
                      <Stack gap={1.5}>
                        {card.params.map((param, idx) => {
                          const revealKey = `${card.id}:${param.key}`;
                          const isRevealed = revealed.has(revealKey);
                          // Params map to connection-schema entries; required (non-optional) ones must stay.
                          const isOptional = entries.find((e) => e.name === param.key)?.isOptional ?? false;
                          return (
                            <Stack key={param.key} direction="row" alignItems="center" gap={1.5}>
                              <TextField size="small" value={param.key} disabled sx={{ flex: '0 0 30%' }} />
                              <TextField
                                size="small"
                                fullWidth
                                type={param.isSensitive && !isRevealed ? 'password' : 'text'}
                                value={param.value}
                                onChange={(e) => patchCard(card.id, { params: card.params.map((p, i) => (i === idx ? { ...p, value: e.target.value } : p)) })}
                                disabled={!canEdit}
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
                              {param.isSensitive && <Chip label="Secret" size="small" variant="outlined" color="primary" />}
                              {canEdit && isOptional && (
                                <Tooltip title="Remove parameter">
                                  <IconButton size="small" color="error" aria-label={`Remove ${param.key}`} onClick={() => patchCard(card.id, { params: card.params.filter((_, i) => i !== idx) })}>
                                    <Trash2 size={16} />
                                  </IconButton>
                                </Tooltip>
                              )}
                            </Stack>
                          );
                        })}
                      </Stack>
                    </Box>
                  )}

                  <Box>
                    <Stack direction="row" alignItems="center" gap={0.5} sx={{ mb: 0.5 }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                        Allowed Environments
                      </Typography>
                      <Tooltip title="Environments this endpoint is allowed for when creating a connection.">
                        <CircleHelp size={14} style={{ opacity: 0.6 }} />
                      </Tooltip>
                    </Stack>
                    <Select
                      multiple
                      fullWidth
                      size="small"
                      displayEmpty
                      disabled={!canEdit}
                      value={card.environmentIds}
                      onChange={(e) => patchCard(card.id, { environmentIds: typeof e.target.value === 'string' ? e.target.value.split(',') : (e.target.value as string[]) })}
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
                      }>
                      {envsForCard(card.id).map((env) => (
                        <MenuItem key={env.id} value={env.id}>
                          <Checkbox size="small" checked={card.environmentIds.includes(env.id)} sx={{ p: 0, mr: 1 }} />
                          <ListItemText primary={env.env_name} />
                        </MenuItem>
                      ))}
                    </Select>
                  </Box>
                </Stack>
              </Box>
            </Collapse>
          </Box>
        ))}
      </Stack>

      {canEdit && (
        <Tooltip title={allEnvsAssigned ? 'All environments are already assigned to an endpoint.' : ''}>
          <span>
            <Button startIcon={<Plus size={18} />} disabled={allEnvsAssigned} onClick={addCard} sx={{ mt: 2 }}>
              {cards.length === 0 ? 'Add Endpoints' : 'More Endpoints'}
            </Button>
          </span>
        </Tooltip>
      )}

      {canEdit && (
        <Stack direction="row" gap={1.5} sx={{ mt: 3 }}>
          <Button variant="contained" disabled={!dirty || !valid || save.isPending} startIcon={save.isPending ? <CircularProgress size={16} color="inherit" /> : undefined} onClick={onUpdate}>
            {save.isPending ? 'Updating…' : 'Update'}
          </Button>
          <Button variant="outlined" disabled={!dirty || save.isPending} onClick={onCancel}>
            Cancel
          </Button>
        </Stack>
      )}
    </Box>
  );
}
