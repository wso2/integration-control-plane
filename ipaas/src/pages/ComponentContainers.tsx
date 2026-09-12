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

import { Alert, Box, CircularProgress, PageContent, PageTitle } from '@wso2/oxygen-ui';
import { useEffect, useMemo, useState, type JSX } from 'react';
import DeploymentTrackBar from '../components/DeploymentTrackBar';
import EnvironmentSelect from '../components/common/EnvironmentSelect';
import ContainerInfoCard from '../components/Containers/ContainerInfoCard';
import ComingSoon from './ComingSoon';
import { useAccessControl } from '../contexts/AccessControlContext';
import { Permissions } from '../constants/permissions';
import { PAID_SUBSCRIPTION_TYPE } from '../constants/subscription';
import { isContainersEnabled, useRelease } from '../hooks/useDevopsConfigs';
import { useComponentByHandler } from '../hooks/useComponents';
import { useComponentDeployment } from '../hooks/useDeployments';
import { useEnvironments } from '../hooks/useEnvironments';
import { useOrgUuid } from '../hooks/useOrgUuid';
import { useProjectId } from '../hooks/useProjects';
import { useSubscriptions } from '../hooks/useSubscription';
import { isPrivateDpRelease } from '../utils/containers';
import type { ComponentScope } from '../nav';

export default function ComponentContainers({ org, project, component }: ComponentScope): JSX.Element {
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
  const { data: release, isLoading: loadingRelease } = useRelease(projectId, comp?.id, releaseId);

  const { data: subscriptions } = useSubscriptions(orgUuid ?? '');
  const isSubscribed = (subscriptions?.list ?? []).some((s) => s.subscriptionType === PAID_SUBSCRIPTION_TYPE);
  const isPaidOrPdpUser = isPrivateDpRelease(release) || isSubscribed;

  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  useEffect(() => setAlert(null), [trackId, envId]);

  if (!isContainersEnabled()) {
    return <ComingSoon title="Coming Soon" description="Containers management is currently under development." />;
  }

  const containers = release?.containers ?? [];

  const envSelect = environments.length > 1 ? <EnvironmentSelect environments={environments} value={envId} onChange={setEnvId} /> : null;

  return (
    <Box>
      {tracks.length > 0 && <DeploymentTrackBar tracks={tracks} selectedId={trackId} onChange={setTrackId} orgHandler={org} projectHandler={project} componentHandler={component} versionView extra={envSelect} />}
      <PageContent>
        <PageTitle>
          <PageTitle.Header>Containers</PageTitle.Header>
        </PageTitle>

        {alert && (
          <Alert severity={alert.type} sx={{ mb: 2 }} onClose={() => setAlert(null)}>
            {alert.message}
          </Alert>
        )}

        {isLoading || (loadingRelease && !!releaseId) ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 'calc(100vh - 120px)' }}>
            <CircularProgress />
          </Box>
        ) : !comp ? (
          <Alert severity="error">Integration not found</Alert>
        ) : containers.length === 0 ? (
          <Alert severity="info">This integration has no containers in the selected environment yet. Deploy it to configure its containers.</Alert>
        ) : (
          containers.map((c) => (
            <ContainerInfoCard
              key={c.ID}
              container={c}
              projectId={projectId}
              componentId={comp.id}
              releaseId={releaseId}
              isPaidOrPdpUser={isPaidOrPdpUser}
              canManage={canManage}
              onSaved={(message) => setAlert({ type: 'success', message })}
              onError={(message) => setAlert({ type: 'error', message })}
            />
          ))
        )}
      </PageContent>
    </Box>
  );
}
