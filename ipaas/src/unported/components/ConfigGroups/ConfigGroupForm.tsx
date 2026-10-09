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

import { Alert, Box, Button, Checkbox, Chip, CircularProgress, IconButton, InputAdornment, ListItemText, MenuItem, Select, Stack, Table, TableBody, TableCell, TableHead, TableRow, Tooltip, Typography } from '@wso2/oxygen-ui';
import TextField from '../../../components/common/TextField';
import { Check, CircleAlert, Lock, Pencil, Plus, Trash2 } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { useConfigGroupNameAvailability } from '../../hooks/useConfigGroups';
import { useEnvTemplates } from '../../../hooks/useDeploymentPipelines';
import { buildConfigurations, isValidConfigKey, keyToValueType, slugifyGroupName } from '../../utils/configGroups';
import { CONFIG_KEY_ERROR, KEY_TYPE_OPTIONS } from '../../constants/configGroups';
import ConfigValueCell from './ConfigValueCell';
import type { ConfigGroupInitialValues, ConfigGroupSubmitValues } from '../../../types/configGroups';

/** Row state adds a client-only `id` for stable React keys while editing. */
interface KeyRow {
  id: number;
  keyUuid?: string;
  key: string;
  isFile: boolean;
  isSensitive: boolean;
}

interface ValueSetRow {
  id: number;
  environmentIds: string[];
  values: Record<string, string>;
}

interface ConfigGroupFormProps {
  mode: 'create' | 'edit';
  orgHandle: string;
  initial?: ConfigGroupInitialValues;
  submitting: boolean;
  submitError: string | null;
  submitLabel: string;
  onSubmit: (values: ConfigGroupSubmitValues) => void;
  onCancel: () => void;
}

const requiredSx = { '& .MuiFormLabel-asterisk': { color: 'error.main' } };

export default function ConfigGroupForm({ mode, orgHandle, initial, submitting, submitError, submitLabel, onSubmit, onCancel }: ConfigGroupFormProps): JSX.Element {
  const isEdit = mode === 'edit';
  const { data: environments = [], isLoading: envLoading } = useEnvTemplates(orgHandle);
  const envName = (id: string) => environments.find((e) => e.id === id)?.env_name ?? id;

  const [step, setStep] = useState<0 | 1>(0);
  const [displayName, setDisplayName] = useState(initial?.displayName ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [handle, setHandle] = useState(initial?.handle ?? '');
  const [handleUnlocked, setHandleUnlocked] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const rowId = useRef(1000);
  const [keys, setKeys] = useState<KeyRow[]>(initial?.keys?.length ? initial.keys.map((k, i) => ({ id: i, ...k })) : [{ id: 0, key: '', isFile: false, isSensitive: false }]);
  const [valueSets, setValueSets] = useState<ValueSetRow[]>(initial?.valueSets?.length ? initial.valueSets.map((v, i) => ({ id: i, ...v })) : [{ id: 0, environmentIds: [], values: {} }]);

  useEffect(() => {
    if (!isEdit && !handleUnlocked) setHandle(slugifyGroupName(displayName));
  }, [displayName, handleUnlocked, isEdit]);

  const [debouncedHandle, setDebouncedHandle] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedHandle(handle), 600);
    return () => clearTimeout(t);
  }, [handle]);
  const nameCheck = useConfigGroupNameAvailability(debouncedHandle, !isEdit && debouncedHandle.length > 0);
  const checking = !isEdit && handle.length > 0 && (debouncedHandle !== handle || nameCheck.isFetching);
  const taken = !isEdit && !checking && nameCheck.data?.isGroupNameUnique === false;
  const available = !isEdit && !checking && !!handle && nameCheck.data?.isGroupNameUnique === true;

  // --- key editing (step 1) ---
  const patchKey = (id: number, patch: Partial<KeyRow>) => setKeys((r) => r.map((k) => (k.id === id ? { ...k, ...patch } : k)));
  // Switching text ↔ file changes how the value is stored (raw vs base64), so drop any
  // previously entered value for this key across every value-set to avoid stale content.
  const changeKeyType = (id: number, isFile: boolean) => {
    patchKey(id, { isFile });
    const name = keys.find((k) => k.id === id)?.key.trim();
    if (!name) return;
    setValueSets((s) => s.map((v) => (name in v.values ? { ...v, values: Object.fromEntries(Object.entries(v.values).filter(([key]) => key !== name)) } : v)));
  };
  const duplicateKeys = useMemo(() => {
    const seen = new Set<string>();
    const dup = new Set<string>();
    keys.forEach((k) => {
      const t = k.key.trim();
      if (!t) return;
      if (seen.has(t)) dup.add(t);
      seen.add(t);
    });
    return dup;
  }, [keys]);
  const keysValid = keys.length > 0 && keys.every((k) => k.key.trim() !== '' && isValidConfigKey(k.key.trim()) && !duplicateKeys.has(k.key.trim()));
  const handleValid = handle.trim() !== '' && (isEdit || available);
  const step1Valid = displayName.trim() !== '' && handleValid && keysValid;

  // --- value editing (step 2) ---
  const setSetEnvs = (id: number, environmentIds: string[]) => setValueSets((s) => s.map((v) => (v.id === id ? { ...v, environmentIds } : v)));
  const setSetValue = (id: number, keyName: string, value: string) => setValueSets((s) => s.map((v) => (v.id === id ? { ...v, values: { ...v.values, [keyName]: value } } : v)));
  const hasValues = valueSets.some((set) => set.environmentIds.length > 0 && keys.some((k) => (set.values[k.key.trim()] ?? '').trim() !== ''));
  const canCreate = step1Valid && hasValues && !submitting;

  // Each environment belongs to at most one value-set.
  const envsForSet = (setId: number) => environments.filter((env) => !valueSets.some((s) => s.id !== setId && s.environmentIds.includes(env.id)));
  const allEnvsAssigned = environments.length > 0 && environments.every((env) => valueSets.some((s) => s.environmentIds.includes(env.id)));

  const handleHelper = (() => {
    if (isEdit) return 'The handle cannot be changed after creation.';
    if (!handle) return 'A URL-safe handle is derived from the name.';
    if (checking) return 'Checking availability…';
    if (taken) return `“${handle}” is taken.${nameCheck.data?.alternativeGroupName ? ` Try “${nameCheck.data.alternativeGroupName}”.` : ''}`;
    if (available) return 'Handle is available.';
    return ' ';
  })();

  const submit = () => {
    const configurations = buildConfigurations(
      keys.map((k) => ({ keyUuid: k.keyUuid, key: k.key, isFile: k.isFile, isSensitive: k.isSensitive })),
      valueSets.map((s) => ({ environmentIds: s.environmentIds, values: s.values })),
    );
    onSubmit({ displayName, handle, description, configurations });
  };

  return (
    <>
      {submitError && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {submitError}
        </Alert>
      )}

      {/* Step 1 — group details + configuration keys */}
      {step === 0 ? (
        <>
          <Stack direction={{ xs: 'column', sm: 'row' }} gap={2} sx={{ mb: 1, maxWidth: 720 }}>
            <TextField label="Name" required fullWidth value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="E.g. Payment Service Config" sx={{ ...requiredSx, flex: 1 }} helperText=" " />
            <TextField
              label="Handle"
              required
              fullWidth
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              disabled={isEdit}
              error={taken}
              placeholder="payment-service-config"
              helperText={handleHelper}
              InputProps={{
                readOnly: !isEdit && !handleUnlocked,
                endAdornment: (
                  <InputAdornment position="end">
                    {checking ? (
                      <CircularProgress size={16} />
                    ) : taken ? (
                      <CircleAlert size={16} color="var(--mui-palette-error-main, #d32f2f)" />
                    ) : available ? (
                      <Check size={16} color="var(--mui-palette-success-main, #2e7d32)" />
                    ) : !isEdit && !handleUnlocked ? (
                      <Tooltip title="Edit handle">
                        <IconButton size="small" aria-label="Edit handle" onClick={() => setHandleUnlocked(true)} edge="end">
                          <Pencil size={14} />
                        </IconButton>
                      </Tooltip>
                    ) : null}
                  </InputAdornment>
                ),
              }}
              sx={{ ...requiredSx, flex: 1 }}
              FormHelperTextProps={{ sx: { color: taken ? 'error.main' : available ? 'success.main' : 'text.secondary' } }}
            />
          </Stack>
          <TextField label="Description" fullWidth multiline rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this group for?" sx={{ maxWidth: 720, mb: 4 }} />

          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.5 }}>
            Configuration Keys
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Define the keys for this group. Choose a type, and lock a key to store its values as secrets. You&apos;ll set values per environment next.
          </Typography>

          <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, maxWidth: 720 }}>
            <Table size="small" sx={{ '& tbody tr:last-of-type td': { borderBottom: 0 } }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>Key</TableCell>
                  <TableCell sx={{ fontWeight: 600, width: 140 }}>Type</TableCell>
                  <TableCell sx={{ width: 96 }} align="right" />
                </TableRow>
              </TableHead>
              <TableBody>
                {keys.map((k) => {
                  const trimmed = k.key.trim();
                  const keyError = trimmed !== '' && (!isValidConfigKey(trimmed) || duplicateKeys.has(trimmed));
                  return (
                    <TableRow key={k.id}>
                      <TableCell sx={{ verticalAlign: 'top' }}>
                        <TextField
                          size="small"
                          fullWidth
                          value={k.key}
                          onChange={(e) => patchKey(k.id, { key: e.target.value })}
                          placeholder="KEY_NAME"
                          error={keyError}
                          helperText={keyError ? (duplicateKeys.has(trimmed) ? 'Duplicate key.' : CONFIG_KEY_ERROR) : undefined}
                          inputProps={{ 'aria-label': 'Configuration key' }}
                        />
                      </TableCell>
                      <TableCell sx={{ verticalAlign: 'top' }}>
                        <Select size="small" fullWidth value={k.isFile ? 'file' : 'text'} onChange={(e) => changeKeyType(k.id, e.target.value === 'file')} inputProps={{ 'aria-label': 'Value type' }}>
                          {KEY_TYPE_OPTIONS.map((o) => (
                            <MenuItem key={o.value} value={o.value}>
                              {o.label}
                            </MenuItem>
                          ))}
                        </Select>
                      </TableCell>
                      <TableCell sx={{ verticalAlign: 'center' }} align="right">
                        <Tooltip title={k.isSensitive ? 'Unmark as secret' : 'Mark as secret'}>
                          <IconButton size="small" aria-label="Mark as secret" onClick={() => patchKey(k.id, { isSensitive: !k.isSensitive })}>
                            <Lock size={16} fill={k.isSensitive ? 'currentColor' : 'none'} fillOpacity={0.35} />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Remove key">
                          <span>
                            <IconButton size="small" color="error" aria-label="Remove key" disabled={keys.length === 1} onClick={() => setKeys((r) => r.filter((x) => x.id !== k.id))}>
                              <Trash2 size={16} />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Box>
          <Button startIcon={<Plus size={18} />} onClick={() => setKeys((r) => [...r, { id: rowId.current++, key: '', isFile: false, isSensitive: false }])} sx={{ mt: 1.5 }}>
            Add configuration key
          </Button>

          <Stack direction="row" gap={1.5} sx={{ mt: 4 }}>
            <Button variant="outlined" onClick={onCancel}>
              Cancel
            </Button>
            <Button variant="contained" disabled={!step1Valid} onClick={() => setStep(1)}>
              Next
            </Button>
          </Stack>
        </>
      ) : (
        /* Step 2 — define values by environments */
        <>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.5 }}>
            Define values by environments
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Select the environments a value applies to, then set each key&apos;s value. Add more value sets for environments that need different values.
          </Typography>

          {/* File/validation errors, above the value editor */}
          {fileError && (
            <Alert severity="warning" onClose={() => setFileError(null)} sx={{ mb: 2 }}>
              {fileError}
            </Alert>
          )}
          {envLoading && <CircularProgress size={20} sx={{ display: 'block', mx: 'auto', my: 2 }} />}

          <Stack gap={2}>
            {valueSets.map((set) => (
              <Box key={set.id} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 2 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {set.environmentIds.length ? set.environmentIds.map(envName).join(', ') : 'New value set'}
                  </Typography>
                  {valueSets.length > 1 && (
                    <Tooltip title="Remove value set">
                      <IconButton size="small" color="error" aria-label="Remove value set" onClick={() => setValueSets((s) => s.filter((x) => x.id !== set.id))}>
                        <Trash2 size={16} />
                      </IconButton>
                    </Tooltip>
                  )}
                </Stack>

                <Typography variant="caption" color="text.secondary">
                  Environments
                </Typography>
                <Select
                  multiple
                  fullWidth
                  size="small"
                  displayEmpty
                  value={set.environmentIds}
                  onChange={(e) => setSetEnvs(set.id, typeof e.target.value === 'string' ? e.target.value.split(',') : (e.target.value as string[]))}
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
                  sx={{ mb: 2, mt: 0.5 }}>
                  {envsForSet(set.id).map((env) => (
                    <MenuItem key={env.id} value={env.id}>
                      <Checkbox size="small" checked={set.environmentIds.includes(env.id)} sx={{ p: 0, mr: 1 }} />
                      <ListItemText primary={env.env_name} />
                    </MenuItem>
                  ))}
                </Select>

                <Table size="small" sx={{ '& tbody tr:last-of-type td': { borderBottom: 0 } }}>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600, width: '35%' }}>Key</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Value</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {keys.map((k) => {
                      const name = k.key.trim();
                      return (
                        <TableRow key={k.id}>
                          <TableCell sx={{ verticalAlign: 'top' }}>
                            <Stack direction="row" alignItems="center" gap={0.5}>
                              {k.isSensitive && <Lock size={12} fill="currentColor" style={{ opacity: 0.6 }} />}
                              <Typography variant="body2">{name || '—'}</Typography>
                            </Stack>
                          </TableCell>
                          <TableCell sx={{ verticalAlign: 'top' }}>
                            <ConfigValueCell type={keyToValueType(k)} value={set.values[name] ?? ''} onChange={(v) => setSetValue(set.id, name, v)} onError={setFileError} ariaLabel={`${name || 'key'} value`} />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Box>
            ))}
          </Stack>
          <Tooltip title={allEnvsAssigned ? 'All environments are already assigned to a value set.' : ''}>
            <span>
              <Button startIcon={<Plus size={18} />} disabled={allEnvsAssigned} onClick={() => setValueSets((s) => [...s, { id: rowId.current++, environmentIds: [], values: {} }])} sx={{ mt: 1.5 }}>
                Add more values
              </Button>
            </span>
          </Tooltip>

          <Stack direction="row" gap={1.5} sx={{ mt: 4 }}>
            <Button variant="outlined" onClick={() => setStep(0)}>
              Back
            </Button>
            <Button variant="contained" disabled={!canCreate} startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : undefined} onClick={submit}>
              {submitting ? 'Saving…' : submitLabel}
            </Button>
          </Stack>
        </>
      )}
    </>
  );
}
