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

import { Alert, Box, Button, Chip, CircularProgress, FormHelperText, IconButton, InputAdornment, Paper, Stack, Switch, Tooltip, Typography, TextField } from '@wso2/oxygen-ui';
import { ArrowLeft, Braces, CircleCheck, Eye, EyeOff, FileInput, FileText, FileUp, FolderOpen, Lock, Trash2 } from '@wso2/oxygen-ui-icons-react';
import BusyFields from '../common/BusyFields';
import PlanLimitAlert from '../common/PlanLimitAlert';
import { useEffect, useId, useRef, useState, type JSX, type KeyboardEvent, type ReactNode } from 'react';
import { BffError } from '../../api/_client';
import { CONFIG_LIMITS } from '../../constants/configLimits';
import { usePlanAccess } from '../../hooks/useBillingOrg';
import { useConfigMapDetails, useSaveConfig } from '../../hooks/useDevopsConfigs';
import { byteLength, formatBytes, isBallerinaConfigKey, keyInOtherGroupError, mountedFilePath, parseDotEnv, validateConfigKey, validateDisplayName, validateFileName, validateMountDirectory, validateNewEnvGroupName } from '../../utils/devopsConfigs';
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
  /** Env-var groups and non-secret files already in this environment, measured against the plan's limits. */
  envGroupCount?: number;
  plainFileCount?: number;
  onBack: () => void;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
}

/** Selectable type card (Environment variables vs File mount). */
function TypeCard({ icon, title, description, selected, disabled, onSelect }: { icon: ReactNode; title: string; description: string; selected: boolean; disabled: boolean; onSelect: () => void }): JSX.Element {
  return (
    <Paper
      variant="outlined"
      role="radio"
      tabIndex={disabled ? -1 : 0}
      aria-checked={selected}
      aria-disabled={disabled}
      onClick={() => !disabled && onSelect()}
      onKeyDown={(e) => {
        if (disabled || (e.key !== 'Enter' && e.key !== ' ')) return;
        e.preventDefault();
        onSelect();
      }}
      sx={styles.typeCard(selected, disabled)}>
      <Box sx={styles.typeIcon(selected)}>{icon}</Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontWeight: 600 }}>{title}</Typography>
        <Typography variant="body2" color="text.secondary">
          {description}
        </Typography>
      </Box>
      {selected && (
        <Box component="span" sx={{ color: 'primary.main', display: 'flex', flexShrink: 0 }}>
          <CircleCheck size={18} />
        </Box>
      )}
    </Paper>
  );
}

/** A titled block of the form. */
function Section({ title, description, action, children }: { title: string; description?: ReactNode; action?: ReactNode; children: ReactNode }): JSX.Element {
  return (
    <Paper variant="outlined" sx={styles.section}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'flex-start' }} gap={1.5} sx={{ mb: 2 }}>
        <Box>
          <Typography sx={styles.sectionTitle}>{title}</Typography>
          {description && (
            <Typography variant="body2" color="text.secondary">
              {description}
            </Typography>
          )}
        </Box>
        {action}
      </Stack>
      {children}
    </Paper>
  );
}

const NO_KEYS: ReadonlyMap<string, string> = new Map();

/** The "Add a configuration" form: a group of environment variables or a mounted file, either one optionally a secret. */
export default function ConfigEditor({ ctx, existing, otherGroupKeys = NO_KEYS, envGroupCount = 0, plainFileCount = 0, onBack, onSaved, onError }: ConfigEditorProps): JSX.Element {
  const isEdit = !!existing;
  const save = useSaveConfig(ctx.projectId, ctx.deploymentTrackId);
  const configId = existing ? (existing.mount.configmap_id ?? existing.mount.secret_id ?? '') : '';
  // Prefill values for an existing ConfigMap (secret values are write-only, so re-entered).
  const { data: details } = useConfigMapDetails(ctx.projectId, existing && !existing.isSecret ? ctx.envId : undefined, existing && !existing.isSecret ? configId : undefined, ctx.deploymentTrackId);
  // Only the free plan's limits are checked here; the service checks every plan, so a plan
  // that is still loading or can't be read is left to it.
  const planAccess = usePlanAccess();
  const onFreePlan = planAccess?.state === 'free';
  const limits = onFreePlan ? CONFIG_LIMITS.free : CONFIG_LIMITS.paid;

  const [kind, setKind] = useState<ConfigKind>(existing?.kind ?? 'envVars');
  const [isSecret, setIsSecret] = useState(existing?.isSecret ?? false);
  const [name, setName] = useState(existing?.kind === 'envVars' ? existing.name : '');
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
  const [fileName, setFileName] = useState(existing?.kind === 'fileMount' ? existing.name : '');
  const [mountDir, setMountDir] = useState(existing?.mount.mount_path ?? '');
  const [fileContent, setFileContent] = useState('');
  const [loadError, setLoadError] = useState('');
  const [limitError, setLimitError] = useState('');
  const envImportRef = useRef<HTMLInputElement>(null);
  const fileLoadRef = useRef<HTMLInputElement>(null);

  // Once the ConfigMap details load, prefill rows (env vars) or file content.
  useEffect(() => {
    if (!details?.data) return;
    if (existing?.kind === 'fileMount') setFileContent(details.data.data ?? '');
    else setRows(Object.entries(details.data).map(([key, value]) => ({ key, value })));
  }, [details, existing?.kind]);

  // An edit keeps the group's stored name, so only a new env-var group is held to the reserved prefix.
  const nameErr = kind === 'envVars' ? (!isEdit ? validateNewEnvGroupName(name) : validateDisplayName(name)) : '';
  const fileNameErr = kind === 'fileMount' && !isEdit ? validateFileName(fileName) : '';
  // Files added before names were checked can have one Kubernetes refuses, which stops the
  // whole environment from deploying; such a file can only be removed.
  const storedNameInvalid = isEdit && kind === 'fileMount' && !!validateFileName(fileName);
  const dirErr = kind === 'fileMount' && !isEdit ? validateMountDirectory(mountDir) : '';
  const draftKeyErr = draftKey ? validateConfigKey(draftKey) || (rows.some((r) => r.key === draftKey.trim()) ? 'A variable with this key already exists.' : '') || keyInOtherGroupError(draftKey.trim(), otherGroupKeys) : '';
  // A key/value typed but not yet added is saved with the rest, as if Add was clicked,
  // instead of being dropped silently.
  const pendingRow = kind === 'envVars' && draftKey.trim() ? { key: draftKey.trim(), value: draftValue } : null;
  const effectiveRows: typeof rows = pendingRow ? [...rows, pendingRow] : rows;
  // A new secret needs a value; a stored one left blank keeps its current value.
  const hasEmptySecretValue = isSecret && kind === 'envVars' && effectiveRows.some((r) => !r.stored && r.value === '');

  // Limits. A group or file count that does not grow is not held to them, as the service does,
  // so a configuration saved before them can still be edited.
  const isOver = (used: number, limit: number) => limit > 0 && used > limit;
  const storedVarCount = existing?.kind === 'envVars' ? existing.keys.length : 0;
  const varLimit = limits.maxEnvVarsPerGroup > 0 ? Math.max(limits.maxEnvVarsPerGroup, storedVarCount) : 0;
  const tooManyVars = kind === 'envVars' && isOver(effectiveRows.length, varLimit);
  const atVarLimit = varLimit > 0 && rows.length >= varLimit;
  const groupLimitReached = !isEdit && kind === 'envVars' && isOver(envGroupCount + 1, limits.maxEnvGroups);
  const fileLimitReached = !isEdit && kind === 'fileMount' && !isSecret && isOver(plainFileCount + 1, limits.maxPlainFiles);
  const valueTooLong = (value: string) => byteLength(value) > limits.maxEnvValueBytes;
  const hasLongValue = kind === 'envVars' && effectiveRows.some((r) => valueTooLong(r.value));
  const fileBytes = byteLength(fileContent);
  const fileTooLarge = kind === 'fileMount' && fileBytes > limits.maxFileBytes;
  const planLimitMessage = groupLimitReached
    ? `The free plan allows ${limits.maxEnvGroups} environment variable groups per environment. Add these variables to an existing group, or remove one. Upgrade your subscription to add more.`
    : fileLimitReached
      ? `The free plan allows ${limits.maxPlainFiles} non-secret files per environment; secret files don't count. Store this file as a secret, or remove a file. Upgrade your subscription to add more.`
      : tooManyVars
        ? `The free plan allows ${varLimit} variables per group. Split them across groups, or remove some. Upgrade your subscription to add more.`
        : '';
  const overLimit = storedNameInvalid || groupLimitReached || fileLimitReached || tooManyVars || hasLongValue || fileTooLarge;

  // Baselines follow the prefill effect above, so loaded values do not read as edits.
  const initialRows = existing ? (details?.data && existing.kind !== 'fileMount' ? Object.entries(details.data).map(([key, value]) => ({ key, value })) : existing.keys.map((key) => ({ key, value: '' }))) : [];
  const initialFileContent = existing?.kind === 'fileMount' ? (details?.data?.data ?? '') : '';
  const rowsChanged = rows.length !== initialRows.length || rows.some((r, i) => r.key !== initialRows[i].key || r.value !== initialRows[i].value);
  // What Update would save differs from what is stored.
  const changed =
    kind !== (existing?.kind ?? 'envVars') ||
    isSecret !== (existing?.isSecret ?? false) ||
    (kind === 'envVars' && name !== (existing?.kind === 'envVars' ? existing.name : '')) ||
    (kind === 'fileMount' && (fileName !== (existing?.kind === 'fileMount' ? existing.name : '') || mountDir !== (existing?.mount.mount_path ?? ''))) ||
    fileContent !== initialFileContent ||
    rowsChanged ||
    !!pendingRow;
  // Anything typed counts for the leave guard, even a value with no key (which is not saved).
  const isDirty = changed || draftKey !== '' || draftValue !== '';
  useUnsavedChanges(isDirty);
  const guardNavigation = useLeaveGuard();

  // An unchanged edit is not saved: with stored secrets kept, it would only restart the workload.
  // A pending key that can't be added can't be saved either; its field shows why.
  const canSave = !save.isPending && (!isEdit || changed) && !overLimit && (kind === 'envVars' ? !nameErr && !(pendingRow && draftKeyErr) && !hasEmptySecretValue && effectiveRows.length > 0 : !fileNameErr && !dirErr && fileContent.trim().length > 0);

  // Why Save is disabled, for causes no field already explains (a filled-in field shows its own error).
  const blockedReason = (() => {
    if (canSave || save.isPending || overLimit) return '';
    if (kind === 'envVars' && !name.trim()) return 'Enter a name for this group.';
    if (hasEmptySecretValue) return 'Enter a value for each new secret.';
    if (kind === 'envVars' && effectiveRows.length === 0) return 'Add at least one variable.';
    if (kind === 'fileMount' && !fileName) return 'Enter the file name.';
    if (kind === 'fileMount' && !mountDir.trim()) return 'Enter the mount directory.';
    if (kind === 'fileMount' && !fileContent.trim()) return 'Enter the file content, or load it from a file.';
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
    if (draftKey.trim() && !draftKeyErr && !atVarLimit) addRow();
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

  const loadFile = (file: File) => {
    setLoadError('');
    if (file.size > limits.maxFileBytes) {
      setLoadError(`${file.name} is ${formatBytes(file.size)}. A file can be at most ${formatBytes(limits.maxFileBytes)}.`);
      return;
    }
    void file.text().then((text) => {
      setFileContent(text);
      if (!isEdit && !fileName && !validateFileName(file.name)) setFileName(file.name);
    });
  };

  const handleSave = () => {
    setLimitError('');
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
        name: kind === 'envVars' ? name.trim() : fileName,
        data,
        keep: kind === 'envVars' && kept.length ? kept.map((r) => r.key) : undefined,
        mountPath: kind === 'fileMount' ? mountDir.trim() : undefined,
        existing: existing ? { configId, mountId: existing.mount.ID } : undefined,
      },
      {
        onSuccess: () => onSaved(isEdit ? 'Configuration updated' : 'Configuration created'),
        onError: (e) => {
          // A limit the form could not check (the plan was not read yet) is shown here, with the Upgrade link.
          if (e instanceof BffError && e.status === 402) setLimitError(e.message.charAt(0).toUpperCase() + e.message.slice(1) + '.');
          else onError(e instanceof Error ? e.message : 'Failed to save the configuration.');
        },
      },
    );
  };

  const countLabel = varLimit > 0 ? `${effectiveRows.length} / ${varLimit}` : `${effectiveRows.length}`;

  return (
    <Box sx={{ maxWidth: 800 }}>
      <Button size="small" startIcon={<ArrowLeft size={14} />} onClick={() => guardNavigation(onBack)} disabled={save.isPending} sx={{ mb: 2 }}>
        Back to configs
      </Button>
      <Typography variant="h5" sx={{ fontWeight: 600 }}>
        {isEdit ? (kind === 'envVars' ? 'Edit environment variables' : 'Edit file mount') : 'Add a configuration'}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Saved for the selected environment. The integration is redeployed to pick up the change.
      </Typography>

      {limitError && <PlanLimitAlert message={limitError} sx={{ mb: 2 }} />}

      <BusyFields busy={save.isPending}>
        <Stack gap={2.5}>
          {!isEdit && (
            <Stack direction={{ xs: 'column', sm: 'row' }} gap={2} role="radiogroup" aria-label="Configuration type">
              <TypeCard
                icon={<Braces size={20} />}
                title="Environment variables"
                description="A named group of key-value pairs, read by the integration as environment variables."
                selected={kind === 'envVars'}
                disabled={false}
                onSelect={() => setKind('envVars')}
              />
              <TypeCard icon={<FileText size={20} />} title="File mount" description="A file, such as a certificate or a config file, placed at a path in the container." selected={kind === 'fileMount'} disabled={false} onSelect={() => setKind('fileMount')} />
            </Stack>
          )}

          <Paper variant="outlined" sx={styles.secretRow}>
            <Box sx={styles.typeIcon(isSecret)}>
              <Lock size={18} />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontWeight: 600 }} id="config-secret-label">
                Store as a secret
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {isEdit
                  ? `This ${kind === 'envVars' ? 'group' : 'file'} is ${isSecret ? 'stored as a secret' : 'stored as plain text'}. This can't be changed after it is created.`
                  : kind === 'envVars'
                    ? 'For passwords, tokens and keys. Values are encrypted and can never be viewed again after saving.'
                    : "For certificates, keys and credentials. The content is encrypted and can never be viewed again after saving. Secret files don't count toward the free plan's file limit."}
              </Typography>
            </Box>
            <Switch checked={isSecret} disabled={isEdit} onChange={(e) => setIsSecret(e.target.checked)} slotProps={{ input: { 'aria-labelledby': 'config-secret-label' } }} />
          </Paper>

          {planLimitMessage && <PlanLimitAlert message={planLimitMessage} />}

          {kind === 'envVars' ? (
            <>
              {/* An env-var group's name is its ID: the BFF keeps the stored name, so a rename would revert. */}
              <TextField
                labelPlacement="top"
                label="Group name"
                placeholder="e.g. database"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isEdit}
                fullWidth
                required
                error={!!name && !!nameErr}
                helperText={(!!name && nameErr) || (isEdit ? "A group's name can't be changed." : 'Identifies this group on the Configs page. It cannot be changed later.')}
              />

              <Section
                title="Variables"
                description={
                  <>
                    Keys use letters, numbers and underscores, and can't start with a number. Each value can be up to {formatBytes(limits.maxEnvValueBytes)}.
                    {rows.some((r) => r.stored) && ' Secret values are hidden: leave one blank to keep it, or type a new value to replace it.'}
                  </>
                }
                action={
                  <Stack direction="row" alignItems="center" gap={1.5} sx={{ flexShrink: 0 }}>
                    <Chip size="small" label={countLabel} color={tooManyVars ? 'warning' : 'default'} sx={styles.envCountChip} aria-label={`${effectiveRows.length} variables`} />
                    <Tooltip title="Add every KEY=value line of a .env file from your computer. Comments and blank lines are skipped.">
                      <Button size="small" variant="outlined" startIcon={<FileInput size={14} />} onClick={() => envImportRef.current?.click()}>
                        Import from .env file
                      </Button>
                    </Tooltip>
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
                }>
                <Box sx={styles.envTable}>
                  <Box sx={styles.envHeadRow}>
                    <Typography sx={styles.envHeadCell}>Key</Typography>
                    <Typography sx={styles.envHeadCell}>Value</Typography>
                    <span />
                  </Box>
                  {rows.length === 0 && (
                    <Typography variant="body2" color="text.secondary" sx={styles.envEmpty}>
                      No variables yet. Add one below, or import them from a .env file.
                    </Typography>
                  )}
                  {rows.map((r, i) => {
                    const revealed = revealedKeys.has(r.key);
                    const long = valueTooLong(r.value);
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
                          error={(isSecret && !r.stored && r.value === '') || long}
                          helperText={long ? `Longer than ${formatBytes(limits.maxEnvValueBytes)} (${formatBytes(byteLength(r.value))}).` : undefined}
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
                          <Tooltip title="Remove">
                            <IconButton
                              size="small"
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
                          </Tooltip>
                        </Box>
                      </Box>
                    );
                  })}
                  <Box sx={styles.envAddRow}>
                    <TextField
                      size="small"
                      placeholder="KEY"
                      value={draftKey}
                      onChange={(e) => {
                        setDraftKey(e.target.value);
                        setDraftError('');
                        // The notice is about the last import; typing a new variable moves on from it.
                        setImportNotice('');
                      }}
                      onKeyDown={addOnEnter}
                      error={!!draftMessage}
                      disabled={atVarLimit}
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
                      error={!!draftKey.trim() && valueTooLong(draftValue)}
                      disabled={atVarLimit}
                      fullWidth
                      sx={styles.envDraftInput}
                      slotProps={{ htmlInput: { 'aria-label': 'New value' } }}
                    />
                    <Button variant="outlined" onClick={addRow} disabled={!draftKey.trim() || !!draftKeyErr || atVarLimit} sx={styles.envAddButton}>
                      Add
                    </Button>
                  </Box>
                  <FormHelperText id={draftMessageId} error={!!draftMessage} sx={styles.envHelper}>
                    {draftMessage || importNotice || (atVarLimit ? `This group has the most variables the plan allows (${varLimit}).` : 'Press Enter or Add. A variable typed here is also saved when you save.')}
                  </FormHelperText>
                </Box>
              </Section>
            </>
          ) : (
            <>
              <Section title="Location" description="Where the file appears inside the container.">
                <Stack direction={{ xs: 'column', sm: 'row' }} gap={2}>
                  <TextField
                    labelPlacement="top"
                    label="File name"
                    placeholder="config.json"
                    value={fileName}
                    onChange={(e) => setFileName(e.target.value)}
                    disabled={isEdit}
                    fullWidth
                    required
                    error={!!fileName && !!fileNameErr}
                    helperText={(!!fileName && fileNameErr) || (isEdit ? undefined : 'Letters, numbers, dots, hyphens and underscores.')}
                    sx={styles.monoInput}
                  />
                  <TextField
                    labelPlacement="top"
                    label="Mount directory"
                    placeholder="/app/configs"
                    value={mountDir}
                    onChange={(e) => setMountDir(e.target.value)}
                    disabled={isEdit}
                    fullWidth
                    required
                    error={!!mountDir && !!dirErr}
                    helperText={(!!mountDir && dirErr) || (isEdit ? undefined : 'An absolute path to a directory.')}
                    sx={styles.monoInput}
                  />
                </Stack>
                <Box sx={styles.pathPreview} aria-live="polite">
                  <FolderOpen size={16} style={{ flexShrink: 0 }} />
                  <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0 }}>
                    Mounted at
                  </Typography>
                  <Typography sx={styles.pathPreviewValue}>{fileName && mountDir.trim() && !fileNameErr && !dirErr ? mountedFilePath(mountDir.trim(), fileName) : '—'}</Typography>
                </Box>
                {storedNameInvalid ? (
                  <Alert severity="error" sx={{ mt: 1.5 }}>
                    &ldquo;{fileName}&rdquo; is not a valid file name, so the integration can&rsquo;t be deployed to this environment while this file is mounted. Remove the file and add it again with a name of letters, numbers, dots, hyphens and underscores.
                  </Alert>
                ) : (
                  isEdit && <FormHelperText sx={{ mt: 1 }}>To rename or move the file, remove it and add it again.</FormHelperText>
                )}
              </Section>

              <Section
                title="Content"
                description={isEdit && isSecret ? 'Secret content is never shown. Enter or load the full content again to replace it.' : `Type or paste the content, or load it from a file on your computer. Up to ${formatBytes(limits.maxFileBytes)}.`}
                action={
                  <>
                    <Tooltip title="Replaces the content below with a file from your computer">
                      <Button size="small" variant="outlined" startIcon={<FileUp size={14} />} onClick={() => fileLoadRef.current?.click()} sx={{ flexShrink: 0 }}>
                        Load from file
                      </Button>
                    </Tooltip>
                    <input
                      ref={fileLoadRef}
                      type="file"
                      hidden
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) loadFile(f);
                        e.target.value = '';
                      }}
                    />
                  </>
                }>
                {loadError && (
                  <Alert severity="error" onClose={() => setLoadError('')} sx={{ mb: 1.5 }}>
                    {loadError}
                  </Alert>
                )}
                <TextField
                  value={fileContent}
                  onChange={(e) => setFileContent(e.target.value)}
                  fullWidth
                  multiline
                  minRows={10}
                  maxRows={24}
                  placeholder={'{\n  "key": "value"\n}'}
                  error={fileTooLarge}
                  slotProps={{ htmlInput: { 'aria-label': 'File content' } }}
                  sx={styles.contentInput}
                />
                <Stack direction="row" justifyContent="flex-end" sx={{ mt: 0.75 }}>
                  <Typography variant="caption" color={fileTooLarge ? 'error' : 'text.secondary'}>
                    {formatBytes(fileBytes)} of {formatBytes(limits.maxFileBytes)}
                    {fileTooLarge && ' — too large'}
                  </Typography>
                </Stack>
              </Section>
            </>
          )}
        </Stack>
      </BusyFields>

      <Stack direction="row" alignItems="center" gap={1.5} sx={{ mt: 3 }}>
        <Button variant="contained" onClick={handleSave} disabled={!canSave} startIcon={save.isPending ? <CircularProgress size={16} color="inherit" /> : undefined}>
          {save.isPending ? 'Saving…' : isEdit ? 'Save changes' : kind === 'envVars' ? 'Add variables' : 'Add file'}
        </Button>
        <Button variant="text" color="inherit" onClick={() => guardNavigation(onBack)} disabled={save.isPending}>
          Cancel
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
