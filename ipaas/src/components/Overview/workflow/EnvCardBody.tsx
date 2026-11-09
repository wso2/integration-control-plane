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

import { Divider, Stack, Typography } from '@wso2/oxygen-ui';
import { Workflow } from '@wso2/oxygen-ui-icons-react';
import type { ReactNode } from 'react';
import type { EnvCardBodyProps } from '../../../types/integration';
import { isDeploymentHealthy } from '../../../utils/deploymentStatus';
import WorkflowEnvCardContent from '../../Workflows/overview/WorkflowEnvCardContent';
import EnvCardSkeleton from '../_shared/EnvCardSkeleton';

const notDeployedSx = { textAlign: 'center', py: 2 } as const;
const notActiveSx = { py: 3 } as const;
const notActiveIconStyle = { opacity: 0.4 } as const;

/**
 * Workflow body: a deployed environment shows its workflows alone. Its endpoints
 * are not listed: the business ones are reached through the workflows, and the
 * management API is the platform's own. The content needs the workflow runtime,
 * so it shows only once the deployment is active; until then the card says so.
 */
export default function EnvCardBody(props: EnvCardBodyProps): ReactNode {
  const { component, env, versionId, releaseId, hasDeployment, loadingDeployment, deploymentStatusV2 } = props;

  if (loadingDeployment) return <EnvCardSkeleton />;
  if (!hasDeployment) {
    return (
      <>
        <Divider sx={{ my: 2 }} />
        <Typography variant="body2" color="text.secondary" sx={notDeployedSx}>
          This integration has not been deployed to this environment yet.
        </Typography>
      </>
    );
  }

  return (
    <>
      <Divider sx={{ my: 2 }} />
      {isDeploymentHealthy(deploymentStatusV2) ? (
        <WorkflowEnvCardContent target={{ componentId: component.id, environmentId: env.id, trackId: versionId, deployment: { releaseId, deploymentStatusV2 }, isDeploymentLoading: false }} />
      ) : (
        // A deployment rolling out, stopped or failed is still a deployment: its workflows come once it is active.
        <Stack alignItems="center" gap={1} sx={notActiveSx} data-testid="workflow-env-card-inactive">
          <Workflow size={24} style={notActiveIconStyle} />
          <Typography variant="body2" color="text.secondary">
            The workflows show here once the deployment is active.
          </Typography>
        </Stack>
      )}
    </>
  );
}
