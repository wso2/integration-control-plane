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

import { Box, Typography } from '@wso2/oxygen-ui';
import { useMemo, type JSX } from 'react';
import PodInsightsTable from '../Runtime/PodInsightsTable';
import ResourceUsageCards from '../Runtime/ResourceUsageCards';
import { useComponentPodMetrics, useComponentPods, useReleaseDetails } from '../../hooks/useRuntime';
import { useAutoscaling } from '../../hooks/useScaling';
import { calculateAggregateUsage, usageFromComponentLevelMetrics } from '../../utils/podMetrics';

const titleSx = { fontWeight: 600 } as const;
const usageSx = { mt: 4 } as const;

// The HPA can change the pod count between the pod list's usual polls, so while it is on the
// list follows the autoscaling status's pace.
const AUTOSCALING_PODS_POLL_MS = 10_000;

interface CloudReplicasProps {
  projectId: string;
  componentId: string;
  /** Cloud addresses a component's pods by its handler (== name). */
  componentHandler: string;
  releaseId: string;
  environmentId: string;
  orgHandler: string;
  projectHandler: string;
  canManage: boolean;
}

/**
 * The replicas behind the scaling settings, pod by pod, with the release's total usage. Built from
 * the Runtime page's own table and cards, which already account for cloud having no per-pod
 * metrics: usage is only known summed across the release's pods.
 */
export default function CloudReplicas({ projectId, componentId, componentHandler, releaseId, environmentId, orgHandler, projectHandler, canManage }: CloudReplicasProps): JSX.Element | null {
  // Same queries as the Runtime page, so both pages share one cache entry per release.
  const { data: release } = useReleaseDetails(projectId, componentId, componentHandler, releaseId);
  const clusterId = release?.environment?.environment_clusters?.[0]?.cluster_id ?? '';
  const namespace = release?.environment?.namespace ?? '';
  const { data: autoscaling } = useAutoscaling(projectId, componentId, environmentId);

  const pods = useComponentPods(projectId, componentHandler, clusterId, releaseId, namespace, autoscaling?.enabled ? AUTOSCALING_PODS_POLL_MS : undefined);
  const metrics = useComponentPodMetrics(projectId, componentHandler, clusterId, releaseId, namespace);

  const componentLevel = metrics.data?.componentLevelMetrics;
  const usage = useMemo(() => (componentLevel ? usageFromComponentLevelMetrics(componentLevel) : calculateAggregateUsage(pods.data ?? [], [])), [componentLevel, pods.data]);
  // Without the aggregate there is no usage source at all; "0 used" would misreport unknown as zero.
  const usageUnavailable = !componentLevel && (pods.data?.length ?? 0) > 0;

  // While autoscaling is on, the cards show the HPA's own utilization against its targets: the
  // figure scaling acts on, read live from the cluster rather than from the metrics backend.
  const readings = useMemo(() => {
    const status = autoscaling?.enabled ? autoscaling.status : undefined;
    if (!status) return undefined;
    return {
      cpu: status.currentCpuUtilizationPercentage === undefined ? undefined : { percent: status.currentCpuUtilizationPercentage, target: autoscaling?.cpuUtilizationPercentage },
      memory: status.currentMemoryUtilizationPercentage === undefined ? undefined : { percent: status.currentMemoryUtilizationPercentage, target: autoscaling?.memoryUtilizationPercentage },
    };
  }, [autoscaling]);

  const scope = useMemo(() => ({ projectId, clusterId, namespace, releaseId, orgHandler, projectHandler, componentHandler }), [projectId, clusterId, namespace, releaseId, orgHandler, projectHandler, componentHandler]);

  if (release?.undeployed) return null;

  return (
    <>
      <PodInsightsTable
        pods={pods.data}
        metrics={undefined}
        isLoading={pods.isLoading}
        isError={pods.isError}
        isFetching={pods.isFetching || metrics.isFetching}
        onRefresh={() => {
          void pods.refetch();
          void metrics.refetch();
        }}
        scope={scope}
        canManage={canManage}
        replicasControl={
          <Typography variant="subtitle1" sx={titleSx}>
            Replicas
          </Typography>
        }
      />
      <Box sx={usageSx}>
        <ResourceUsageCards usage={usage} usageUnavailable={usageUnavailable} showPercent readings={readings} />
      </Box>
    </>
  );
}
