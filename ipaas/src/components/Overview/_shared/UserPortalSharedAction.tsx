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
import type { EnvCardSharedActionProps } from '../../../types/integration';
import { isWorkflowIntegration } from '../../../utils/workflowIntegration';
import UserPortalAction from '../../UserPortal/UserPortalAction';

// The action renders nothing where ipaas-service serves no User Portal; the footer then takes no
// space, so the card doesn't end in an empty gap.
const footerSx = { mt: 2, '&:empty': { display: 'none' } } as const;

/**
 * The env card's User Portal action, in the card's footer: Publish, Unpublish, or
 * "User Portal off" while the environment has none. For the types the portal shows.
 */
export default function UserPortalSharedAction({ component, env, orgHandler, projectId, onNotify }: EnvCardSharedActionProps): JSX.Element {
  return (
    <Box sx={footerSx}>
      <UserPortalAction orgHandler={orgHandler} projectId={projectId} componentId={component.id} environment={env.id} envName={env.name} onNotify={onNotify} isWorkflow={isWorkflowIntegration(component)} />
    </Box>
  );
}
