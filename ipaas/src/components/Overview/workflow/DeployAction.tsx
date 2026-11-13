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

import type { ReactNode } from 'react';
import { useWorkflowRuntime } from '../../../hooks/useWorkflowRuntime';
import { useWorkflowDeploy } from '../../../hooks/useWorkflowDeploy';
import type { DeployActionProps } from '../../../types/integration';
import DeployButton from '../_shared/DeployButton';

/**
 * A workflow's worker has nothing to connect to until the workflow runtime is
 * ready, so its deploy waits for it. A runtime on its way reads as progress; a
 * failed one is explained, with a retry, on the Deploy page. A deploy runs after
 * its request, so one still running holds the button until it ends, and so does
 * the read that tells whether one is.
 */
export default function DeployAction(props: DeployActionProps): ReactNode {
  const { data: runtime } = useWorkflowRuntime();
  const { isDeploying, isChecking } = useWorkflowDeploy(props.component.id, props.env.id);
  if (isDeploying) return <DeployButton {...props} blockedReason="A deployment to this environment is running" blockedLabel="Deploying…" />;
  if (isChecking) return <DeployButton {...props} blockedReason="Checking for a running deployment" />;
  if (runtime?.status === 'READY') return <DeployButton {...props} />;
  const preparing = !runtime || runtime.status === 'NOT_PROVISIONED' || runtime.status === 'PROVISIONING';
  return <DeployButton {...props} blockedReason={preparing ? 'Preparing workflow runtime' : 'Workflow runtime unavailable'} blockedLabel={preparing ? 'Preparing workflow runtime' : undefined} />;
}
