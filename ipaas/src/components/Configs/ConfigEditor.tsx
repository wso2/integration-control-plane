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
import { isBallerinaConfigKey, keyInOtherGroupError, parseDotEnv, validateConfigKey, validateDisplayName, validateMountPath, validateNewEnvGroupName } from '../../utils/devopsConfigs';
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
  /** Keys set by the component's other env-var groups, each mapped to its group's name. */
  otherGroupKeys?: ReadonlyMap<string, string>;
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

const NO_KEYS: ReadonlyMap<string, string> = new Map();

/** The "Create a config or secret" form — env-var set or file mount, optionally a secret. */
export default function ConfigEditor({ ctx, existing, otherGroupKeys = NO_KEYS, onBack, onSaved, onError }: ConfigEditorProps): JSX.Element {
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
  // What the last .env import left out, and why. Not an error: the rest was imported.
  const [importNotice, setImportNotice] = useState('');
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
  const draftKeyErr = draftKey ? validateConfigKey(draftKey) || (rows.some((r) => r.key === draftKey.trim()) ? 'A variable with this key already exists.' : '') || keyInOtherGroupError(draftKey.trim(), otherGroupKeys) : '';
  const pathErr = validateMountPath(mountPath);
  // A key/value typed but not yet added is saved with the rest, as if Add was clicked,
  // instead of being dropped silently.
  const pendingRow = kind === 'envVars' && draftKey.trim() ? { key: draftKey.trim(), value: draftValue } : null;
  const effectiveRows: typeof rows = pendingRow ? [...rows, pendingRow] : rows;
  // A new secret needs a value; a stored one left blank keeps its current value.
  const hasEmptySecretValue = isSecret && kind === 'envVars' && effectiveRows.some((r) => !r.stored && r.value === '');

  // Baselines follow the prefill effect above, so loaded values do not read as edits.
  const initialRows = existing ? (details?.data && existing.kind !== 'fileMount' ? Object.entries(details.data).map(([key, value]) => ({ key, value })) : existing.keys.map((key) => ({ key, value: '' }))) : [];
  const initialFileContent = existing?.kind === 'fileMount' ? (details?.data?.data ?? '') : '';
  const rowsChanged = rows.length !== initialRows.length || rows.some((r, i) => r.key !== initialRows[i].key || r.value !== initialRows[i].value);
  // What Update would save differs from what is stored.
  const changed = kind !== (existing?.kind ?? 'envVars') || isSecret !== (existing?.isSecret ?? false) || name !== (existing?.name ?? '') || mountPath !== (existing?.mount.mount_path ?? '') || fileContent !== initialFileContent || rowsChanged || !!pendingRow;
  // Anything typed counts for the leave guard, even a value with no key (which is not saved).
  const isDirty = changed || draftKey !== '' || draftValue !== '';
  useUnsavedChanges(isDirty);
  const guardNavigation = useLeaveGuard();

  // An unchanged edit is not saved: with stored secrets kept, it would only restart the workload.
  // A pending key that can't be added can't be saved either; its field shows why.
  const canSave = !save.isPending && (!isEdit || changed) && !nameErr && !(pendingRow && draftKeyErr) && !hasEmptySecretValue && (kind === 'envVars' ? effectiveRows.length > 0 : !pathErr && fileContent.trim().length > 0);

  // Why Save is disabled, for causes no field already explains (a filled-in field shows its own error).
  const blockedReason = (() => {
    if (canSave || save.isPending) return '';
    if (!name.trim()) return 'Enter a display name.';
    if (hasEmptySecretValue) return 'Enter a value for each new secret.';
    if (kind === 'envVars' && effectiveRows.length === 0) return 'Add at least one variable.';
    if (kind === 'fileMount' && !mountPath.trim()) return 'Enter the mount path.';
    if (kind === 'fileMount' && !fileContent.trim()) return 'Enter the file content.';
    if (isEdit && !changed && draftValue && !draftKey.trim()) return 'Enter a key for the new value.';
    if (isEdit && !changed) return 'No changes to save.';
    return '';
  })();

  const addRow = () => {
    // draftKeyErr is '' for an empty key; validating it says the key is required.
    const keyErr = draftKeyErr || validateConfigKey(draftKey);
    if (keyErr) return setDraftError(keyErr);
    setRows((prev) => [...prev, { key: draftKey.trim(), value: draftValue }]);
    setDraftKey('');
    setImportNotice('');
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
      const all = parseDotEnv(text);
      const parsed = all.filter((p) => !validateConfigKey(p.key));
      // Keys the save would reject are left out, and said so.
      const reserved = all.filter((p) => isBallerinaConfigKey(p.key)).map((p) => p.key);
      const invalid = all.filter((p) => validateConfigKey(p.key) && !isBallerinaConfigKey(p.key)).map((p) => p.key);
      const taken = parsed.filter((p) => otherGroupKeys.has(p.key)).map((p) => p.key);
      const existingKeys = new Set(rows.map((r) => r.key));
      const present = parsed.filter((p) => existingKeys.has(p.key) && !otherGroupKeys.has(p.key)).map((p) => p.key);
      const reason = (keys: string[], why: string) => (keys.length ? `${why}: ${keys.join(', ')}` : '');
      const skipped = [reason(invalid, 'invalid name'), reason(reserved, 'reserved for Ballerina configuration'), reason(taken, 'already set by another config'), reason(present, 'already in this config')].filter(Boolean);
      setImportNotice(skipped.length ? `Not imported, ${skipped.join('; ')}.` : '');
      setRows((prev) => {
        const prevKeys = new Set(prev.map((r) => r.key));
        return [...prev, ...parsed.filter((p) => !prevKeys.has(p.key) && !otherGroupKeys.has(p.key))];
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
    const kept = effectiveRows.filter((r) => r.stored && r.value === '');
    const sent = effectiveRows.filter((r) => !(r.stored && r.value === ''));
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
      <Button size="small" startIcon={<ArrowLeft size={14} />} onClick={() => guardNavigation(onBack)} disabled={save.isPending} sx={{ mb: 2 }}>
        Back to configs
      </Button>
      <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>
        {isEdit ? 'Edit config or secret' : 'Create a config or secret'}
      </Typography>
      {error && (
        <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <BusyFields busy={save.isPending}>
        <Stack direction="row" gap={2} sx={{ mb: 2 }}>
          <TypeCard title="Environment variables" description="Inject a set of environment variables into the container" selected={kind === 'envVars'} disabled={isEdit} onSelect={() => setKind('envVars')} />
          <TypeCard title="File mount" description="Mount a file at a specified path in the container" selected={kind === 'fileMount'} disabled={isEdit} onSelect={() => setKind('fileMount')} />
        </Stack>

        <FormControlLabel control={<Checkbox size="small" checked={isSecret} disabled={isEdit} onChange={(e) => setIsSecret(e.target.checked)} />} label="Mark as a secret" sx={{ mb: 1 }} />
        {/* An env-var group's name is its ID: the BFF keeps the stored name, so a rename would revert. */}
        <TextField labelPlacement="top" label="Display name" value={name} onChange={(e) => setName(e.target.value)} disabled={isEdit && kind === 'envVars'} fullWidth required error={!!name && !!nameErr} helperText={(!!name && nameErr) || ' '} />

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
                    // The notice is about the last import; typing a new variable moves on from it.
                    setImportNotice('');
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
                  onChange={(e) => {
                    setDraftValue(e.target.value);
                    setImportNotice('');
                  }}
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
              ) : importNotice ? (
                <FormHelperText id={draftMessageId} sx={styles.envHelper}>
                  {importNotice}
                </FormHelperText>
              ) : (
                <FormHelperText id={draftMessageId} sx={styles.envHelper}>
                  Press Enter or Add to add it; a variable typed here is also saved on Update. Keys start with a letter or underscore and use letters, digits and underscores.
                </FormHelperText>
              )}
            </Box>
          </Box>
        ) : (
          <Stack gap={3} sx={{ mt: 2 }}>
            <TextField
              labelPlacement="top"
              label="File mount path"
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
              label="File content"
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
