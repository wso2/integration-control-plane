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

import { Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, IconButton, ListingTable, PageContent, PageTitle, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { KeyRound, Pencil, Plus, Trash2 } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useMemo, useState, type JSX } from 'react';
import EnvironmentSelect from '../components/common/EnvironmentSelect';
import Authorized from '../components/Authorized';
import EmptyListing from '../components/EmptyListing';
import DeploymentTrackBar from '../components/DeploymentTrackBar';
import ConfigEditor, { type EditorContext } from '../components/Configs/ConfigEditor';
import { Permissions } from '../constants/permissions';
import { useComponentByHandler } from '../hooks/useComponents';
import { useComponentDeployment } from '../hooks/useDeployments';
import { useConfigMaps, useContainerConfigMounts, useDeleteConfig, useRelease, useSecrets } from '../hooks/useDevopsConfigs';
import { useEnvironments } from '../hooks/useEnvironments';
import { useOrgUuid } from '../hooks/useOrgUuid';
import { useProjectId } from '../hooks/useProjects';
import { buildConfigRows, mainContainer } from '../utils/devopsConfigs';
import type { ConfigRow } from '../types/devopsConfigs';
import type { ComponentScope } from '../nav';

type View = { kind: 'list' } | { kind: 'create' } | { kind: 'edit'; row: ConfigRow };

export default function ComponentConfigs({ org, project, component }: ComponentScope): JSX.Element {
  const orgUuid = useOrgUuid();
  const { projectId } = useProjectId(project);
  const { data: comp, isLoading } = useComponentByHandler(projectId, component);

  const tracks = useMemo(() => comp?.deploymentTracks ?? [], [comp?.deploymentTracks]);
  const [trackId, setTrackId] = useState('');
  useEffect(() => {
    if (tracks.length) setTrackId((prev) => (prev && tracks.some((t) => t.id === prev) ? prev : (tracks.find((t) => t.latest)?.id ?? tracks[0].id)));
  }, [tracks]);

  const { data: environments = [] } = useEnvironments(org, projectId);
  const [envId, setEnvId] = useState('');
  useEffect(() => {
    if (environments.length) setEnvId((prev) => (prev && environments.some((e) => e.id === prev) ? prev : environments[0].id));
  }, [environments]);

  const { data: deployment } = useComponentDeployment(org, orgUuid ?? '', comp?.id ?? '', trackId, envId);
  const releaseId = deployment?.releaseId ?? '';
  const { data: release } = useRelease(projectId, comp?.id, releaseId);
  const containerId = useMemo(() => mainContainer(release?.containers)?.ID ?? '', [release]);

  const { data: mounts = [], isLoading: loadingMounts } = useContainerConfigMounts(projectId, comp?.id, releaseId, containerId);
  const { data: configMaps = [] } = useConfigMaps(projectId, envId);
  const { data: secrets = [] } = useSecrets(projectId, envId);
  const rows = useMemo(() => buildConfigRows(mounts, configMaps, secrets), [mounts, configMaps, secrets]);

  const del = useDeleteConfig(projectId);
  const [view, setView] = useState<View>({ kind: 'list' });
  const [deleting, setDeleting] = useState<ConfigRow | null>(null);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Switching track/environment changes the editor's context (release/container/env);
  // drop any open create/edit view so ConfigEditor can't operate on a stale row.
  useEffect(() => {
    setView({ kind: 'list' });
  }, [trackId, envId]);

  const handleDelete = () => {
    if (!deleting || !comp) return;
    del.mutate(
      { componentId: comp.id, releaseId, containerId, mountId: deleting.mount.ID },
      {
        onSuccess: () => {
          setDeleting(null);
          setAlert({ type: 'success', message: 'Configuration removed.' });
        },
        onError: (e) => {
          setDeleting(null);
          setAlert({ type: 'error', message: e instanceof Error ? e.message : 'Failed to remove the configuration.' });
        },
      },
    );
  };

  const envSelect = environments.length > 1 && <EnvironmentSelect environments={environments} value={envId} onChange={setEnvId} />;

  const ctx: EditorContext = { projectId, componentId: comp?.id ?? '', releaseId, containerId, envId };
  const onEditorDone = (message: string) => {
    setView({ kind: 'list' });
    setAlert({ type: 'success', message });
  };

  return (
    <>
      {tracks.length > 0 && <DeploymentTrackBar tracks={tracks} selectedId={trackId} onChange={setTrackId} orgHandler={org} projectHandler={project} componentHandler={component} extra={envSelect} />}
      <PageContent>
        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 'calc(100vh - 120px)' }}>
            <CircularProgress />
          </Box>
        ) : !comp ? (
          <Typography>Integration not found</Typography>
        ) : !releaseId || !containerId ? (
          <Alert severity="info">Deploy this integration to the selected environment to manage its configs and secrets.</Alert>
        ) : view.kind === 'create' ? (
          <ConfigEditor ctx={ctx} onBack={() => setView({ kind: 'list' })} onSaved={onEditorDone} onError={(message) => setAlert({ type: 'error', message })} />
        ) : view.kind === 'edit' ? (
          <ConfigEditor ctx={ctx} existing={view.row} onBack={() => setView({ kind: 'list' })} onSaved={onEditorDone} onError={(message) => setAlert({ type: 'error', message })} />
        ) : (
          <>
            <PageTitle>
              <PageTitle.Header>Configs &amp; Secrets</PageTitle.Header>
              <PageTitle.Actions>
                <Authorized permissions={Permissions.INTEGRATION_MANAGE}>
                  <Button variant="contained" startIcon={<Plus size={16} />} onClick={() => setView({ kind: 'create' })}>
                    Create
                  </Button>
                </Authorized>
              </PageTitle.Actions>
            </PageTitle>

            {alert && (
              <Alert severity={alert.type} onClose={() => setAlert(null)} sx={{ mb: 2 }}>
                {alert.message}
              </Alert>
            )}

            {loadingMounts ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                <CircularProgress />
              </Box>
            ) : rows.length === 0 ? (
              <EmptyListing icon={<KeyRound size={48} />} title="No configs or secrets" description="Inject environment variables or mount files into this integration's container." />
            ) : (
              <ListingTable.Container>
                <ListingTable>
                  <ListingTable.Head>
                    <ListingTable.Row>
                      <ListingTable.Cell>Name</ListingTable.Cell>
                      <ListingTable.Cell>Type</ListingTable.Cell>
                      <ListingTable.Cell>Details</ListingTable.Cell>
                      <ListingTable.Cell align="right">Actions</ListingTable.Cell>
                    </ListingTable.Row>
                  </ListingTable.Head>
                  <ListingTable.Body>
                    {rows.map((r) => (
                      <ListingTable.Row key={r.mount.ID}>
                        <ListingTable.Cell>
                          <Stack direction="row" alignItems="center" gap={1}>
                            {r.name}
                            {r.isSecret && <Chip label="Secret" size="small" variant="outlined" color="warning" />}
                          </Stack>
                        </ListingTable.Cell>
                        <ListingTable.Cell>{r.kind === 'fileMount' ? 'File Mount' : 'Environment Variables'}</ListingTable.Cell>
                        <ListingTable.Cell>{r.kind === 'fileMount' ? r.mount.mount_path || '—' : r.keys.join(', ') || '—'}</ListingTable.Cell>
                        <ListingTable.Cell align="right">
                          <Authorized permissions={Permissions.INTEGRATION_MANAGE}>
                            <Tooltip title="Edit">
                              <IconButton size="small" aria-label={`Edit ${r.name}`} onClick={() => setView({ kind: 'edit', row: r })}>
                                <Pencil size={16} />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Remove">
                              <IconButton size="small" color="error" aria-label={`Remove ${r.name}`} onClick={() => setDeleting(r)}>
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
          </>
        )}

        {deleting && (
          <Dialog open onClose={() => setDeleting(null)} maxWidth="xs" fullWidth>
            <DialogTitle>Remove &lsquo;{deleting.name}&rsquo;?</DialogTitle>
            <DialogContent>
              <DialogContentText>This unmounts the configuration from the container and redeploys. This cannot be undone.</DialogContentText>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setDeleting(null)} disabled={del.isPending}>
                Cancel
              </Button>
              <Button variant="contained" color="error" onClick={handleDelete} disabled={del.isPending} startIcon={del.isPending ? <CircularProgress size={16} color="inherit" /> : undefined}>
                Remove
              </Button>
            </DialogActions>
          </Dialog>
        )}
      </PageContent>
    </>
  );
}
