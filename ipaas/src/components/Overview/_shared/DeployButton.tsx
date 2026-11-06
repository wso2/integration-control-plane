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

import { Button, CircularProgress, Tooltip } from '@wso2/oxygen-ui';
import { Rocket } from '@wso2/oxygen-ui-icons-react';
import type { ReactNode } from 'react';
import { useDeployDeploymentTrack, useDeploymentStatus, useDeploymentTrackImages } from '../../../hooks/useDeployments';
import type { DeployActionProps } from '../../../types/integration';
import { Scopes } from '../../../constants/permissions';
import { useCan } from '../../../hooks/useCan';

/**
 * Deploys the track's newest build to the first environment. With auto deploy
 * off a finished build stops short of the environment, so the card waiting for
 * it offers the next step. Once the newest build is running there, there is no
 * step to offer and the button goes away.
 */
export default function DeployButton({ component, env, versionId, deploymentPipelineId, buildId, blockedReason, blockedLabel, onNotify, requestPoll }: DeployActionProps): ReactNode {
  const { data: images = [], isLoading: imagesLoading } = useDeploymentTrackImages(component.id, versionId);
  const { data: builds = [] } = useDeploymentStatus(component.id, versionId);
  const deploy = useDeployDeploymentTrack();
  const canDeployRole = useCan()(Scopes.INTEGRATION_DEPLOY);

  const latest = images[0];
  // A queued build blocks too: the image it will produce does not exist yet.
  const isBuildPending = builds.some((b) => b.status === 'in_progress' || b.status === 'queued');
  if (!canDeployRole || imagesLoading || (latest && latest.imageId === buildId)) return null;

  const canDeploy = !!latest && !isBuildPending && !blockedReason;
  const handleDeploy = () => {
    if (!canDeploy) return;
    deploy.mutate(
      { componentId: component.id, id: versionId, imageId: latest.imageId, environmentId: env.id, deploymentPipelineId },
      {
        onSuccess: () => {
          requestPoll();
          onNotify({ text: 'Deployment started successfully', severity: 'success' });
        },
        onError: (err) => onNotify({ text: err instanceof Error ? err.message : 'Failed to deploy', severity: 'error' }),
      },
    );
  };

  const tooltipTitle = blockedReason ?? (isBuildPending ? 'A build is in progress' : !latest ? 'No build available to deploy' : 'Deploy the latest build');
  const showBlockedLabel = !!blockedReason && !!blockedLabel;

  return (
    <Tooltip title={tooltipTitle}>
      <span>
        <Button variant="contained" size="small" startIcon={deploy.isPending || showBlockedLabel ? <CircularProgress color="inherit" size={14} /> : <Rocket size={14} />} disabled={!canDeploy || deploy.isPending} onClick={handleDeploy}>
          {deploy.isPending ? 'Deploying…' : showBlockedLabel ? blockedLabel : 'Deploy'}
        </Button>
      </span>
    </Tooltip>
  );
}
