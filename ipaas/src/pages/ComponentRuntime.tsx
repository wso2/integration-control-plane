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

import { Box, Chip, CircularProgress, PageContent, Typography } from '@wso2/oxygen-ui';
import { useEffect, useMemo, useState, type JSX } from 'react';
import PodInsightsTable from '../components/Runtime/PodInsightsTable';
import ResourceUsageCards from '../components/Runtime/ResourceUsageCards';
import RuntimeOverview from '../components/Runtime/RuntimeOverview';
import { useAccessControl } from '../contexts/AccessControlContext';
import { useComponentByHandler } from '../hooks/useComponents';
import { useComponentDeployment } from '../hooks/useDeployments';
import { useEnvironments } from '../hooks/useEnvironments';
import { useOrgUuid } from '../hooks/useOrgUuid';
import { useProjectId } from '../hooks/useProjects';
import { Permissions } from '../constants/permissions';
import { useComponentPodMetrics, useComponentPods, useReleaseDetails, useRedeployRelease } from '../hooks/useRuntime';
import { DeploymentStatus } from '../types/deployment';
import { calculateAggregateUsage, usageFromComponentLevelMetrics } from '../utils/podMetrics';
import type { ComponentScope } from '../nav';

export default function ComponentRuntime({ org, project, component }: ComponentScope): JSX.Element {
  const orgUuid = useOrgUuid();
  const { projectId, isLoading: loadingProject } = useProjectId(project);
  const { data: comp, isLoading: loadingComponent } = useComponentByHandler(projectId, component);

  const tracks = useMemo(() => comp?.deploymentTracks ?? [], [comp?.deploymentTracks]);
  const [trackId, setTrackId] = useState('');
  useEffect(() => {
    if (tracks.length) setTrackId((prev) => (prev && tracks.some((t) => t.id === prev) ? prev : (tracks.find((t) => t.latest)?.id ?? tracks[0].id)));
  }, [tracks]);

  const { data: environments = [], isLoading: loadingEnvironments, isError: environmentsError } = useEnvironments(orgUuid ?? '', projectId);
  const [envId, setEnvId] = useState('');
  useEffect(() => {
    if (environments.length) setEnvId((prev) => (prev && environments.some((e) => e.id === prev) ? prev : environments[0].id));
  }, [environments]);

  const componentId = comp?.id ?? '';
  const { data: deployment } = useComponentDeployment(org, orgUuid ?? '', componentId, trackId, envId, { refetchInterval: 15_000 });
  const releaseId = deployment?.releaseId ?? '';
  const status = deployment?.deploymentStatusV2 ?? DeploymentStatus.NotDeployed;

  const { data: release } = useReleaseDetails(projectId, component, releaseId);
  const namespace = release?.environment?.namespace ?? '';
  const isDeployed = status !== DeploymentStatus.NotDeployed && !!releaseId && release?.undeployed !== true;

  const pods = useComponentPods(projectId, component, releaseId);
  const metrics = useComponentPodMetrics(projectId, component, releaseId);

  // release.replicas is a one-shot fetch (invalidated once right when Redeploy is clicked,
  // before the rollout settles) and then never refreshed, so it goes stale — e.g. it can get
  // stuck at 2 after a redeploy's old pod terminates. The live, polled pod count self-corrects.
  const replicaCount = pods.data?.length ?? release?.replicas ?? 0;
  // There is no pod-level metrics source; the BFF sends a pre-aggregated total.
  const usage = useMemo(() => (metrics.data?.componentLevelMetrics ? usageFromComponentLevelMetrics(metrics.data.componentLevelMetrics) : calculateAggregateUsage(pods.data ?? [], metrics.data?.podLevelMetrics ?? [])), [pods.data, metrics.data]);
  // componentLevelMetrics is sent only when it can be resolved (Observer reachable) —
  // when it's absent but pods are actually running, "0 used" would misreport unknown as zero.
  const usageUnavailable = !metrics.data?.componentLevelMetrics && (pods.data?.length ?? 0) > 0;

  const podScope = useMemo(() => ({ projectId, releaseId, orgHandler: org, projectHandler: project, componentHandler: component }), [projectId, releaseId, org, project, component]);

  const { hasPermission } = useAccessControl();
  const canManage = hasPermission(Permissions.INTEGRATION_MANAGE, projectId, componentId);

  const redeploy = useRedeployRelease();
  const onRedeploy = () => redeploy.mutate({ projectId, componentName: component, releaseId });

  const isLoading = loadingProject || loadingComponent || loadingEnvironments;

  if (isLoading) {
    return (
      <PageContent>
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 'calc(100vh - 120px)' }}>
          <CircularProgress />
        </Box>
      </PageContent>
    );
  }

  if (!comp) {
    return (
      <PageContent>
        <Typography color="error">Integration not found.</Typography>
      </PageContent>
    );
  }

  if (environmentsError) {
    return (
      <PageContent>
        <Typography color="error">Failed to load environments. Please try again.</Typography>
      </PageContent>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <PageContent>
        <Typography variant="h1" sx={{ mb: 3 }}>
          Runtime
        </Typography>
        <RuntimeOverview
          componentName={comp.displayName || comp.name || component}
          status={status}
          lastDeployedAt={release?.latest_deployment?.deployment_history?.CreatedAt ?? deployment?.build?.deployedAt}
          // The runtime response carries the OpenChoreo ids; until it arrives, show nothing
          // rather than a handler-shaped value that then flips to the real id.
          componentId={release?.componentId ?? ''}
          releaseId={release?.ID ?? ''}
          namespace={namespace}
          imageUrl={release?.image}
          isDeployed={isDeployed}
          redeploying={redeploy.isPending}
          canRedeploy={!!releaseId}
          onRedeploy={onRedeploy}
        />

        {isDeployed && (
          <>
            <PodInsightsTable
              pods={pods.data}
              isLoading={pods.isLoading}
              isError={pods.isError}
              isFetching={pods.isFetching || metrics.isFetching}
              onRefresh={() => {
                pods.refetch();
                metrics.refetch();
              }}
              scope={podScope}
              canManage={canManage}
              replicasControl={<Chip variant="outlined" label={`Replicas ${replicaCount}`} />}
            />
            <Box sx={{ mt: 4 }}>
              <ResourceUsageCards usage={usage} usageUnavailable={usageUnavailable} />
            </Box>
          </>
        )}
      </PageContent>
    </Box>
  );
}
