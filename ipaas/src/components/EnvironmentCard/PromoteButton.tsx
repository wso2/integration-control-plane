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
import { useIntegrationLinks } from '../../hooks/useConfiguration';
import { promoteWithoutValues } from '../../utils/integrationLinks';
import { useComponentDeployment, usePromote } from '../../hooks/useDeployments';
import { pendingApiChange, PENDING_API_CHANGE_TOOLTIP } from '../../utils/promotion';
import { useOrgUuid } from '../../hooks/useOrgUuid';
import { useCan } from '../../hooks/useCan';
import { useUserPortalPublications } from '../../hooks/useUserPortal';
import { Scopes } from '../../constants/permissions';
import { isUserPortalUnavailable } from '../../utils/apiErrors';
import type { UserPortalPublications } from '../../types/userPortal';

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
  /** Why the promote cannot run yet, when something outside this deployment holds it back. */
  blockedReason?: string;
  /** A workflow's API security, which a promotion carries, depends on where it is published to the User Portal. */
  isWorkflow?: boolean;
}

/**
 * What promoting a workflow does to the console's workflow views in the target. `carried`: it is published to the User
 * Portal in the source, so its Management API takes only User Portal sign-ins there, and the promotion carries that to a
 * target it isn't published in. `unchecked`: where it is published couldn't be read. `unpublishing`: the target is still
 * being redeployed to take the console's API key after an unpublish, which the promotion waits for.
 */
type PortalSignIn = 'carried' | 'unchecked' | 'unpublishing' | null;

export default function PromoteButton({ orgHandler, projectId, componentId, versionId, deploymentPipelineId, sourceEnvId, targetEnvId, icon, onPromoteStarted, onPromoteSettled, blockedReason, isWorkflow = false }: PromoteButtonProps) {
  const orgUuid = useOrgUuid() ?? '';
  const { data: sourceDeployment, isLoading: sourceLoading } = useComponentDeployment(orgHandler, orgUuid, componentId, versionId, sourceEnvId);
  const { data: targetDeployment, isLoading: targetLoading } = useComponentDeployment(orgHandler, orgUuid, componentId, versionId, targetEnvId);
  const promote = usePromote();
  const links = useIntegrationLinks(projectId, componentId, true);
  // Read only when promoting, as the resource values are.
  const publications = useUserPortalPublications(componentId, { enabled: false });
  const [checking, setChecking] = useState(false);
  const [confirming, setConfirming] = useState<{ withoutValues: string[]; unchecked: boolean; portal: PortalSignIn } | null>(null);
  const can = useCan();

  const deploymentsLoading = sourceLoading || targetLoading;
  const buildId = sourceDeployment?.build?.buildId;
  const sourceReleaseId = sourceDeployment?.releaseId;
  // The release, not the build: a ComponentType update gives the same build a new release. Two environments on the
  // same release can still differ in API settings or visibility, which only a promotion carries.
  const sameRelease = !deploymentsLoading && !!sourceReleaseId && sourceReleaseId === targetDeployment?.releaseId;
  const apiChange = sameRelease ? pendingApiChange(sourceDeployment?.proxyReconciliation, targetDeployment?.proxyReconciliation) : null;
  const alreadyPromoted = sameRelease && !apiChange;

  const missingPipeline = !deploymentPipelineId;
  const canPromote = !!buildId && !!sourceReleaseId && !missingPipeline && !alreadyPromoted && !blockedReason;

  // The target starts the release with the resources it carries: decide on a read made now, not on a cached or pending one.
  const checkThenPromote = async () => {
    setChecking(true);
    const [read, published] = await Promise.all([links.refetch(), isWorkflow ? publications.refetch() : null]);
    setChecking(false);
    const withoutValues = read.isSuccess ? promoteWithoutValues(read.data, sourceEnvId, targetEnvId) : [];
    // A failed read can still hold what an earlier one answered: decide on this one.
    const portal = published ? portalSignIn(published.isSuccess ? published.data : undefined, published.error, sourceEnvId, targetEnvId) : null;
    if (!read.isSuccess || withoutValues.length > 0 || portal) setConfirming({ withoutValues, unchecked: !read.isSuccess, portal });
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

  if (!can(Scopes.INTEGRATION_DEPLOY)) return null;

  const tooltipTitle =
    blockedReason ??
    (!buildId
      ? 'No build available to promote'
      : alreadyPromoted
        ? 'Already deployed in target environment'
        : missingPipeline
          ? 'No deployment pipeline configured for this project'
          : promote.isError
            ? promote.error.message
            : apiChange
              ? PENDING_API_CHANGE_TOOLTIP[apiChange]
              : '');

  return (
    <>
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
          {confirming?.unchecked && <Typography variant="body2">Couldn&apos;t check resource values in {targetEnvId}.</Typography>}
          {confirming?.withoutValues.map((r) => (
            <Typography key={r} variant="body2">
              {r} has no values in {targetEnvId}.
            </Typography>
          ))}
          {confirming?.portal === 'carried' && (
            <Typography variant="body2">
              This workflow is published to the User Portal in {sourceEnvId}, so its Workflow Management API takes only User Portal sign-ins there, and promoting carries that to {targetEnvId}. Until it&apos;s published to the User Portal in {targetEnvId} too,
              the console&apos;s workflow views won&apos;t work there.
            </Typography>
          )}
          {confirming?.portal === 'unchecked' && <Typography variant="body2">Couldn&apos;t check where this workflow is published to the User Portal.</Typography>}
          {confirming?.portal === 'unpublishing' && (
            <Typography variant="body2">
              This workflow was just unpublished from the User Portal in {targetEnvId}, and is still being redeployed there to take the console&apos;s API key again. Promote once that&apos;s done: a promotion redeploys it too, and whichever
              lands last decides which key it takes.
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirming(null)}>Cancel</Button>
          <Button variant="contained" onClick={handlePromote} disabled={confirming?.portal === 'unpublishing'}>
            Promote
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

/**
 * What the promotion does to a workflow's User Portal sign-in in the target, from where it is published, or the read's
 * failure. A BFF that serves no User Portal publishes nowhere. A target still being given back to the console after an
 * unpublish waits for that, which ipaas-service holds the promotion to as well.
 */
function portalSignIn(publications: UserPortalPublications | undefined, error: unknown, source: string, target: string): PortalSignIn {
  if (!publications) return error && !isUserPortalUnavailable(error) ? 'unchecked' : null;
  if (publications.unpublishing.includes(target)) return 'unpublishing';
  return publications.environments.includes(source) && !publications.environments.includes(target) ? 'carried' : null;
}
