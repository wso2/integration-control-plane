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

import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, IconButton, ListingTable, PageContent, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import TextField from '../../components/common/TextField';
import { ArrowLeft, Network, Plus, Trash2 } from '@wso2/oxygen-ui-icons-react';
import { useMemo, useState, type JSX } from 'react';
import Authorized from '../../components/Authorized';
import EmptyListing from '../../components/EmptyListing';
import ProjectSettingsTabs from '../../components/Settings/ProjectSettingsTabs';
import TailscaleOverview from '../../components/Overview/tailscale-vpn/TailscaleOverview';
import { Permissions } from '../../constants/permissions';
import { useAccessControl } from '../../contexts/AccessControlContext';
import { useComponentByHandler, useDeleteComponent } from '../../hooks/useComponents';
import { useEnvironments } from '../../hooks/useEnvironments';
import { useProjectId } from '../../hooks/useProjects';
import { useCreateTailscaleProxy, useTailscaleComponents } from '../../hooks/useTailscale';
import { useComponentNameAvailability } from '../../hooks/useRepository';
import { toHandler } from '../../utils/string';
import type { Component } from '../../types/component';
import type { ProjectScope } from '../../nav';

type View = { kind: 'list' } | { kind: 'create' } | { kind: 'config'; handler: string };

function CreateProxyForm({ projectId, onCancel, onCreated }: { projectId: string; onCancel: () => void; onCreated: (handler: string) => void }): JSX.Element {
  const create = useCreateTailscaleProxy(projectId);
  const [displayName, setDisplayName] = useState('');
  const [handle, setHandle] = useState('');
  const [handleTouched, setHandleTouched] = useState(false);
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  // The handle mirrors the name until the user edits it directly.
  const onNameChange = (next: string) => {
    setDisplayName(next);
    if (!handleTouched) setHandle(toHandler(next));
  };
  const onHandleChange = (next: string) => {
    setHandleTouched(true);
    setHandle(toHandler(next));
  };

  const { data: availability, isFetching: checkingHandle } = useComponentNameAvailability(projectId, handle);
  const nameError = !displayName.trim() ? 'Name is required.' : '';
  const handleError = useMemo(() => {
    if (!handle) return 'Handle is required.';
    if (!/^[a-z][a-z0-9-]*$/.test(handle)) return 'Use lowercase letters, numbers, and hyphens; start with a letter.';
    if (handle.length >= 3 && availability && !availability.componentNameUnique) return 'A component with this handle already exists.';
    return '';
  }, [handle, availability]);

  const canCreate = !nameError && !handleError && !checkingHandle && !create.isPending;

  const handleCreate = () => {
    setError('');
    create.mutate(
      { name: handle, displayName: displayName.trim(), description: description.trim() },
      {
        onSuccess: (res) => onCreated(res.handle || handle),
        onError: (e) => setError(e instanceof Error ? e.message : 'Failed to create the proxy.'),
      },
    );
  };

  return (
    <Box sx={{ maxWidth: 640 }}>
      <Button size="small" startIcon={<ArrowLeft size={14} />} onClick={onCancel} sx={{ mb: 2 }}>
        Back to list
      </Button>
      <Typography variant="h6" sx={{ mb: 2 }}>
        Create Tailscale VPN
      </Typography>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <Stack gap={2}>
        <Stack direction="row" gap={2} alignItems="flex-start">
          <TextField label="Name" value={displayName} onChange={(e) => onNameChange(e.target.value)} fullWidth required error={!!displayName && !!nameError} helperText={(!!displayName && nameError) || ' '} autoFocus sx={{ flex: 1 }} />
          <TextField
            label="Handle"
            value={handle}
            onChange={(e) => onHandleChange(e.target.value)}
            fullWidth
            required
            error={(!!handle || handleTouched) && !!handleError}
            helperText={((!!handle || handleTouched) && handleError) || 'Unique project handle for this proxy.'}
            sx={{ flex: 1 }}
          />
        </Stack>
        <TextField label="Description" value={description} onChange={(e) => setDescription(e.target.value)} fullWidth multiline minRows={2} />
        <Box>
          <Button variant="contained" onClick={handleCreate} disabled={!canCreate} startIcon={create.isPending ? <CircularProgress size={16} color="inherit" /> : <Plus size={16} />}>
            {create.isPending ? 'Creating…' : 'Create'}
          </Button>
        </Box>
      </Stack>
    </Box>
  );
}

function ConfigView({ orgHandler, projectId, handler, canManage, onBack }: { orgHandler: string; projectId: string; handler: string; canManage: boolean; onBack: () => void }): JSX.Element {
  const { data: detail, isLoading } = useComponentByHandler(projectId, handler);
  const { data: environments = [] } = useEnvironments(orgHandler, projectId);

  return (
    <Box>
      <Button size="small" startIcon={<ArrowLeft size={14} />} onClick={onBack} sx={{ mb: 2 }}>
        Back to list
      </Button>
      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 'calc(100vh - 120px)' }}>
          <CircularProgress />
        </Box>
      ) : !detail ? (
        <Typography>Proxy not found</Typography>
      ) : (
        <TailscaleOverview orgHandler={orgHandler} projectId={projectId} component={detail} environments={environments} canManage={canManage} />
      )}
    </Box>
  );
}

export default function ProjectVpnConfiguration({ org, project }: ProjectScope): JSX.Element {
  const { projectId } = useProjectId(project);
  const { hasAnyPermission } = useAccessControl();
  const canManage = hasAnyPermission([Permissions.PROJECT_MANAGE], projectId || undefined);
  const { data: proxies = [], isLoading } = useTailscaleComponents(org, projectId);
  const del = useDeleteComponent();

  const [view, setView] = useState<View>({ kind: 'list' });
  const [deleting, setDeleting] = useState<Component | null>(null);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handleDelete = () => {
    if (!deleting) return;
    del.mutate(
      { orgHandler: org, componentId: deleting.id, projectId },
      {
        onSuccess: () => {
          setDeleting(null);
          setAlert({ type: 'success', message: 'Proxy deleted.' });
        },
        onError: (e) => {
          setDeleting(null);
          setAlert({ type: 'error', message: e instanceof Error ? e.message : 'Failed to delete the proxy.' });
        },
      },
    );
  };

  return (
    <PageContent>
      <ProjectSettingsTabs active="vpn-configuration" />

      {alert && (
        <Alert severity={alert.type} onClose={() => setAlert(null)} sx={{ mb: 2 }}>
          {alert.message}
        </Alert>
      )}

      {view.kind === 'create' ? (
        <CreateProxyForm projectId={projectId} onCancel={() => setView({ kind: 'list' })} onCreated={(handler) => setView({ kind: 'config', handler })} />
      ) : view.kind === 'config' ? (
        <ConfigView orgHandler={org} projectId={projectId} handler={view.handler} canManage={canManage} onBack={() => setView({ kind: 'list' })} />
      ) : isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 'calc(100vh - 120px)' }}>
          <CircularProgress />
        </Box>
      ) : proxies.length === 0 ? (
        <EmptyListing
          icon={<Network size={48} />}
          title="Create your Tailscale VPN"
          description="Securely connect this project's integrations to a private network with a Tailscale VPN proxy."
          showAction={canManage}
          actionLabel="Create"
          onAction={() => setView({ kind: 'create' })}
        />
      ) : (
        <>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
            <Typography variant="h6">Tailscale Proxies</Typography>
            <Authorized permissions={Permissions.PROJECT_MANAGE}>
              <Button variant="contained" startIcon={<Plus size={16} />} onClick={() => setView({ kind: 'create' })}>
                Create
              </Button>
            </Authorized>
          </Stack>
          <ListingTable.Container>
            <ListingTable>
              <ListingTable.Head>
                <ListingTable.Row>
                  <ListingTable.Cell>Name</ListingTable.Cell>
                  <ListingTable.Cell>Description</ListingTable.Cell>
                  <ListingTable.Cell align="right">Actions</ListingTable.Cell>
                </ListingTable.Row>
              </ListingTable.Head>
              <ListingTable.Body>
                {proxies.map((p) => (
                  <ListingTable.Row key={p.id} hover sx={{ cursor: 'pointer' }} onClick={() => setView({ kind: 'config', handler: p.handler })}>
                    <ListingTable.Cell>{p.displayName || p.handler}</ListingTable.Cell>
                    <ListingTable.Cell>{p.description || '—'}</ListingTable.Cell>
                    <ListingTable.Cell align="right">
                      <Authorized permissions={Permissions.PROJECT_MANAGE}>
                        <Tooltip title="Delete proxy">
                          <IconButton
                            size="small"
                            color="error"
                            aria-label={`Delete ${p.displayName || p.handler}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleting(p);
                            }}>
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
        </>
      )}

      {deleting && (
        <Dialog open onClose={() => setDeleting(null)} maxWidth="xs" fullWidth>
          <DialogTitle>Delete &lsquo;{deleting.displayName || deleting.handler}&rsquo;?</DialogTitle>
          <DialogContent>
            <DialogContentText>This permanently deletes the Tailscale proxy and its configuration. This cannot be undone.</DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDeleting(null)} disabled={del.isPending}>
              Cancel
            </Button>
            <Button variant="contained" color="error" onClick={handleDelete} disabled={del.isPending} startIcon={del.isPending ? <CircularProgress size={16} color="inherit" /> : undefined}>
              Delete
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </PageContent>
  );
}
