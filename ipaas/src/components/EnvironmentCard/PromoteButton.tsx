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
import Authorized from '../Authorized';
import { Permissions } from '../../constants/permissions';

interface PromoteButtonProps {
  orgHandler: string;
  componentId: string;
  versionId: string;
  deploymentPipelineId: string;
  sourceEnvId: string;
  targetEnvId: string;
  icon?: ReactNode;
  onPromoteStarted?: () => void;
  onPromoteSettled?: () => void;
}

export default function PromoteButton({ orgHandler, componentId, versionId, deploymentPipelineId, sourceEnvId, targetEnvId, icon, onPromoteStarted, onPromoteSettled }: PromoteButtonProps) {
  const orgUuid = useOrgUuid() ?? '';
  const { data: sourceDeployment, isLoading: sourceLoading } = useComponentDeployment(orgHandler, orgUuid, componentId, versionId, sourceEnvId);
  const { data: targetDeployment, isLoading: targetLoading } = useComponentDeployment(orgHandler, orgUuid, componentId, versionId, targetEnvId);
  const promote = usePromote();

  const deploymentsLoading = sourceLoading || targetLoading;
  const buildId = sourceDeployment?.build?.buildId;
  const sourceReleaseId = sourceDeployment?.releaseId;
  const alreadyPromoted = !deploymentsLoading && !!buildId && buildId === targetDeployment?.build?.buildId;

  const missingPipeline = !deploymentPipelineId;
  const canPromote = !!buildId && !!sourceReleaseId && !missingPipeline && !alreadyPromoted;

  const handlePromote = () => {
    if (!canPromote || !sourceReleaseId) return;
    onPromoteStarted?.();
    promote.mutate(
      {
        componentId,
        apiVersionId: versionId,
        sourceReleaseId,
        // The BFF validates this source→target hop against the pipeline's promotion paths.
        sourceEnvironmentId: sourceEnvId,
        targetEnvironmentId: targetEnvId,
        deploymentPipelineId,
      },
      { onSettled: onPromoteSettled },
    );
  };

  const tooltipTitle = !buildId ? 'No build available to promote' : alreadyPromoted ? 'Already deployed in target environment' : missingPipeline ? 'No deployment pipeline configured for this project' : '';

  return (
    <Authorized permissions={Permissions.ENVIRONMENT_MANAGE}>
      <Tooltip title={tooltipTitle}>
        <span>
          <Button variant="outlined" size="small" startIcon={icon ?? <ArrowDown size={14} />} disabled={deploymentsLoading || !canPromote || promote.isPending} onClick={handlePromote}>
            {promote.isPending ? 'Promoting…' : 'Promote'}
          </Button>
        </span>
      </Tooltip>
    </Authorized>
  );
}
