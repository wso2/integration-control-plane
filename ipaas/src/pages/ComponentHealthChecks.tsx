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

import { Alert, Box, PageContent, PageTitle, Skeleton, Stack } from '@wso2/oxygen-ui';
import { Activity } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useMemo, useState, type JSX } from 'react';
import DeploymentTrackBar from '../components/DeploymentTrackBar';
import EmptyListing from '../components/EmptyListing';
import HealthCheckCard from '../components/HealthChecks/HealthCheckCard';
import CreateHealthCheckStepper from '../components/HealthChecks/CreateHealthCheckStepper';
import EnvironmentSelect from '../components/common/EnvironmentSelect';
import { useAccessControl } from '../contexts/AccessControlContext';
import { Permissions } from '../constants/permissions';
import { useHealthChecks } from '../hooks/useHealthChecks';
import { useRelease } from '../hooks/useDevopsConfigs';
import { useComponentByHandler } from '../hooks/useComponents';
import { useComponentDeployment } from '../hooks/useDeployments';
import { useEnvironments } from '../hooks/useEnvironments';
import { useOrgUuid } from '../hooks/useOrgUuid';
import { useProjectId } from '../hooks/useProjects';
import { mainContainer } from '../utils/devopsConfigs';
import type { ComponentScope } from '../nav';

export default function ComponentHealthChecks({ org, project, component }: ComponentScope): JSX.Element {
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

  const { data: environments = [], isLoading: loadingEnvs } = useEnvironments(org, projectId);
  const [envId, setEnvId] = useState('');
  useEffect(() => {
    if (environments.length) setEnvId((prev) => (prev && environments.some((e) => e.id === prev) ? prev : environments[0].id));
  }, [environments]);

  const { data: deployment, isLoading: loadingDeployment } = useComponentDeployment(org, orgUuid ?? '', comp?.id ?? '', trackId, envId);
  const releaseId = deployment?.releaseId ?? '';
  const { data: release, isLoading: loadingRelease } = useRelease(projectId, comp?.id, releaseId);
  const containers = useMemo(() => release?.containers ?? [], [release]);
  const mainC = useMemo(() => mainContainer(containers), [containers]);

  const { data: healthChecks = [], isLoading: loadingHc } = useHealthChecks(projectId, comp?.id, releaseId, envId);

  const syncError = healthChecks.find((hc) => hc.sync_status)?.sync_message;

  // trackId/envId are picked in an effect, so their queries are briefly disabled rather than loading.
  const resolving = isLoading || loadingEnvs || (tracks.length > 0 && !trackId) || (environments.length > 0 && !envId) || loadingDeployment || loadingRelease || loadingHc;

  const [creating, setCreating] = useState(false);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  useEffect(() => {
    setAlert(null);
    setCreating(false);
  }, [trackId, envId]);

  const envSelect = environments.length > 1 ? <EnvironmentSelect environments={environments} value={envId} onChange={setEnvId} deployment={{ orgHandler: org, orgUuid: orgUuid ?? '', componentId: comp?.id ?? '', versionId: trackId }} /> : null;

  const notify = (type: 'success' | 'error', message: string): void => setAlert({ type, message });

  return (
    <Box>
      {tracks.length > 0 && <DeploymentTrackBar extra={envSelect} />}
      <PageContent>
        <PageTitle>
          <PageTitle.Header>Health Checks</PageTitle.Header>
        </PageTitle>

        {alert && (
          <Alert severity={alert.type} sx={{ mb: 2 }} onClose={() => setAlert(null)}>
            {alert.message}
          </Alert>
        )}

        {/* The platform validates probe values when it renders the release, so a saved change can still be rejected. */}
        {syncError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {syncError}
          </Alert>
        )}

        {resolving ? (
          <Stack gap={2}>
            <Skeleton variant="rounded" height={180} />
            <Skeleton variant="rounded" height={180} />
          </Stack>
        ) : !comp ? (
          <Alert severity="error">Integration not found</Alert>
        ) : !mainC ? (
          <Alert severity="info">This integration has no containers in the selected environment yet. Deploy it to configure health checks.</Alert>
        ) : creating ? (
          <CreateHealthCheckStepper
            container={mainC}
            projectId={projectId}
            componentId={comp.id}
            releaseId={releaseId}
            environmentId={envId}
            onClose={() => setCreating(false)}
            onSaved={(m) => {
              setCreating(false);
              notify('success', m);
            }}
            onError={(m) => notify('error', m)}
          />
        ) : healthChecks.length === 0 ? (
          <EmptyListing
            icon={<Activity size={48} />}
            title="No Health Checks have been configured in this Environment."
            description="Configuring health checks will allow unhealthy replicas to self-heal and also ensures increased availability for your services."
            showAction={canManage}
            actionLabel="Create"
            onAction={() => setCreating(true)}
          />
        ) : (
          healthChecks.map((hc) => {
            const container = containers.find((c) => c.ID === hc.container_id);
            if (!container) return null;
            return <HealthCheckCard key={hc.ID} healthCheck={hc} container={container} projectId={projectId} componentId={comp.id} releaseId={releaseId} environmentId={envId} canManage={canManage} onNotify={notify} />;
          })
        )}
      </PageContent>
    </Box>
  );
}
