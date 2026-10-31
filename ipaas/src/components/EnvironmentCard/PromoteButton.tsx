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

import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Tooltip, Typography } from '@wso2/oxygen-ui';
import { ArrowDown } from '@wso2/oxygen-ui-icons-react';
import { useState, type ReactNode } from 'react';
import { useResourceLinks } from '../../hooks/useConfiguration';
import { promoteWithoutValues } from '../../utils/resourceLinks';
import { useComponentDeployment } from '../../hooks/useDeployments';
import { usePromote } from '../../hooks/useDeployments';
import { useOrgUuid } from '../../hooks/useOrgUuid';
import Authorized from '../Authorized';
import { Permissions } from '../../constants/permissions';

interface PromoteButtonProps {
  orgHandler: string;
  projectId: string;
  componentId: string;
  versionId: string;
  deploymentPipelineId: string;
  sourceEnvId: string;
  targetEnvId: string;
  icon?: ReactNode;
  onPromoteStarted?: () => void;
  onPromoteSettled?: () => void;
}

export default function PromoteButton({ orgHandler, projectId, componentId, versionId, deploymentPipelineId, sourceEnvId, targetEnvId, icon, onPromoteStarted, onPromoteSettled }: PromoteButtonProps) {
  const orgUuid = useOrgUuid() ?? '';
  const { data: sourceDeployment, isLoading: sourceLoading } = useComponentDeployment(orgHandler, orgUuid, componentId, versionId, sourceEnvId);
  const { data: targetDeployment, isLoading: targetLoading } = useComponentDeployment(orgHandler, orgUuid, componentId, versionId, targetEnvId);
  const promote = usePromote();
  const links = useResourceLinks(projectId, componentId, true);
  const [checking, setChecking] = useState(false);
  const [confirming, setConfirming] = useState<{ withoutValues: string[]; unchecked: boolean } | null>(null);

  const deploymentsLoading = sourceLoading || targetLoading;
  const buildId = sourceDeployment?.build?.buildId;
  const sourceReleaseId = sourceDeployment?.releaseId;
  // The release, not the build: a ComponentType update gives the same build a new release.
  const alreadyPromoted = !deploymentsLoading && !!sourceReleaseId && sourceReleaseId === targetDeployment?.releaseId;

  const missingPipeline = !deploymentPipelineId;
  const canPromote = !!buildId && !!sourceReleaseId && !missingPipeline && !alreadyPromoted;

  // The target starts the release with the resources it carries: decide on a read made now, not on a cached or pending one.
  const checkThenPromote = async () => {
    setChecking(true);
    const read = await links.refetch();
    setChecking(false);
    const withoutValues = read.isSuccess ? promoteWithoutValues(read.data, sourceEnvId, targetEnvId) : [];
    if (!read.isSuccess || withoutValues.length > 0) setConfirming({ withoutValues, unchecked: !read.isSuccess });
    else handlePromote();
  };

  const handlePromote = () => {
    setConfirming(null);
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
          <Button variant="outlined" size="small" startIcon={icon ?? <ArrowDown size={14} />} disabled={deploymentsLoading || !canPromote || checking || promote.isPending} onClick={checkThenPromote}>
            {checking ? 'Checking…' : promote.isPending ? 'Promoting…' : 'Promote'}
          </Button>
        </span>
      </Tooltip>
      <Dialog open={!!confirming} onClose={() => setConfirming(null)}>
        <DialogTitle>Promote to {targetEnvId}?</DialogTitle>
        <DialogContent>
          {confirming?.unchecked && <Typography variant="body2">Couldn&apos;t check that the resources this release uses have values in {targetEnvId}. It won&apos;t start there if one has none.</Typography>}
          {confirming?.withoutValues.map((r) => (
            <Typography key={r} variant="body2">
              {r} has no values in {targetEnvId}. It won&apos;t start there until you add them on WSO2 Cloud.
            </Typography>
          ))}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirming(null)}>Cancel</Button>
          <Button variant="contained" onClick={handlePromote}>
            Promote
          </Button>
        </DialogActions>
      </Dialog>
    </Authorized>
  );
}
