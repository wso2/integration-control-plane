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

import { Alert, Box, Button, Checkbox, Chip, CircularProgress, FormControlLabel, FormHelperText, IconButton, InputAdornment, Paper, Stack, Typography, TextField } from '@wso2/oxygen-ui';
import { ArrowLeft, Eye, EyeOff, Trash2, Upload } from '@wso2/oxygen-ui-icons-react';
import BusyFields from '../common/BusyFields';
import { useEffect, useId, useRef, useState, type JSX, type KeyboardEvent } from 'react';
import { useConfigMapDetails, useSaveConfig } from '../../hooks/useDevopsConfigs';
import { parseDotEnv, validateConfigKey, validateDisplayName, validateMountPath, validateNewEnvGroupName } from '../../utils/devopsConfigs';
import type { ConfigKind, ConfigRow } from '../../types/devopsConfigs';
import { useLeaveGuard, useUnsavedChanges } from '../../contexts/UnsavedChangesContext';
import * as styles from './ConfigEditor.styles';

/** The component/release/env target a config is created against. */
export interface EditorContext {
  projectId: string;
  componentId: string;
  releaseId: string;
  containerId: string;
  envId: string;
  /** The deployment track the configs belong to; undefined while the page hasn't resolved it. */
  deploymentTrackId: string | undefined;
}

interface ConfigEditorProps {
  ctx: EditorContext;
  /** When set, edit an existing config/secret instead of creating one. */
  existing?: ConfigRow;
  onBack: () => void;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
}

/** Selectable type card (Environment Variables vs File Mount). */
function TypeCard({ title, description, selected, disabled, onSelect }: { title: string; description: string; selected: boolean; disabled: boolean; onSelect: () => void }): JSX.Element {
  return (
    <Paper
      variant="outlined"
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-pressed={selected}
      aria-disabled={disabled}
      onClick={() => !disabled && onSelect()}
      onKeyDown={(e) => {
        if (disabled || (e.key !== 'Enter' && e.key !== ' ')) return;
        e.preventDefault();
        onSelect();
      }}
      sx={{
        flex: 1,
        p: 2,
        textAlign: 'left',
        cursor: disabled ? 'default' : 'pointer',
        borderColor: selected ? 'primary.main' : 'divider',
        borderWidth: selected ? 2 : 1,
        opacity: disabled && !selected ? 0.5 : 1,
        '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
      }}>
      <Typography sx={{ fontWeight: 600 }}>{title}</Typography>
      <Typography variant="body2" color="text.secondary">
        {description}
      </Typography>
    </Paper>
  );
}

/** The "Create a Config or Secret" form — env-var set or file mount, optionally a secret. */
export default function ConfigEditor({ ctx, existing, onBack, onSaved, onError }: ConfigEditorProps): JSX.Element {
  const isEdit = !!existing;
  const save = useSaveConfig(ctx.projectId, ctx.deploymentTrackId);
  const configId = existing ? (existing.mount.configmap_id ?? existing.mount.secret_id ?? '') : '';
  // Prefill values for an existing ConfigMap (secret values are write-only, so re-entered).
  const { data: details } = useConfigMapDetails(ctx.projectId, existing && !existing.isSecret ? ctx.envId : undefined, existing && !existing.isSecret ? configId : undefined, ctx.deploymentTrackId);

  const [kind, setKind] = useState<ConfigKind>(existing?.kind ?? 'envVars');
  const [isSecret, setIsSecret] = useState(existing?.isSecret ?? false);
  const [name, setName] = useState(existing?.name ?? '');
  // A `stored` row is a secret already saved: its value is write-only, so it loads blank
  // and stays as it is unless a new value is typed.
  const [rows, setRows] = useState<Array<{ key: string; value: string; stored?: boolean }>>(existing ? existing.keys.map((k) => ({ key: k, value: '', stored: existing.isSecret })) : []);
  const [draftKey, setDraftKey] = useState('');
  const [draftValue, setDraftValue] = useState('');
  const [draftError, setDraftError] = useState('');
  const [revealedKeys, setRevealedKeys] = useState<ReadonlySet<string>>(new Set());
  const draftMessageId = useId();
  const [mountPath, setMountPath] = useState(existing?.mount.mount_path ?? '');
  const [fileContent, setFileContent] = useState('');
  const [error, setError] = useState('');
  const envImportRef = useRef<HTMLInputElement>(null);
  const fileUploadRef = useRef<HTMLInputElement>(null);

  // Once the ConfigMap details load, prefill rows (env vars) or file content.
  useEffect(() => {
    if (!details?.data) return;
    if (existing?.kind === 'fileMount') setFileContent(details.data.data ?? '');
    else setRows(Object.entries(details.data).map(([key, value]) => ({ key, value })));
  }, [details, existing?.kind]);

  // An edit keeps the group's stored name, so only a new env-var group is held to the reserved prefix.
  const nameErr = !isEdit && kind === 'envVars' ? validateNewEnvGroupName(name) : validateDisplayName(name);
  const draftKeyErr = draftKey ? validateConfigKey(draftKey) : '';
  const pathErr = validateMountPath(mountPath);
  // A new secret needs a value; a stored one left blank keeps its current value.
  const hasEmptySecretValue = isSecret && kind === 'envVars' && rows.some((r) => !r.stored && r.value === '');
  const canSave = !save.isPending && !nameErr && !hasEmptySecretValue && (kind === 'envVars' ? rows.length > 0 : !pathErr && fileContent.trim().length > 0);

  // Baselines follow the prefill effect above, so loaded values do not read as edits.
  const initialRows = existing ? (details?.data && existing.kind !== 'fileMount' ? Object.entries(details.data).map(([key, value]) => ({ key, value })) : existing.keys.map((key) => ({ key, value: '' }))) : [];
  const initialFileContent = existing?.kind === 'fileMount' ? (details?.data?.data ?? '') : '';
  const rowsChanged = rows.length !== initialRows.length || rows.some((r, i) => r.key !== initialRows[i].key || r.value !== initialRows[i].value);
  const isDirty =
    kind !== (existing?.kind ?? 'envVars') ||
    isSecret !== (existing?.isSecret ?? false) ||
    name !== (existing?.name ?? '') ||
    mountPath !== (existing?.mount.mount_path ?? '') ||
    fileContent !== initialFileContent ||
    draftKey !== '' ||
    draftValue !== '' ||
    rowsChanged;
  useUnsavedChanges(isDirty);
  const guardNavigation = useLeaveGuard();

  // Why Save is disabled, for causes no field already explains (a filled-in field shows its own error).
  const blockedReason = (() => {
    if (canSave || save.isPending) return '';
    if (!name.trim()) return 'Enter a display name.';
    if (hasEmptySecretValue) return 'Enter a value for each new secret.';
    if (kind === 'envVars' && rows.length === 0) return 'Add at least one variable.';
    if (kind === 'fileMount' && !mountPath.trim()) return 'Enter the mount path.';
    if (kind === 'fileMount' && !fileContent.trim()) return 'Enter the file content.';
    return '';
  })();

  const addRow = () => {
    const keyErr = validateConfigKey(draftKey);
    if (keyErr) {
      setDraftError(keyErr);
      return;
    }
    if (rows.some((r) => r.key === draftKey.trim())) {
      setDraftError('A variable with this key already exists.');
      return;
    }
    setRows((prev) => [...prev, { key: draftKey.trim(), value: draftValue }]);
    setDraftKey('');
    setDraftValue('');
    setDraftError('');
  };

  const toggleReveal = (key: string) =>
    setRevealedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const addOnEnter = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (draftKey.trim() && !draftKeyErr) addRow();
  };

  const draftMessage = (!!draftKey && draftKeyErr) || draftError;

  const importEnvFile = (file: File) => {
    void file.text().then((text) => {
      const parsed = parseDotEnv(text).filter((p) => !validateConfigKey(p.key));
      setRows((prev) => {
        const existingKeys = new Set(prev.map((r) => r.key));
        return [...prev, ...parsed.filter((p) => !existingKeys.has(p.key))];
      });
    });
  };

  const uploadFile = (file: File) => {
    void file.text().then((text) => {
      setFileContent(text);
      if (!name.trim()) setName(file.name);
    });
  };

  const handleSave = () => {
    setError('');
    if (!canSave) return;
    // Stored secrets left blank are kept as they are, not re-sent.
    const kept = rows.filter((r) => r.stored && r.value === '');
    const sent = rows.filter((r) => !(r.stored && r.value === ''));
    const data = kind === 'envVars' ? Object.fromEntries(sent.map((r) => [r.key, r.value])) : { data: fileContent };
    save.mutate(
      {
        componentId: ctx.componentId,
        releaseId: ctx.releaseId,
        containerId: ctx.containerId,
        envId: ctx.envId,
        isSecret,
        kind,
        name: name.trim(),
        data,
        keep: kind === 'envVars' && kept.length ? kept.map((r) => r.key) : undefined,
        mountPath: kind === 'fileMount' ? mountPath.trim() : undefined,
        existing: existing ? { configId, mountId: existing.mount.ID } : undefined,
      },
      { onSuccess: () => onSaved(isEdit ? 'Configuration updated' : 'Configuration created'), onError: (e) => onError(e instanceof Error ? e.message : 'Failed to save the configuration.') },
    );
  };

  return (
    <Box sx={{ maxWidth: 720 }}>
      <Button size="small" startIcon={<ArrowLeft size={14} />} onClick={() => guardNavigation(onBack)} sx={{ mb: 2 }}>
        Back to configs
      </Button>
      <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>
        {isEdit ? 'Edit Config or Secret' : 'Create a Config or Secret'}
      </Typography>
      {error && (
        <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <BusyFields busy={save.isPending}>
        <Stack direction="row" gap={2} sx={{ mb: 2 }}>
          <TypeCard title="Environment Variables" description="Inject a set of environment variables into the container" selected={kind === 'envVars'} disabled={isEdit} onSelect={() => setKind('envVars')} />
          <TypeCard title="File Mount" description="Mount a file at a specified path in the container" selected={kind === 'fileMount'} disabled={isEdit} onSelect={() => setKind('fileMount')} />
        </Stack>

        <FormControlLabel control={<Checkbox size="small" checked={isSecret} disabled={isEdit} onChange={(e) => setIsSecret(e.target.checked)} />} label="Mark as a Secret" sx={{ mb: 1 }} />
        <TextField labelPlacement="top" label="Display Name" value={name} onChange={(e) => setName(e.target.value)} fullWidth required error={!!name && !!nameErr} helperText={(!!name && nameErr) || ' '} />

        {kind === 'envVars' ? (
          <Box>
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={2} sx={styles.envHeader}>
              <Box>
                <Stack direction="row" alignItems="center" gap={1}>
                  <Typography sx={styles.envTitle}>Environment variables</Typography>
                  <Chip size="small" label={rows.length} sx={styles.envCountChip} />
                </Stack>
                <Typography variant="body2" color="text.secondary">
                  Injected into the container at runtime.
                </Typography>
              </Box>
              <Button size="small" variant="outlined" startIcon={<Upload size={14} />} onClick={() => envImportRef.current?.click()} sx={styles.envImportButton}>
                Import .env
              </Button>
              <input
                ref={envImportRef}
                type="file"
                accept=".env,text/plain"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) importEnvFile(f);
                  e.target.value = '';
                }}
              />
            </Stack>
            {rows.some((r) => r.stored) && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Secret values are hidden. Leave one blank to keep it, or type a new value to replace it.
              </Typography>
            )}
            <Box sx={styles.envTable}>
              <Box sx={styles.envRow}>
                <Typography sx={styles.envHeadCell}>Key</Typography>
                <Typography sx={styles.envHeadCell}>Value</Typography>
                <span />
              </Box>
              {rows.map((r, i) => {
                const revealed = revealedKeys.has(r.key);
                return (
                  <Box key={`${r.key}-${i}`} sx={styles.envRow}>
                    <Typography sx={styles.envKeyText} title={r.key}>
                      {r.key}
                    </Typography>
                    <TextField
                      size="small"
                      type={isSecret && !revealed ? 'password' : 'text'}
                      value={r.value}
                      placeholder={r.stored ? '••••••••' : isSecret ? 'Enter a value' : ''}
                      error={isSecret && !r.stored && r.value === ''}
                      onChange={(e) => setRows((prev) => prev.map((row, idx) => (idx === i ? { ...row, value: e.target.value } : row)))}
                      fullWidth
                      sx={styles.envValueInput}
                      slotProps={{
                        htmlInput: { 'aria-label': `Value of ${r.key}` },
                        input: isSecret
                          ? {
                              endAdornment: (
                                <InputAdornment position="end">
                                  <IconButton size="small" edge="end" aria-label={revealed ? `Hide ${r.key}` : `Show ${r.key}`} onClick={() => toggleReveal(r.key)}>
                                    {revealed ? <EyeOff size={16} /> : <Eye size={16} />}
                                  </IconButton>
                                </InputAdornment>
                              ),
                            }
                          : undefined,
                      }}
                    />
                    <Box sx={styles.envActions}>
                      <IconButton
                        size="small"
                        color="error"
                        aria-label={`Remove ${r.key}`}
                        onClick={() => {
                          setRows((prev) => prev.filter((_, idx) => idx !== i));
                          setRevealedKeys((prev) => {
                            const next = new Set(prev);
                            next.delete(r.key);
                            return next;
                          });
                        }}>
                        <Trash2 size={16} />
                      </IconButton>
                    </Box>
                  </Box>
                );
              })}
              <Box sx={styles.envAddRow}>
                <TextField
                  size="small"
                  placeholder="NEW_KEY"
                  value={draftKey}
                  onChange={(e) => {
                    setDraftKey(e.target.value);
                    setDraftError('');
                  }}
                  onKeyDown={addOnEnter}
                  error={!!draftMessage}
                  fullWidth
                  sx={styles.envDraftInput}
                  slotProps={{ htmlInput: { 'aria-label': 'New key', 'aria-describedby': draftMessageId } }}
                />
                <TextField
                  size="small"
                  placeholder="value"
                  type={isSecret ? 'password' : 'text'}
                  value={draftValue}
                  onChange={(e) => setDraftValue(e.target.value)}
                  onKeyDown={addOnEnter}
                  fullWidth
                  sx={styles.envDraftInput}
                  slotProps={{ htmlInput: { 'aria-label': 'New value' } }}
                />
                <Button variant="outlined" onClick={addRow} disabled={!draftKey.trim() || !!draftKeyErr} sx={styles.envAddButton}>
                  Add
                </Button>
              </Box>
              {draftMessage ? (
                <FormHelperText id={draftMessageId} error sx={styles.envHelper}>
                  {draftMessage}
                </FormHelperText>
              ) : (
                <FormHelperText id={draftMessageId} sx={styles.envHelper}>
                  Press Enter or Add to save. Keys start with a letter or underscore and use letters, digits and underscores.
                </FormHelperText>
              )}
            </Box>
          </Box>
        ) : (
          <Stack gap={3} sx={{ mt: 2 }}>
            <TextField
              labelPlacement="top"
              label="File Mount path"
              value={mountPath}
              onChange={(e) => setMountPath(e.target.value)}
              fullWidth
              required
              error={!!mountPath && !!pathErr}
              helperText={(!!mountPath && pathErr) || 'The file will be mounted to this path inside the container. Use an absolute path including the filename. Eg. /app/configs/config.json'}
            />
            <Box>
              <Button variant="outlined" startIcon={<Upload size={16} />} onClick={() => fileUploadRef.current?.click()}>
                Upload file
              </Button>
              <input
                ref={fileUploadRef}
                type="file"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadFile(f);
                  e.target.value = '';
                }}
              />
            </Box>
            <TextField
              labelPlacement="top"
              label="File Content"
              value={fileContent}
              onChange={(e) => setFileContent(e.target.value)}
              fullWidth
              multiline
              minRows={8}
              required
              helperText={isEdit && isSecret ? 'Secret content is never shown. Enter the full content again to replace it.' : ' '}
              sx={{ '& textarea': { fontFamily: 'monospace', fontSize: '0.8125rem' } }}
            />
          </Stack>
        )}
      </BusyFields>

      <Stack direction="row" alignItems="center" gap={1.5} sx={{ mt: 3 }}>
        <Button variant="contained" onClick={handleSave} disabled={!canSave} startIcon={save.isPending ? <CircularProgress size={16} color="inherit" /> : undefined}>
          {save.isPending ? 'Saving…' : isEdit ? 'Update' : 'Create'}
        </Button>
        {blockedReason && (
          <Typography variant="body2" color="text.secondary">
            {blockedReason}
          </Typography>
        )}
      </Stack>
    </Box>
  );
}
