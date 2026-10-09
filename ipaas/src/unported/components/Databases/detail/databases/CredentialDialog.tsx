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

import { Alert, Autocomplete, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, InputAdornment, Stack } from '@wso2/oxygen-ui';
import TextField from '../../../../../components/common/TextField';
import { Eye, EyeOff } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useMemo, useState, type JSX } from 'react';
import { useCreateDbCredential, useDbCredential, useUpdateDbCredential } from '../../../../hooks/usePlatformServices';
import { useEnvTemplates } from '../../../../../hooks/useDeploymentPipelines';
import { CREDENTIAL_PRIVILEGES, MASKED_PASSWORD } from '../../../../../constants/platformServices';
import { REQUIRED_FIELD_SX } from '../../../../../constants/styles';
import { buildCredentialPayload, envLabel } from '../../../../utils/platformServices';
import SelectableChoiceCard from '../SelectableChoiceCard';
import type { CredentialFormValues, DbCredential } from '../../../../../types/platformServices';
import type { Notify } from './types';

interface CredentialDialogProps {
  serverId: string;
  orgHandle: string;
  dbName: string;
  defaultUser: string;
  existingCredentials: DbCredential[];
  editingCredentialId: string | null;
  onClose: () => void;
  notify: Notify;
}

const emptyForm: CredentialFormValues = { displayName: '', username: '', password: '', privileges: [], environments: [], isSuperAdmin: false };

export default function CredentialDialog({ serverId, orgHandle, dbName, defaultUser, existingCredentials, editingCredentialId, onClose, notify }: CredentialDialogProps): JSX.Element {
  const isEdit = !!editingCredentialId;
  const { data: environments = [] } = useEnvTemplates(orgHandle);
  const { data: existing, isLoading: loadingExisting } = useDbCredential(serverId, editingCredentialId);
  const create = useCreateDbCredential(serverId);
  const update = useUpdateDbCredential(serverId);

  const [form, setForm] = useState<CredentialFormValues>(emptyForm);
  const [showPassword, setShowPassword] = useState(false);
  const patch = (p: Partial<CredentialFormValues>) => setForm((f) => ({ ...f, ...p }));

  useEffect(() => {
    if (!existing) return;
    setForm({
      displayName: existing.display_name,
      username: existing.username ?? (existing.is_super_admin ? defaultUser : ''),
      password: existing.is_super_admin ? MASKED_PASSWORD : '',
      privileges: existing.is_super_admin ? ['Super Admin'] : existing.privilege_levels.map((p) => p.trim()),
      environments: existing.applicable_environments,
      isSuperAdmin: existing.is_super_admin,
    });
  }, [existing, defaultUser]);

  // Super-admin mode fixes username/password/privileges to the default admin user.
  useEffect(() => {
    if (isEdit) return;
    if (form.isSuperAdmin) {
      patch({ username: defaultUser, password: MASKED_PASSWORD, privileges: ['Super Admin'] });
    } else {
      patch({ username: '', password: '', privileges: [] });
    }
  }, [form.isSuperAdmin, isEdit, defaultUser]);

  const duplicateName = useMemo(() => existingCredentials.some((c) => c.display_name === form.displayName.trim() && c.id !== editingCredentialId), [existingCredentials, form.displayName, editingCredentialId]);
  const nameError = form.displayName.trim() === '' ? '' : duplicateName ? 'A credential with this name already exists.' : '';

  const submitting = create.isPending || update.isPending;
  const canSave = !submitting && !nameError && loadingExisting === false && form.displayName.trim() !== '' && form.environments.length > 0 && (form.isSuperAdmin || (form.username.trim() !== '' && form.password !== '' && form.privileges.length > 0));

  const save = () => {
    if (!canSave) return;
    const payload = buildCredentialPayload(dbName, form);
    const onSuccess = () => {
      notify('success', isEdit ? 'Credential updated.' : 'Credential imported.');
      onClose();
    };
    const onError = (e: unknown) => notify('error', e instanceof Error ? e.message : 'Failed to save the credential.');
    if (isEdit && editingCredentialId) update.mutate({ credentialId: editingCredentialId, payload }, { onSuccess, onError });
    else create.mutate(payload, { onSuccess, onError });
  };

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{isEdit ? 'Update Imported Credentials' : 'Import Credentials'}</DialogTitle>
      <DialogContent>
        <Alert severity="warning" sx={{ mb: 2 }}>
          Imported credentials are available across all projects in your organization. By importing them, you expose this database to be accessed across all projects.
        </Alert>

        {isEdit && loadingExisting ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <Stack gap={2.5} sx={{ mt: 1 }}>
            {!isEdit && (
              <Stack role="radiogroup" aria-label="Credential type" direction={{ xs: 'column', sm: 'row' }} gap={2}>
                <SelectableChoiceCard selected={!form.isSuperAdmin} title="Use Created Credentials" description="Provide the username, password, and privilege level of the created credential." onSelect={() => patch({ isSuperAdmin: false })} />
                <SelectableChoiceCard selected={form.isSuperAdmin} title="Use Super Admin Credentials" description="Proceed with the default super admin credential." onSelect={() => patch({ isSuperAdmin: true })} />
              </Stack>
            )}

            <TextField
              label="Credential Name"
              required
              fullWidth
              size="small"
              value={form.displayName}
              onChange={(e) => patch({ displayName: e.target.value })}
              placeholder="Enter credential name"
              error={!!nameError}
              helperText={nameError || ' '}
              sx={REQUIRED_FIELD_SX}
            />

            {!form.isSuperAdmin && (
              <>
                <TextField label="Username" required fullWidth size="small" value={form.username} onChange={(e) => patch({ username: e.target.value })} placeholder="Enter username" sx={REQUIRED_FIELD_SX} />
                <TextField
                  label="Password"
                  required
                  fullWidth
                  size="small"
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={(e) => patch({ password: e.target.value })}
                  placeholder="Enter password"
                  sx={REQUIRED_FIELD_SX}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton size="small" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((s) => !s)} edge="end">
                          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                />
                <Autocomplete
                  multiple
                  size="small"
                  options={CREDENTIAL_PRIVILEGES}
                  value={form.privileges}
                  onChange={(_, value) => patch({ privileges: value })}
                  renderTags={(value, getTagProps) => value.map((option, index) => <Chip label={option} size="small" {...getTagProps({ index })} key={option} />)}
                  renderInput={(params) => <TextField {...params} label="Privileges" required placeholder="Select privilege level" sx={REQUIRED_FIELD_SX} />}
                />
              </>
            )}

            {form.isSuperAdmin && (
              <Alert severity="info">
                The default super admin user <strong>{defaultUser}</strong> will be used.
              </Alert>
            )}

            <Autocomplete
              multiple
              size="small"
              options={environments.map((e) => e.id)}
              value={form.environments}
              onChange={(_, value) => patch({ environments: value })}
              getOptionLabel={(id) => envLabel(environments, id)}
              renderTags={(value, getTagProps) => value.map((option, index) => <Chip label={envLabel(environments, option)} size="small" {...getTagProps({ index })} key={option} />)}
              renderInput={(params) => <TextField {...params} label="Environments" required placeholder="Select environment" sx={REQUIRED_FIELD_SX} />}
            />
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={!canSave} startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : undefined}>
          {isEdit ? 'Update' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
