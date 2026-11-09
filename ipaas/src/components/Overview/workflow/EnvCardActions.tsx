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
import type { ReactNode } from 'react';
import type { EnvCardActionsProps } from '../../../types/integration';
import { isWorkflowIntegration } from '../../../utils/workflowIntegration';
import UserPortalAction from '../../UserPortal/UserPortalAction';
import ApiEnvCardActions from '../integration-as-api/EnvCardActions';

// The action renders nothing where ipaas-service serves no User Portal; the wrapper must then take no
// space, or the header's gap would leave a hole before View logs.
const portalSx = { display: 'flex', alignItems: 'center', minWidth: 0, '&:empty': { display: 'none' } } as const;

/**
 * A workflow's right-header slot: the User Portal switch where Test sits on other types, then the
 * actions integration-as-API offers (View logs, Stop/Start/Redeploy). Workflows have no Test page.
 */
export default function EnvCardActions(props: EnvCardActionsProps): ReactNode {
  const { component, env, orgHandler, projectId, onNotify } = props;
  return (
    <>
      <Box sx={portalSx}>
        <UserPortalAction orgHandler={orgHandler} projectId={projectId} componentId={component.id} environment={env.id} envName={env.name} onNotify={onNotify} isWorkflow={isWorkflowIntegration(component)} />
      </Box>
      <ApiEnvCardActions {...props} hideTest />
    </>
  );
}
