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

import { Box } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import { DEPLOYMENT_STATUS_DOT } from '../../constants/deploymentStatusDot';
import { useComponentDeployment } from '../../hooks/useDeployments';

/**
 * FAILED is not in the shared table — only this surface has seen the API return it,
 * and adding it there would start labelling it on the Overview card, which today
 * renders nothing for a status it does not recognise.
 */
const EXTRA_DOT_COLORS: Record<string, string> = {
  FAILED: 'error.main',
};

export interface EnvStatusDotProps {
  orgHandler: string;
  orgUuid: string;
  componentId: string;
  /** Deployment track id — `versionId` in the deployments API; undefined while the page hasn't resolved it. */
  versionId: string | undefined;
  envId: string;
}

/**
 * Deployment-status dot for one environment. Keyed identically to the page's own
 * useComponentDeployment call, so the selected environment's dot is served from
 * cache; the other environments each cost one request, and only once their
 * MenuItem mounts (when the dropdown opens).
 */
export default function EnvStatusDot({ orgHandler, orgUuid, componentId, versionId, envId }: EnvStatusDotProps): JSX.Element {
  const { data: deployment } = useComponentDeployment(orgHandler, orgUuid, componentId, versionId, envId);
  const status = deployment?.deploymentStatusV2?.toUpperCase() ?? '';
  // Anything unrecognised — including an absent deployment — reads as "not deployed".
  const color = DEPLOYMENT_STATUS_DOT[status]?.dotColor ?? EXTRA_DOT_COLORS[status] ?? 'text.disabled';
  return <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: color, flexShrink: 0 }} />;
}
