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
import { useComponentDeployment, useEnvEndpoints } from '../../../hooks/useDeployments';
import { useEntryEnvironmentIds } from '../../../hooks/useEntryEnvironment';
import { useOrgUuid } from '../../../hooks/useOrgUuid';
import type { HeaderActionsProps } from '../../../types/integration';
import { toEndpointOptions } from '../../../utils/endpoints';
import ApiSecurityDrawer from './ApiSecurityDrawer';
import * as styles from './apiConsumption.styles';

/**
 * Integration-as-API's header action: one "Configure security" link for the exposed APIs.
 *
 * An API's security changes only in the pipeline's entry environment and reaches later ones by
 * promotion, so it is configured once here, against the entry environment's endpoints, and each
 * env card shows what that environment enforces (SecuritySummary). With no pipeline to read, the
 * first environment stands in, and the BFF refuses a change outside the entry with a message naming it.
 */
export default function ApiSecurityAction({ component, environments, versionId, projectId, orgHandler }: HeaderActionsProps): ReactNode {
  const canUpdate = useCan()(Scopes.ENDPOINT_UPDATE);
  const orgUuid = useOrgUuid() ?? '';
  const [open, setOpen] = useState(false);

  const { ids: entryIds, loading: loadingEntry } = useEntryEnvironmentIds(projectId);
  const entryEnv = loadingEntry ? undefined : (environments.find((env) => entryIds.includes(env.id)) ?? environments[0]);

  const { data: deployment, isLoading: loadingDeployment } = useComponentDeployment(orgHandler, orgUuid, component.id, versionId, entryEnv?.id ?? '');
  const releaseId = deployment?.releaseId ?? '';
  const { data: endpoints = [], isLoading: loadingEndpoints } = useEnvEndpoints(releaseId ? component.id : '', versionId, releaseId);

  if (!canUpdate || !entryEnv) return null;

  const loading = loadingDeployment || loadingEndpoints;
  const blocked = !releaseId ? `Deploy to ${entryEnv.name} to configure security.` : endpoints.length === 0 ? `${entryEnv.name} has no endpoints to secure.` : null;
  const hint = loading ? '' : (blocked ?? `Set in ${entryEnv.name}. Promote to apply it to later environments.`);

  return (
    <>
      <Tooltip title={hint}>
        {/* A disabled button swallows pointer events, so the tooltip hangs off this wrapper. */}
        <Box component="span" sx={styles.securityLinkTarget}>
          <Link component="button" type="button" variant="body2" underline="hover" onClick={() => setOpen(true)} disabled={loading || !!blocked} sx={styles.securityLink}>
            <ShieldCheck size={14} />
            Configure security
          </Link>
        </Box>
      </Tooltip>
      {!blocked && (
        <ApiSecurityDrawer open={open} onClose={() => setOpen(false)} componentName={component.id} envName={entryEnv.id} envLabel={entryEnv.name} deploymentTrackId={versionId} endpoints={toEndpointOptions(endpoints)} activeEndpointName={endpoints[0]?.id} />
      )}
    </>
  );
}
