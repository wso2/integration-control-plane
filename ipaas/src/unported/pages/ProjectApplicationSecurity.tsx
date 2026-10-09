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

import { Alert, Autocomplete, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, IconButton, ListingTable, PageContent, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import TextField from '../../components/common/TextField';
import { KeyRound, Pencil, Plus, Trash2 } from '@wso2/oxygen-ui-icons-react';
import { useMemo, useState, type JSX } from 'react';
import Authorized from '../../components/Authorized';
import EmptyListing from '../../components/EmptyListing';
import ProjectSettingsTabs from '../../components/Settings/ProjectSettingsTabs';
import { Permissions } from '../../constants/permissions';
import { useProjectId } from '../../hooks/useProjects';
import { useAuthzRoles, useCreateAuthzRole, useDeleteAuthzRole, useUpdateAuthzRole } from '../hooks/useProjectAuthz';
import type { AuthzRole } from '../../types/projectAuthz';
import type { ProjectScope } from '../../nav';

interface RoleDialogProps {
  projectId: string;
  scopeOptions: string[];
  role: AuthzRole | null; // null → create
  existingNames: string[];
  onClose: () => void;
  onDone: (message: string) => void;
}

function RoleDialog({ projectId, scopeOptions, role, existingNames, onClose, onDone }: RoleDialogProps): JSX.Element {
  const create = useCreateAuthzRole(projectId);
  const update = useUpdateAuthzRole(projectId);
  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [selected, setSelected] = useState<string[]>(role?.scopes ?? []);
  const [error, setError] = useState('');

  const saving = create.isPending || update.isPending;

  const nameError = useMemo(() => {
    const trimmed = name.trim();
    if (!trimmed) return 'Role name is required.';
    if (existingNames.some((n) => n.toLowerCase() === trimmed.toLowerCase())) return 'A role with this name already exists.';
    return '';
  }, [name, existingNames]);

  const handleSave = () => {
    setError('');
    const handlers = {
      onSuccess: () => onDone(role ? 'Role updated.' : 'Role created.'),
      onError: (e: Error) => setError(e.message || 'Failed to save the role.'),
    };
    if (role) update.mutate({ roleId: role.id, name: name.trim(), description: description.trim(), scopes: selected }, handlers);
    else create.mutate({ name: name.trim(), description: description.trim(), scopes: selected }, handlers);
  };

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{role ? 'Edit Role' : 'Create Role'}</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <Stack gap={2} sx={{ mt: 1 }}>
          <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} error={!!nameError && !!name} helperText={(!!name && nameError) || ' '} fullWidth autoFocus disabled={!!role} />
          <TextField label="Description" value={description} onChange={(e) => setDescription(e.target.value)} fullWidth multiline minRows={2} />
          <Autocomplete multiple freeSolo options={scopeOptions} value={selected} onChange={(_, v) => setSelected(v as string[])} renderInput={(params) => <TextField {...params} label="API Scopes" placeholder="Type a scope and press Enter" />} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button variant="contained" onClick={handleSave} disabled={!!nameError || saving} startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}>
          {role ? 'Save Changes' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function ApplicationSecurityBody({ projectId }: { projectId: string }): JSX.Element {
  const { data: roles, isLoading, isError, refetch } = useAuthzRoles(projectId);
  const remove = useDeleteAuthzRole(projectId);

  const [dialog, setDialog] = useState<{ role: AuthzRole | null } | null>(null);
  const [deleting, setDeleting] = useState<AuthzRole | null>(null);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Suggest scopes already used by other roles in the project.
  const scopeOptions = useMemo(() => Array.from(new Set((roles ?? []).flatMap((r) => r.scopes))).sort(), [roles]);
  const existingNames = useMemo(() => (roles ?? []).filter((r) => r.id !== dialog?.role?.id).map((r) => r.name), [roles, dialog]);

  const handleDelete = () => {
    if (!deleting) return;
    remove.mutate(deleting.id, {
      onSuccess: () => {
        setDeleting(null);
        setAlert({ type: 'success', message: 'Role deleted.' });
      },
      onError: (e) => {
        setDeleting(null);
        setAlert({ type: 'error', message: e instanceof Error ? e.message : 'Failed to delete the role.' });
      },
    });
  };

  if (isLoading)
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 'calc(100vh - 120px)' }}>
        <CircularProgress />
      </Box>
    );
  if (isError)
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={() => refetch()}>
            Retry
          </Button>
        }>
        Failed to load authorization roles.
      </Alert>
    );

  const list = roles ?? [];

  return (
    <>
      {alert && (
        <Alert severity={alert.type} onClose={() => setAlert(null)} sx={{ mb: 2 }}>
          {alert.message}
        </Alert>
      )}

      <Authorized permissions={Permissions.PROJECT_MANAGE}>
        <Stack direction="row" justifyContent="flex-end" sx={{ mb: 2 }}>
          <Button variant="contained" startIcon={<Plus size={16} />} onClick={() => setDialog({ role: null })}>
            Create Role
          </Button>
        </Stack>
      </Authorized>

      {list.length === 0 ? (
        <EmptyListing icon={<KeyRound size={48} />} title="No authorization roles" description="Create an authorization role to grant API scopes that this project's integrations can consume." />
      ) : (
        <ListingTable.Container>
          <ListingTable>
            <ListingTable.Head>
              <ListingTable.Row>
                <ListingTable.Cell>Name</ListingTable.Cell>
                <ListingTable.Cell>Description</ListingTable.Cell>
                <ListingTable.Cell>Scopes</ListingTable.Cell>
                <ListingTable.Cell align="right">Actions</ListingTable.Cell>
              </ListingTable.Row>
            </ListingTable.Head>
            <ListingTable.Body>
              {list.map((r) => (
                <ListingTable.Row key={r.id}>
                  <ListingTable.Cell>{r.name}</ListingTable.Cell>
                  <ListingTable.Cell>{r.description || '—'}</ListingTable.Cell>
                  <ListingTable.Cell>
                    {r.scopes.length === 0 ? (
                      <Typography variant="body2" color="text.secondary">
                        None
                      </Typography>
                    ) : (
                      <Stack direction="row" gap={0.5} flexWrap="wrap">
                        {r.scopes.map((s) => (
                          <Chip key={s} label={s} size="small" variant="outlined" />
                        ))}
                      </Stack>
                    )}
                  </ListingTable.Cell>
                  <ListingTable.Cell align="right">
                    <Authorized permissions={Permissions.PROJECT_MANAGE}>
                      <Tooltip title="Edit role">
                        <IconButton size="small" aria-label={`Edit ${r.name}`} onClick={() => setDialog({ role: r })}>
                          <Pencil size={16} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete role">
                        <IconButton size="small" color="error" aria-label={`Delete ${r.name}`} onClick={() => setDeleting(r)}>
                          <Trash2 size={16} />
                        </IconButton>
                      </Tooltip>
                    </Authorized>
                  </ListingTable.Cell>
                </ListingTable.Row>
              ))}
            </ListingTable.Body>
          </ListingTable>
        </ListingTable.Container>
      )}

      {dialog && (
        <RoleDialog
          projectId={projectId}
          scopeOptions={scopeOptions}
          role={dialog.role}
          existingNames={existingNames}
          onClose={() => setDialog(null)}
          onDone={(message) => {
            setDialog(null);
            setAlert({ type: 'success', message });
          }}
        />
      )}

      {deleting && (
        <Dialog open onClose={() => setDeleting(null)} maxWidth="xs" fullWidth>
          <DialogTitle>Delete role &lsquo;{deleting.name}&rsquo;?</DialogTitle>
          <DialogContent>
            <DialogContentText>This permanently removes the role and its scope assignments. Integrations relying on it will lose access.</DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDeleting(null)} disabled={remove.isPending}>
              Cancel
            </Button>
            <Button variant="contained" color="error" onClick={handleDelete} disabled={remove.isPending} startIcon={remove.isPending ? <CircularProgress size={16} color="inherit" /> : undefined}>
              Delete
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </>
  );
}

export default function ProjectApplicationSecurity({ project }: ProjectScope): JSX.Element {
  const { project: data, isLoading } = useProjectId(project);

  return (
    <PageContent>
      <ProjectSettingsTabs active="application-security" />
      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 'calc(100vh - 120px)' }}>
          <CircularProgress />
        </Box>
      ) : !data ? (
        <Typography>Project not found</Typography>
      ) : (
        <ApplicationSecurityBody key={data.id} projectId={data.id} />
      )}
    </PageContent>
  );
}
