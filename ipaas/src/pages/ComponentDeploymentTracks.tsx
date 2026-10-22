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

import { Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, InputAdornment, ListingTable, MenuItem, PageContent, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import TextField from '../components/common/TextField';
import { GitBranch, Pencil, Plus } from '@wso2/oxygen-ui-icons-react';
import { useState, type JSX } from 'react';
import Authorized from '../components/Authorized';
import EmptyListing from '../components/EmptyListing';
import ComponentSettingsTabs from '../components/Settings/ComponentSettingsTabs';
import TrackDeleteButton from '../components/Settings/TrackDeleteButton';
import { Permissions } from '../constants/permissions';
import { useComponentByHandler, useCreateDeploymentTrack, useUpdateDeploymentTrack } from '../hooks/useComponents';
import { useEnvironments } from '../hooks/useEnvironments';
import { useOrgUuid } from '../hooks/useOrgUuid';
import { useProjectId } from '../hooks/useProjects';
import { useComponentRepository, useRepoBranches } from '../hooks/useRepository';
import type { ComponentScope } from '../nav';
import type { DeploymentTrack } from '../types/component';
import type { Environment } from '../types/environment';
import type { Repository } from '../types/repository';
import { apiVersionError, hasVersionedApis, nextApiVersion, trackBranchOptions } from '../utils/deploymentTracks';

type Notice = { type: 'success' | 'error'; message: string };

const branchAdornment = {
  input: {
    startAdornment: (
      <InputAdornment position="start">
        <GitBranch size={16} />
      </InputAdornment>
    ),
  },
};

interface BranchFieldProps {
  repository: Repository | null;
  value: string;
  onChange: (branch: string) => void;
  tracks: DeploymentTrack[];
  /** The track being edited; absent for a new one. */
  editingId?: string;
  /** Why the branch can't be changed, when it can't. */
  lockedReason?: string;
}

/**
 * The branch a track builds, picked from the repository's branches. A list
 * that can't be loaded (no access to the repository, say) falls back to typing
 * the name, so a track can still be created.
 */
function BranchField({ repository, value, onChange, tracks, editingId, lockedReason }: BranchFieldProps): JSX.Element {
  const { data: branches, isLoading } = useRepoBranches(repository?.organizationApp ?? '', repository?.nameApp ?? '', false);

  if (lockedReason) return <TextField label="Branch" value={value} fullWidth disabled helperText={lockedReason} slotProps={branchAdornment} />;

  if (!isLoading && !branches?.length) {
    return <TextField label="Branch" value={value} onChange={(e) => onChange(e.target.value)} fullWidth required helperText="The repository's branches could not be listed, so enter the branch to build." slotProps={branchAdornment} />;
  }

  const options = trackBranchOptions(branches ?? [], tracks, editingId, value);
  return (
    <TextField
      select
      label="Branch"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      fullWidth
      required
      disabled={isLoading}
      helperText={isLoading ? 'Loading branches…' : 'The branch this track builds and deploys. A branch can have one track.'}
      slotProps={branchAdornment}>
      {options.map((b) => (
        <MenuItem key={b.name} value={b.name} disabled={b.inUse}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2} sx={{ width: '100%' }}>
            <span>
              {b.name}
              {b.isDefault ? ' (default)' : ''}
            </span>
            {b.inUse && (
              <Typography variant="caption" color="text.secondary">
                Has a deployment track
              </Typography>
            )}
          </Stack>
        </MenuItem>
      ))}
    </TextField>
  );
}

const API_VERSION_HELP = "Part of this track's API URL. It can't be changed later.";

interface ApiVersionFieldProps {
  value: string;
  onChange: (version: string) => void;
  /** Why the value can't be saved, when it can't. */
  error: string | null;
  /** The track already has a version, which never changes. */
  locked: boolean;
  /** A new track needs one; a track created before versions may stay without. */
  required: boolean;
}

function ApiVersionField({ value, onChange, error, locked, required }: ApiVersionFieldProps): JSX.Element {
  if (locked) return <TextField label="API Version" value={value} fullWidth disabled helperText="Part of this track's API URL, so it can't be changed." />;
  return <TextField label="API Version" value={value} onChange={(e) => onChange(e.target.value)} fullWidth required={required} error={!!error} helperText={error ?? API_VERSION_HELP} />;
}

interface TrackDialogProps {
  orgUuid: string;
  componentId: string;
  repository: Repository | null;
  tracks: DeploymentTrack[];
  /** The integration's APIs are versioned per track, so the dialog asks for the version. */
  versionedApis: boolean;
  /** The track to edit; absent creates one. */
  track?: DeploymentTrack;
  onClose: () => void;
  onDone: (msg: string) => void;
}

function TrackDialog({ orgUuid, componentId, repository, tracks, versionedApis, track, onClose, onDone }: TrackDialogProps): JSX.Element {
  const create = useCreateDeploymentTrack();
  const update = useUpdateDeploymentTrack();
  const [branch, setBranch] = useState(track?.branch ?? '');
  const [description, setDescription] = useState(track?.description ?? '');
  // A new track starts on the version the BFF would assign; a track without one starts empty,
  // since saving a version fixes it for good.
  const [apiVersion, setApiVersion] = useState(track ? (track.apiVersion ?? '') : nextApiVersion(tracks.map((t) => t.apiVersion)));
  const [error, setError] = useState('');
  const pending = create.isPending || update.isPending;
  // Typed in when the branches can't be listed, so checked here as well as in the list.
  const taken = tracks.some((t) => t.id !== track?.id && t.branch === branch.trim());
  // The default track builds the integration's own branch, which the BFF keeps it on.
  const lockedReason = track?.latest ? "The default track's branch can't be changed." : undefined;
  const versionLocked = !!track?.apiVersion;
  // Only a version this dialog can still set is sent: a new track's, or one an older track lacks.
  // Editing such a track may leave it empty.
  const sendsVersion = versionedApis && !versionLocked && (!track || apiVersion.trim() !== '');
  const versionError = sendsVersion ? apiVersionError(apiVersion.trim(), tracks, track?.id) : null;
  const onError = (e: unknown) => setError(e instanceof Error ? e.message : `Failed to ${track ? 'update' : 'create'} the deployment track.`);

  const handleSave = () => {
    setError('');
    const fields = { branch: lockedReason ? undefined : branch.trim(), description: description.trim(), apiVersion: sendsVersion ? apiVersion.trim() : undefined };
    if (track) update.mutate({ componentId, deploymentTrackId: track.id, ...fields }, { onSuccess: () => onDone('Deployment track updated.'), onError });
    else create.mutate({ orgUuid, componentId, ...fields, branch: branch.trim() }, { onSuccess: () => onDone('Deployment track created.'), onError });
  };

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{track ? 'Edit Deployment Track' : 'Create Deployment Track'}</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <Stack gap={2} sx={{ mt: 1 }}>
          <BranchField repository={repository} value={branch} onChange={setBranch} tracks={tracks} editingId={track?.id} lockedReason={lockedReason} />
          {versionedApis && <ApiVersionField value={apiVersion} onChange={setApiVersion} error={versionError} locked={versionLocked} required={!track} />}
          <TextField label="Description" value={description} onChange={(e) => setDescription(e.target.value)} fullWidth multiline minRows={2} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button variant="contained" onClick={handleSave} disabled={!branch.trim() || taken || !!versionError || pending} startIcon={pending ? <CircularProgress size={16} color="inherit" /> : track ? undefined : <Plus size={16} />}>
          {track ? (pending ? 'Saving…' : 'Save') : pending ? 'Creating…' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function TrackEnvironments({ track, environments }: { track: DeploymentTrack; environments: Environment[] }): JSX.Element {
  const deployed = track.environments ?? [];
  if (!deployed.length) return <>Not deployed</>;
  return (
    <Stack direction="row" gap={0.5} flexWrap="wrap">
      {deployed.map((d) => (
        <Chip key={d.environment} size="small" variant="outlined" color={d.ready ? 'success' : 'warning'} label={environments.find((e) => e.id === d.environment || e.name === d.environment)?.name ?? d.environment} />
      ))}
    </Stack>
  );
}

interface TracksBodyProps {
  scope: ComponentScope;
  projectId: string;
  componentId: string;
  tracks: DeploymentTrack[];
  deploymentTracksEnabled: boolean;
  versionedApis: boolean;
}

function TracksBody({ scope, projectId, componentId, tracks, deploymentTracksEnabled, versionedApis }: TracksBodyProps): JSX.Element {
  const orgUuid = useOrgUuid();
  const { data: environments = [] } = useEnvironments(orgUuid ?? '', projectId);
  const { data: repository = null } = useComponentRepository(projectId, scope.component);
  const [dialog, setDialog] = useState<{ track?: DeploymentTrack } | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const onlyTrack = tracks.length <= 1;

  return (
    <>
      {notice && (
        <Alert severity={notice.type} onClose={() => setNotice(null)} sx={{ mb: 2 }}>
          {notice.message}
        </Alert>
      )}

      {deploymentTracksEnabled ? (
        <Stack direction="row" justifyContent="flex-end" sx={{ mb: 2 }}>
          <Authorized permissions={Permissions.INTEGRATION_MANAGE}>
            <Button variant="contained" startIcon={<Plus size={16} />} onClick={() => setDialog({})} disabled={!orgUuid}>
              Create Deployment Track
            </Button>
          </Authorized>
        </Stack>
      ) : (
        <Alert severity="info" sx={{ mb: 2 }}>
          This integration was created before deployment tracks, so it builds and deploys a single branch.
        </Alert>
      )}

      {tracks.length === 0 ? (
        <EmptyListing icon={<GitBranch size={48} />} title="No deployment tracks" description="Create a deployment track to build and deploy this integration from a branch." />
      ) : (
        <ListingTable.Container>
          <ListingTable>
            <ListingTable.Head>
              <ListingTable.Row>
                <ListingTable.Cell>Branch</ListingTable.Cell>
                {versionedApis && <ListingTable.Cell>API Version</ListingTable.Cell>}
                <ListingTable.Cell>Description</ListingTable.Cell>
                <ListingTable.Cell>Auto Deploy</ListingTable.Cell>
                <ListingTable.Cell>Environments</ListingTable.Cell>
                {deploymentTracksEnabled && <ListingTable.Cell align="right">Actions</ListingTable.Cell>}
              </ListingTable.Row>
            </ListingTable.Head>
            <ListingTable.Body>
              {tracks.map((t) => (
                <ListingTable.Row key={t.id}>
                  <ListingTable.Cell>
                    <Stack direction="row" alignItems="center" gap={0.5}>
                      <GitBranch size={14} />
                      {t.branch || '—'}
                      {t.latest && <Chip label="Default" size="small" variant="outlined" color="primary" />}
                    </Stack>
                  </ListingTable.Cell>
                  {versionedApis && <ListingTable.Cell>{t.apiVersion || '—'}</ListingTable.Cell>}
                  <ListingTable.Cell>{t.description || '—'}</ListingTable.Cell>
                  <ListingTable.Cell>{t.autoDeployEnabled ? 'On' : 'Off'}</ListingTable.Cell>
                  <ListingTable.Cell>
                    <TrackEnvironments track={t} environments={environments} />
                  </ListingTable.Cell>
                  {deploymentTracksEnabled && (
                    <ListingTable.Cell align="right">
                      <Authorized permissions={Permissions.INTEGRATION_MANAGE}>
                        <Stack direction="row" justifyContent="flex-end" gap={0.5}>
                          <Tooltip title="Edit">
                            <IconButton size="small" aria-label={`Edit ${t.branch || 'deployment track'}`} onClick={() => setDialog({ track: t })}>
                              <Pencil size={16} />
                            </IconButton>
                          </Tooltip>
                          <TrackDeleteButton
                            orgHandler={scope.org}
                            projectId={projectId}
                            componentId={componentId}
                            trackId={t.id}
                            label={t.branch || 'deployment track'}
                            disabled={onlyTrack}
                            disabledTooltip="Cannot delete the last deployment track"
                            confirmTitle="Delete deployment track?"
                            confirmBody={
                              <>
                                This permanently deletes the <strong>{t.branch}</strong> deployment track, undeploys it from every environment, and deletes its configs and secrets.
                              </>
                            }
                            onResult={setNotice}
                          />
                        </Stack>
                      </Authorized>
                    </ListingTable.Cell>
                  )}
                </ListingTable.Row>
              ))}
            </ListingTable.Body>
          </ListingTable>
        </ListingTable.Container>
      )}

      {dialog && orgUuid && (
        <TrackDialog
          orgUuid={orgUuid}
          componentId={componentId}
          repository={repository}
          tracks={tracks}
          versionedApis={versionedApis}
          track={dialog.track}
          onClose={() => setDialog(null)}
          onDone={(msg) => {
            setDialog(null);
            setNotice({ type: 'success', message: msg });
          }}
        />
      )}
    </>
  );
}

export default function ComponentDeploymentTracks(scope: ComponentScope): JSX.Element {
  const { projectId } = useProjectId(scope.project);
  const { data: comp, isLoading } = useComponentByHandler(projectId, scope.component);

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
        <TracksBody scope={scope} projectId={projectId} componentId={comp.id} tracks={comp.deploymentTracks ?? []} deploymentTracksEnabled={!!comp.deploymentTracksEnabled} versionedApis={hasVersionedApis(comp)} />
      )}
    </PageContent>
  );
}
