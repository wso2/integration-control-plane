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

import { Alert, Box, Button, CircularProgress, MenuItem, PageContent, PageTitle, Select } from '@wso2/oxygen-ui';
import { HardDrive, Plus } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useMemo, useState, type JSX } from 'react';
import Authorized from '../../components/Authorized';
import { useAccessControl } from '../../contexts/AccessControlContext';
import EmptyListing from '../../components/EmptyListing';
import DeploymentTrackBar from '../../components/DeploymentTrackBar';
import VolumeList from '../components/Storage/VolumeList';
import VolumeWizard, { type VolumeWizardCtx } from '../components/Storage/VolumeWizard';
import DeleteVolumeDialog from '../components/Storage/DeleteVolumeDialog';
import ComingSoon from '../../pages/ComingSoon';
import { Permissions } from '../../constants/permissions';
import { isStorageEnabled, useVolumeMounts, useVolumes } from '../hooks/useStorage';
import { useComponentByHandler } from '../../hooks/useComponents';
import { useComponentDeployment } from '../../hooks/useDeployments';
import { useRelease } from '../../hooks/useDevopsConfigs';
import { useEnvironments } from '../../hooks/useEnvironments';
import { useOrgUuid } from '../../hooks/useOrgUuid';
import { useProjectId } from '../../hooks/useProjects';
import { mainContainer } from '../../utils/devopsConfigs';
import { combineVolumesAndMounts } from '../utils/storage';
import type { Volume, VolumeRow } from '../../types/storage';
import type { ComponentScope } from '../../nav';
import { IS_CLOUD } from '../../features';

type View = { kind: 'list' } | { kind: 'create' } | { kind: 'edit'; row: VolumeRow };

export default function ComponentStorage({ org, project, component }: ComponentScope): JSX.Element {
  const orgUuid = useOrgUuid();
  const { projectId } = useProjectId(project);
  const { hasPermission } = useAccessControl();
  const { data: comp, isLoading } = useComponentByHandler(projectId, component);
  const canManage = hasPermission(Permissions.INTEGRATION_MANAGE, projectId, comp?.id);

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
  const container = useMemo(() => mainContainer(release?.containers), [release]);
  const containerId = container?.ID ?? '';
  const containerName = (id: string) => release?.containers?.find((c) => c.ID === id)?.name ?? id;

  const { data: volumes = [], isLoading: loadingVolumes } = useVolumes(projectId, envId);
  const { data: mounts = [], isLoading: loadingMounts } = useVolumeMounts(projectId, comp?.id ?? '', releaseId);
  const rows = useMemo(() => combineVolumesAndMounts(volumes, mounts, releaseId), [volumes, mounts, releaseId]);

  const [view, setView] = useState<View>({ kind: 'list' });
  const [deleting, setDeleting] = useState<Volume | null>(null);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => setView({ kind: 'list' }), [trackId, envId]);

  if (!isStorageEnabled()) {
    return <ComingSoon title="Coming Soon" description="Storage management is currently under development." />;
  }

  // Persistent / disk volumes require a private data plane. icp exposes no private-DP signal yet
  // (needs the /clusters/dataplanes endpoint), so those volume types stay disabled on shared planes.
  const isPDP = false;
  const ctx: VolumeWizardCtx = { orgUuid: orgUuid ?? '', projectId, componentId: comp?.id ?? '', releaseId, environmentId: envId, containerId, containerName: container?.name ?? '', isPDP };

  const onSaved = (message: string) => {
    setView({ kind: 'list' });
    setAlert({ type: 'success', message });
  };

  const envSelect = !IS_CLOUD && environments.length > 1 && (
    <Select
      size="small"
      value={environments.some((e) => e.id === envId) ? envId : ''}
      onChange={(e) => setEnvId(e.target.value as string)}
      inputProps={{ 'aria-label': 'Environment' }}
      sx={{ fontSize: '0.8125rem', '& .MuiSelect-select': { py: 0.5, px: 1.5 }, minWidth: 140 }}>
      {environments.map((e) => (
        <MenuItem key={e.id} value={e.id}>
          {e.name}
        </MenuItem>
      ))}
    </Select>
  );

  return (
    <>
      {tracks.length > 0 && <DeploymentTrackBar tracks={tracks} selectedId={trackId} onChange={setTrackId} orgHandler={org} projectHandler={project} componentHandler={component} extra={envSelect} />}
      <PageContent>
        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 'calc(100vh - 120px)' }}>
            <CircularProgress />
          </Box>
        ) : !comp ? (
          <Alert severity="error">Integration not found</Alert>
        ) : !releaseId || !containerId ? (
          <>
            <PageTitle>
              <PageTitle.Header>Storage</PageTitle.Header>
            </PageTitle>
            <Alert severity="info" sx={{ mt: 1 }}>
              Deploy this integration to the selected environment to manage its storage.
            </Alert>
          </>
        ) : view.kind === 'create' ? (
          <VolumeWizard ctx={ctx} onBack={() => setView({ kind: 'list' })} onSaved={onSaved} onError={(message) => setAlert({ type: 'error', message })} />
        ) : view.kind === 'edit' ? (
          <VolumeWizard ctx={ctx} existing={view.row} onBack={() => setView({ kind: 'list' })} onSaved={onSaved} onError={(message) => setAlert({ type: 'error', message })} />
        ) : (
          <>
            <PageTitle>
              <PageTitle.Header>Storage</PageTitle.Header>
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

            {loadingVolumes || loadingMounts ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                <CircularProgress />
              </Box>
            ) : rows.length === 0 ? (
              <EmptyListing icon={<HardDrive size={48} />} title="No volume mounts" description="Attach in-memory, disk or persistent volumes to this integration's container." />
            ) : (
              <VolumeList rows={rows} canManage={canManage} containerName={containerName} onEdit={(row) => setView({ kind: 'edit', row })} onDelete={(row) => setDeleting(row.volume)} />
            )}
          </>
        )}
      </PageContent>

      {deleting && (
        <DeleteVolumeDialog projectId={projectId} volume={deleting} onClose={() => setDeleting(null)} onDeleted={(name) => setAlert({ type: 'success', message: `Volume mount '${name}' deleted.` })} onError={(message) => setAlert({ type: 'error', message })} />
      )}
    </>
  );
}
