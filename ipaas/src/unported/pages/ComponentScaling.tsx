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

import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, MenuItem, PageContent, PageTitle, Select, Stack, Typography } from '@wso2/oxygen-ui';
import { useEffect, useMemo, useState, type JSX } from 'react';
import { useAccessControl } from '../../contexts/AccessControlContext';
import DeploymentTrackBar from '../../components/DeploymentTrackBar';
import ScaleMethodCard from '../components/Scaling/ScaleMethodCard';
import ScaleToZeroConfig from '../components/Scaling/ScaleToZeroConfig';
import HpaConfig from '../components/Scaling/HpaConfig';
import ReplicasTable from '../components/Scaling/ReplicasTable';
import ComingSoon from '../../pages/ComingSoon';
import { Permissions } from '../../constants/permissions';
import { GENERIC_SERVICE_TYPES } from '../../constants/integrations';
import { CLOUD_DP_MAX_REPLICAS, HPA_CARD, SCALE_TO_ZERO_CARD } from '../../constants/scaling';
import { isScalingEnabled, useHpa, useHttpScaler, useScalingState, useSetScalingMethod } from '../../hooks/useScaling';
import { useComponentByHandler } from '../../hooks/useComponents';
import { useComponentDeployment } from '../../hooks/useDeployments';
import { useRelease } from '../../hooks/useDevopsConfigs';
import { useEnvironments } from '../../hooks/useEnvironments';
import { useOrgUuid } from '../../hooks/useOrgUuid';
import { useProjectId } from '../../hooks/useProjects';
import { mainContainer } from '../../utils/devopsConfigs';
import { ScalingMethod, type ScalingPath } from '../../types/scaling';
import type { ComponentScope } from '../../nav';
import { IS_CLOUD } from '../../features';

export default function ComponentScaling({ org, project, component }: ComponentScope): JSX.Element {
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
  const containerId = useMemo(() => mainContainer(release?.containers)?.ID ?? '', [release]);
  const clusterId = environments.find((e) => e.id === envId)?.dpId ?? '';

  const { data: state, isLoading: loadingState } = useScalingState(projectId, comp?.id ?? '', releaseId);
  const { data: httpScaler = null } = useHttpScaler(projectId, comp?.id ?? '', releaseId);
  const { data: hpa = null } = useHpa(projectId, comp?.id ?? '', releaseId);
  const setMethod = useSetScalingMethod(projectId);

  const [pendingMethod, setPendingMethod] = useState<ScalingMethod | null>(null);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => setAlert(null), [trackId, envId]);

  if (!isScalingEnabled()) {
    return <ComingSoon title="Coming Soon" description="Scaling configuration is currently under development." />;
  }

  const path: ScalingPath = { componentId: comp?.id ?? '', releaseId };
  const currentMethod = state?.method === ScalingMethod.HPA ? ScalingMethod.HPA : ScalingMethod.ScaleToZero;

  const onSelectMethod = (method: ScalingMethod) => {
    if (method === currentMethod || !canManage) return;
    setPendingMethod(method);
  };

  const confirmSwitch = () => {
    if (!pendingMethod) return;
    setMethod.mutate(
      { path, data: { scale_to_zero_enabled: pendingMethod === ScalingMethod.ScaleToZero } },
      {
        onSuccess: () => {
          setPendingMethod(null);
          setAlert({ type: 'success', message: 'Scaling method updated.' });
        },
        onError: (e) => {
          setPendingMethod(null);
          // The backend rejects re-setting the current method; if a prior (e.g. timed-out) request
          // already applied it, that's the desired state — treat it as success (state resyncs).
          const message = e instanceof Error ? e.message : '';
          if (/already set/i.test(message)) setAlert({ type: 'success', message: 'Scaling method updated.' });
          else setAlert({ type: 'error', message: message || 'Failed to update the scaling method.' });
        },
      },
    );
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

  const onSaved = (message: string) => setAlert({ type: 'success', message });
  const onError = (message: string) => setAlert({ type: 'error', message });

  return (
    <Box>
      {tracks.length > 0 && <DeploymentTrackBar tracks={tracks} selectedId={trackId} onChange={setTrackId} orgHandler={org} projectHandler={project} componentHandler={component} versionView extra={envSelect} />}
      <PageContent>
        {isLoading || (loadingState && releaseId) ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 'calc(100vh - 120px)' }}>
            <CircularProgress />
          </Box>
        ) : !comp ? (
          <Alert severity="error">Integration not found</Alert>
        ) : !GENERIC_SERVICE_TYPES.has(comp.displayType) ? (
          <>
            <PageTitle>
              <PageTitle.Header>Scaling</PageTitle.Header>
            </PageTitle>
            <Alert severity="info" sx={{ mt: 1 }}>
              Scaling isn&apos;t available for this integration type.
            </Alert>
          </>
        ) : !releaseId || !containerId ? (
          <>
            <PageTitle>
              <PageTitle.Header>Scaling</PageTitle.Header>
            </PageTitle>
            <Alert severity="info" sx={{ mt: 1 }}>
              Deploy this integration to the selected environment to configure scaling.
            </Alert>
          </>
        ) : (
          <>
            <PageTitle>
              <PageTitle.Header>Scaling</PageTitle.Header>
            </PageTitle>

            {alert && (
              <Alert severity={alert.type} onClose={() => setAlert(null)} sx={{ mb: 2 }}>
                {alert.message}
              </Alert>
            )}

            <Stack direction={{ xs: 'column', md: 'row' }} gap={2} sx={{ mb: 3 }}>
              <ScaleMethodCard title={SCALE_TO_ZERO_CARD.title} description={SCALE_TO_ZERO_CARD.description} selected={currentMethod === ScalingMethod.ScaleToZero} disabled={!canManage} onSelect={() => onSelectMethod(ScalingMethod.ScaleToZero)} />
              <ScaleMethodCard title={HPA_CARD.title} description={HPA_CARD.description} selected={currentMethod === ScalingMethod.HPA} disabled={!canManage} onSelect={() => onSelectMethod(ScalingMethod.HPA)} />
            </Stack>

            {currentMethod === ScalingMethod.ScaleToZero && (
              <Alert severity="info" sx={{ mb: 3 }}>
                Please refer to the documentation to troubleshoot your scaled-to-zero integration.
              </Alert>
            )}

            <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1.5 }}>
              Scaling Configuration
            </Typography>
            <Box sx={{ mb: 4 }}>
              {currentMethod === ScalingMethod.ScaleToZero ? (
                <ScaleToZeroConfig projectId={projectId} path={path} scaler={httpScaler} maxReplicaCap={CLOUD_DP_MAX_REPLICAS} canManage={canManage} onSaved={onSaved} onError={onError} />
              ) : (
                <HpaConfig orgUuid={orgUuid ?? ''} projectId={projectId} path={path} version={state?.version ?? ''} maxReplicaCap={CLOUD_DP_MAX_REPLICAS} hpa={hpa} canManage={canManage} onSaved={onSaved} onError={onError} />
              )}
            </Box>

            {clusterId && <ReplicasTable projectId={projectId} clusterId={clusterId} releaseId={releaseId} dataPlaneLabel="Choreo Cloud Data Plane" />}
          </>
        )}
      </PageContent>

      <Dialog open={!!pendingMethod} onClose={() => setPendingMethod(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Change scaling method?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Switching to <strong>{pendingMethod === ScalingMethod.HPA ? 'HPA' : 'Scale to Zero'}</strong> changes how this integration scales. Continue?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPendingMethod(null)} disabled={setMethod.isPending}>
            Cancel
          </Button>
          <Button variant="contained" onClick={confirmSwitch} disabled={setMethod.isPending} startIcon={setMethod.isPending ? <CircularProgress size={16} color="inherit" /> : undefined}>
            Confirm
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
