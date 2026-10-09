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

import { Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, ListingTable, PageContent, Stack, Typography } from '@wso2/oxygen-ui';
import TextField from '../../components/common/TextField';
import { GitBranch, Plus } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import Authorized from '../../components/Authorized';
import EmptyListing from '../../components/EmptyListing';
import ComponentSettingsTabs from '../components/Settings/ComponentSettingsTabs';
import TrackDeleteButton from '../components/Settings/TrackDeleteButton';
import { Permissions } from '../../constants/permissions';
import { useComponentByHandler, useCreateDeploymentTrack } from '../../hooks/useComponents';
import { useOrgUuid } from '../../hooks/useOrgUuid';
import { useProjectId } from '../../hooks/useProjects';
import type { DeploymentTrack } from '../../types/component';
import type { ComponentScope } from '../../nav';

function CreateTrackDialog({ orgUuid, componentId, onClose, onDone }: { orgUuid: string; componentId: string; onClose: () => void; onDone: (msg: string) => void }): JSX.Element {
  const create = useCreateDeploymentTrack();
  const [apiVersion, setApiVersion] = useState('v1.0');
  const [branch, setBranch] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  const valid = apiVersion.trim() && branch.trim();
  const handleCreate = () => {
    setError('');
    create.mutate(
      { orgUuid, componentId, apiVersion: apiVersion.trim(), branch: branch.trim(), description: description.trim() },
      { onSuccess: () => onDone('Deployment track created.'), onError: (e) => setError(e instanceof Error ? e.message : 'Failed to create the deployment track.') },
    );
  };

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Create Deployment Track</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <Stack gap={2} sx={{ mt: 1 }}>
          <TextField label="API Version" value={apiVersion} onChange={(e) => setApiVersion(e.target.value)} fullWidth required />
          <TextField label="Branch" value={branch} onChange={(e) => setBranch(e.target.value)} fullWidth required placeholder="main" />
          <TextField label="Description" value={description} onChange={(e) => setDescription(e.target.value)} fullWidth multiline minRows={2} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={create.isPending}>
          Cancel
        </Button>
        <Button variant="contained" onClick={handleCreate} disabled={!valid || create.isPending} startIcon={create.isPending ? <CircularProgress size={16} color="inherit" /> : <Plus size={16} />}>
          {create.isPending ? 'Creating…' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function TracksBody({ orgHandler, projectId, componentId, tracks }: { orgHandler: string; projectId: string; componentId: string; tracks: DeploymentTrack[] }): JSX.Element {
  const orgUuid = useOrgUuid();
  const [creating, setCreating] = useState(false);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const onlyTrack = tracks.length <= 1;

  return (
    <>
      {alert && (
        <Alert severity={alert.type} onClose={() => setAlert(null)} sx={{ mb: 2 }}>
          {alert.message}
        </Alert>
      )}

      <Stack direction="row" justifyContent="flex-end" sx={{ mb: 2 }}>
        <Authorized permissions={Permissions.INTEGRATION_MANAGE}>
          <Button variant="contained" startIcon={<Plus size={16} />} onClick={() => setCreating(true)} disabled={!orgUuid}>
            Create Deployment Track
          </Button>
        </Authorized>
      </Stack>

      {tracks.length === 0 ? (
        <EmptyListing icon={<GitBranch size={48} />} title="No deployment tracks" description="Create a deployment track to build and deploy this integration from a branch." />
      ) : (
        <ListingTable.Container>
          <ListingTable>
            <ListingTable.Head>
              <ListingTable.Row>
                <ListingTable.Cell>Branch</ListingTable.Cell>
                <ListingTable.Cell>API Version</ListingTable.Cell>
                <ListingTable.Cell>Description</ListingTable.Cell>
                <ListingTable.Cell align="right">Actions</ListingTable.Cell>
              </ListingTable.Row>
            </ListingTable.Head>
            <ListingTable.Body>
              {tracks.map((t) => (
                <ListingTable.Row key={t.id}>
                  <ListingTable.Cell>
                    <Stack direction="row" alignItems="center" gap={0.5}>
                      <GitBranch size={14} />
                      {t.branch || '—'}
                      {t.latest && <Chip label="Latest" size="small" variant="outlined" color="primary" />}
                    </Stack>
                  </ListingTable.Cell>
                  <ListingTable.Cell>{t.apiVersion || '—'}</ListingTable.Cell>
                  <ListingTable.Cell>{t.description || '—'}</ListingTable.Cell>
                  <ListingTable.Cell align="right">
                    <Authorized permissions={Permissions.INTEGRATION_MANAGE}>
                      <TrackDeleteButton
                        orgHandler={orgHandler}
                        projectId={projectId}
                        componentId={componentId}
                        trackId={t.id}
                        label={t.branch || t.apiVersion || 'deployment track'}
                        disabled={onlyTrack}
                        disabledTooltip="Cannot delete the last deployment track"
                        confirmTitle="Delete deployment track?"
                        confirmBody={
                          <>
                            This permanently deletes the <strong>{t.branch || t.apiVersion}</strong> deployment track. All associated deployments will be lost.
                          </>
                        }
                        onResult={setAlert}
                      />
                    </Authorized>
                  </ListingTable.Cell>
                </ListingTable.Row>
              ))}
            </ListingTable.Body>
          </ListingTable>
        </ListingTable.Container>
      )}

      {creating && orgUuid && (
        <CreateTrackDialog
          orgUuid={orgUuid}
          componentId={componentId}
          onClose={() => setCreating(false)}
          onDone={(msg) => {
            setCreating(false);
            setAlert({ type: 'success', message: msg });
          }}
        />
      )}
    </>
  );
}

export default function ComponentDeploymentTracks({ org, project, component }: ComponentScope): JSX.Element {
  const { projectId } = useProjectId(project);
  const { data: comp, isLoading } = useComponentByHandler(projectId, component);

  return (
    <PageContent>
      <ComponentSettingsTabs active="deployment-tracks" />
      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : !comp ? (
        <Typography>Integration not found</Typography>
      ) : (
        <TracksBody orgHandler={org} projectId={projectId} componentId={comp.id} tracks={comp.deploymentTracks ?? []} />
      )}
    </PageContent>
  );
}
