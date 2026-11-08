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

import { Box, Link, Tooltip } from '@wso2/oxygen-ui';
import { ShieldCheck } from '@wso2/oxygen-ui-icons-react';
import { useState, type ReactNode } from 'react';
import { Scopes } from '../../../constants/permissions';
import { useCan } from '../../../hooks/useCan';
import { useComponentDeployments, useEnvEndpointsOfReleases } from '../../../hooks/useDeployments';
import { useEntryEnvironmentIds } from '../../../hooks/useEntryEnvironment';
import { useOrgUuid } from '../../../hooks/useOrgUuid';
import type { Environment } from '../../../types/environment';
import type { HeaderActionsProps } from '../../../types/integration';
import { toEndpointOptions } from '../../../utils/endpoints';
import { securityEnvironments, securityLinkState, targetFromEndpoints, type SecurityTarget } from '../../../utils/securityTargets';
import ApiSecurityDrawer from './ApiSecurityDrawer';
import * as styles from './apiConsumption.styles';

/**
 * Integration-as-API's header action: one "Configure security" link for the exposed APIs.
 *
 * An API's security changes only in the pipeline's entry environment and reaches later ones by
 * promotion, so it is configured here, against an entry environment's exposed endpoints, and each
 * env card shows what that environment enforces (SecuritySummary). Which environments qualify is
 * securityEnvironments' rule; with more than one ready, the drawer offers a choice.
 */
export default function ApiSecurityAction({ component, environments, versionId, projectId, orgHandler }: HeaderActionsProps): ReactNode {
  const canUpdate = useCan()(Scopes.ENDPOINT_UPDATE);
  const orgUuid = useOrgUuid();
  const { tree } = useEntryEnvironmentIds(projectId);

  // Nothing to offer until the pipeline has been read: it decides which environments take changes.
  if (!canUpdate || !orgUuid || tree === undefined || environments.length === 0) return null;
  return <SecurityLink componentId={component.id} versionId={versionId} orgHandler={orgHandler} orgUuid={orgUuid} environments={securityEnvironments(tree, environments)} />;
}

interface SecurityLinkProps {
  componentId: string;
  versionId: string;
  orgHandler: string;
  orgUuid: string;
  /** The environments security can be changed in, in pipeline order. */
  environments: Environment[];
}

function SecurityLink({ componentId, versionId, orgHandler, orgUuid, environments }: SecurityLinkProps): ReactNode {
  const [open, setOpen] = useState(false);
  const [chosenEnvId, setChosenEnvId] = useState<string | null>(null);

  const deployments = useComponentDeployments(
    orgHandler,
    orgUuid,
    componentId,
    versionId,
    environments.map((env) => env.id),
  );
  // Promoted environments can run the same release, so each release's endpoints are read once.
  const releaseIds = [...new Set(deployments.flatMap((d) => (d.data?.releaseId ? [d.data.releaseId] : [])))];
  const endpointReads = useEnvEndpointsOfReleases(componentId, versionId, releaseIds);

  const targets = environments.map((env, i): SecurityTarget => {
    const deployment = deployments[i];
    if (deployment.isLoading) return { env, status: 'loading' };
    if (deployment.isError) return { env, status: 'error' };
    const releaseId = deployment.data?.releaseId;
    if (!releaseId) return { env, status: 'notDeployed' };
    const endpoints = endpointReads[releaseIds.indexOf(releaseId)];
    if (endpoints.isError) return { env, status: 'error' };
    if (!endpoints.data) return { env, status: 'loading' };
    return targetFromEndpoints(env, endpoints.data);
  });

  const { action, hint } = securityLinkState(targets);
  const ready = targets.flatMap((t) => (t.status === 'ready' ? [t] : []));
  const target = ready.find((t) => t.env.id === chosenEnvId) ?? ready[0];

  const retry = () => {
    deployments.forEach((d) => d.isError && void d.refetch());
    endpointReads.forEach((e) => e.isError && void e.refetch());
  };

  return (
    <>
      <Tooltip title={hint}>
        {/* A disabled button swallows pointer events, so the tooltip hangs off this wrapper. */}
        <Box component="span" sx={styles.securityLinkTarget}>
          <Link component="button" type="button" variant="body2" underline="hover" onClick={action === 'retry' ? retry : () => setOpen(true)} disabled={action === 'wait' || action === 'blocked'} sx={styles.securityLink}>
            <ShieldCheck size={14} />
            Configure security
          </Link>
        </Box>
      </Tooltip>
      {target && (
        <ApiSecurityDrawer
          open={open}
          onClose={() => setOpen(false)}
          componentName={componentId}
          envName={target.env.id}
          envLabel={target.env.name}
          environments={ready.length > 1 ? ready.map((t) => t.env) : undefined}
          onEnvironmentChange={setChosenEnvId}
          deploymentTrackId={versionId}
          endpoints={toEndpointOptions(target.endpoints)}
          activeEndpointName={target.endpoints[0].id}
        />
      )}
    </>
  );
}
