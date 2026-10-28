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
import { useAccessControl } from '../contexts/AccessControlContext';
import DeploymentTrackBar from '../components/DeploymentTrackBar';
import EnvironmentSelect from '../components/common/EnvironmentSelect';
import CloudAutoscaling from '../components/Scaling/CloudAutoscaling';
import CloudReplicas from '../components/Scaling/CloudReplicas';
import { Permissions } from '../constants/permissions';
import { GENERIC_SERVICE_TYPES } from '../constants/integrations';
import { useComponentByHandler } from '../hooks/useComponents';
import { useComponentDeployment } from '../hooks/useDeployments';
import { useRelease } from '../hooks/useDevopsConfigs';
import { useEnvironments } from '../hooks/useEnvironments';
import { useOrgUuid } from '../hooks/useOrgUuid';
import { useProjectId } from '../hooks/useProjects';
import { mainContainer } from '../utils/devopsConfigs';
import type { ComponentScope } from '../nav';

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
  const selectedEnv = environments.find((e) => e.id === envId);

  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => setAlert(null), [trackId, envId]);

  const envSelect = environments.length > 1 ? <EnvironmentSelect environments={environments} value={envId} onChange={setEnvId} deployment={{ orgHandler: org, orgUuid: orgUuid ?? '', componentId: comp?.id ?? '', versionId: trackId }} /> : null;

  const onSaved = (message: string) => setAlert({ type: 'success', message });
  const onError = (message: string) => setAlert({ type: 'error', message });

  return (
    <Box>
      {tracks.length > 0 && <DeploymentTrackBar extra={envSelect} />}
      <PageContent>
        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 'calc(100vh - 120px)' }}>
            <CircularProgress />
          </Box>
        ) : !comp ? (
          <Alert severity="error">Integration not found</Alert>
        ) : (
          <>
            <PageTitle>
              <PageTitle.Header>Scaling</PageTitle.Header>
            </PageTitle>
            {!GENERIC_SERVICE_TYPES.has(comp.displayType) ? (
              <Alert severity="info" sx={{ mt: 1 }}>
                Scaling isn&apos;t available for this integration type.
              </Alert>
            ) : !releaseId || !containerId ? (
              <Alert severity="info" sx={{ mt: 1 }}>
                Deploy this integration to the selected environment to configure scaling.
              </Alert>
            ) : !selectedEnv ? (
              <Alert severity="info">Select an environment to configure scaling.</Alert>
            ) : (
              <>
                {alert && (
                  <Alert severity={alert.type} onClose={() => setAlert(null)} sx={{ mb: 2 }}>
                    {alert.message}
                  </Alert>
                )}
                {/* Keyed by environment so an unsaved HPA choice never carries over to another one. */}
                <CloudAutoscaling key={selectedEnv.id} projectId={projectId} componentId={comp.id} environmentId={selectedEnv.id} environmentName={selectedEnv.name} canManage={canManage} onSaved={onSaved} onError={onError} />
                <CloudReplicas key={`replicas-${selectedEnv.id}`} projectId={projectId} componentId={comp.id} componentHandler={component} releaseId={releaseId} environmentId={selectedEnv.id} orgHandler={org} projectHandler={project} canManage={canManage} />
              </>
            )}
          </>
        )}
      </PageContent>
    </Box>
  );
}
