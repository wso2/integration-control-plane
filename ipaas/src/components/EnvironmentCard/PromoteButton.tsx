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

import { Button, Tooltip } from '@wso2/oxygen-ui';
import { ArrowDown } from '@wso2/oxygen-ui-icons-react';
import type { ReactNode } from 'react';
import { useComponentDeployment } from '../../hooks/useDeployments';
import { usePromote } from '../../hooks/useDeployments';
import { useOrgUuid } from '../../hooks/useOrgUuid';
import { useOrgDeploymentPipelines } from '../../hooks/useDeploymentPipelines';
import { isEnvInPipeline, promotionTargetsFor } from '../../utils/deploymentPipeline';
import { IS_CLOUD } from '../../features';
import Authorized from '../Authorized';
import { Permissions } from '../../constants/permissions';

interface PromoteButtonProps {
  orgHandler: string;
  componentId: string;
  versionId: string;
  deploymentPipelineId: string;
  sourceEnvId: string;
  /** The next environment card, if any. In cloud this is only a fallback for the
   *  non-pipeline path and the anchor for the "not in the pipeline" hint — the
   *  actual promotion target comes from the pipeline. */
  targetEnvId?: string;
  icon?: ReactNode;
  /** Receives the environment actually being promoted into, which in cloud comes
   *  from the pipeline and is not necessarily the adjacent card. */
  onPromoteStarted?: (targetEnvId: string) => void;
  onPromoteSettled?: () => void;
}

export default function PromoteButton({ orgHandler, componentId, versionId, deploymentPipelineId, sourceEnvId, targetEnvId, icon, onPromoteStarted, onPromoteSettled }: PromoteButtonProps) {
  const orgUuid = useOrgUuid() ?? '';
  const { data: pipelines, isLoading: pipelinesLoading } = useOrgDeploymentPipelines();
  const promotionTree = pipelines?.find((p) => p.id === deploymentPipelineId)?.promotion_tree;

  // In cloud the pipeline — not card adjacency — decides where an environment
  // promotes to and whether it promotes at all; the BFF rejects any other hop with
  // a 403. wip keeps the adjacent target: its environment ordering is defined by
  // the devant backend and there is no ordinal in the response to verify against.
  const pipelineKnown = !IS_CLOUD || (!pipelinesLoading && !!deploymentPipelineId);
  const effectiveTargetId = IS_CLOUD ? promotionTargetsFor(promotionTree, sourceEnvId)[0] : targetEnvId;
  const sourceInPipeline = !IS_CLOUD || isEnvInPipeline(promotionTree, sourceEnvId);

  const { data: sourceDeployment, isLoading: sourceLoading } = useComponentDeployment(orgHandler, orgUuid, componentId, versionId, sourceEnvId);
  const { data: targetDeployment, isLoading: targetLoading } = useComponentDeployment(orgHandler, orgUuid, componentId, versionId, effectiveTargetId ?? '');
  const promote = usePromote();

  const deploymentsLoading = sourceLoading || targetLoading || pipelinesLoading;
  const buildId = sourceDeployment?.build?.buildId;
  const sourceReleaseId = sourceDeployment?.releaseId;
  const alreadyPromoted = !deploymentsLoading && !!buildId && buildId === targetDeployment?.build?.buildId;

  const missingPipeline = IS_CLOUD && !deploymentPipelineId;
  // The environment is in the chain but nothing follows it, so there is nothing to
  // promote to — render no affordance at all rather than a permanently dead button.
  const isChainEnd = pipelineKnown && sourceInPipeline && !effectiveTargetId;
  // Not in the chain: promotion is impossible until someone adds it. Only worth
  // saying where a button appears today, i.e. when there is a following card.
  const notInPipeline = pipelineKnown && !missingPipeline && !sourceInPipeline;

  const canPromote = !!buildId && !!sourceReleaseId && !!effectiveTargetId && !missingPipeline && !notInPipeline && !alreadyPromoted;

  const handlePromote = () => {
    if (!canPromote || !sourceReleaseId || !effectiveTargetId) return;
    onPromoteStarted?.(effectiveTargetId);
    promote.mutate(
      {
        componentId,
        apiVersionId: versionId,
        sourceReleaseId,
        // The BFF validates this source→target hop against the pipeline's promotion paths.
        sourceEnvironmentId: sourceEnvId,
        targetEnvironmentId: effectiveTargetId,
        deploymentPipelineId,
      },
      { onSettled: onPromoteSettled },
    );
  };

  if (isChainEnd || (notInPipeline && !targetEnvId)) return null;

  const tooltipTitle = !buildId
    ? 'No build available to promote'
    : alreadyPromoted
      ? 'Already deployed in target environment'
      : missingPipeline
        ? 'No deployment pipeline configured for this project'
        : notInPipeline
          ? `This project's deployment pipeline has no promotion path from ${sourceEnvId}. Add one in CD Pipelines to promote.`
          : '';

  return (
    <Authorized permissions={Permissions.ENVIRONMENT_MANAGE}>
      <Tooltip title={tooltipTitle}>
        <span>
          <Button variant="outlined" size="small" startIcon={icon ?? <ArrowDown size={14} />} disabled={deploymentsLoading || !canPromote || promote.isPending} onClick={handlePromote}>
            {promote.isPending ? 'Promoting…' : IS_CLOUD && effectiveTargetId ? `Promote to ${effectiveTargetId}` : 'Promote'}
          </Button>
        </span>
      </Tooltip>
    </Authorized>
  );
}
