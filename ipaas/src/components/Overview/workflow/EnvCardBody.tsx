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

import { Divider, Typography } from '@wso2/oxygen-ui';
import type { ReactNode } from 'react';
import type { EnvCardBodyProps } from '../../../types/integration';
import EnvCardSkeleton from '../_shared/EnvCardSkeleton';
import DeployedBody from '../webhook/EnvCardBody';

const notDeployedSx = { textAlign: 'center', py: 2 } as const;

/**
 * Workflow body: a deployed environment shows its endpoints and insights, as a
 * webhook's does (a workflow publishes no API contract).
 */
export default function EnvCardBody(props: EnvCardBodyProps): ReactNode {
  const { hasDeployment, loadingDeployment, deploymentStatusV2 } = props;

  if (loadingDeployment) return <EnvCardSkeleton />;
  if (hasDeployment || deploymentStatusV2 === 'IN_PROGRESS') return <DeployedBody {...props} />;

  return (
    <>
      <Divider sx={{ my: 2 }} />
      <Typography variant="body2" color="text.secondary" sx={notDeployedSx}>
        This integration has not been deployed to this environment yet.
      </Typography>
    </>
  );
}
