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

import { Alert, Button, CircularProgress } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import { useWorkflowDeploy } from '../../../hooks/useWorkflowDeploy';

interface WorkflowDeployNoticeProps {
  componentId: string;
  /** The OpenChoreo environment name. */
  environment: string;
}

const noticeSx = { mt: 2 } as const;

/**
 * A workflow's deploy or promote to this environment that is still running or failed, or a
 * status read that failed. The
 * platform finishes a workflow's deploy after the request: it connects the workflow runtime
 * first, which can take a minute. Nothing shows for a deploy that succeeded, since the
 * environment's own deployment then reports it.
 */
export default function WorkflowDeployNotice({ componentId, environment }: WorkflowDeployNoticeProps): JSX.Element | null {
  const { deploy, isDeploying, isError, refetch, failure } = useWorkflowDeploy(componentId, environment);
  if (isError) {
    // Not knowing is not the same as nothing running: say so, so a deploy is not started blind.
    return (
      <Alert
        severity="warning"
        sx={noticeSx}
        data-testid="workflow-deploy-unknown"
        action={
          <Button size="small" color="inherit" onClick={() => void refetch()}>
            Retry
          </Button>
        }>
        Couldn&apos;t check whether a deployment to this environment is running.
      </Alert>
    );
  }
  if (isDeploying) {
    return (
      <Alert severity="info" icon={<CircularProgress size={16} />} sx={noticeSx} data-testid="workflow-deploy-running">
        {deploy?.operation === 'promote' ? 'Promoting' : 'Deploying'} to this environment. Connecting the workflow runtime can take a minute.
      </Alert>
    );
  }
  if (failure) {
    return (
      <Alert severity="error" sx={noticeSx} data-testid="workflow-deploy-failed">
        The last {failure.operation === 'promote' ? 'promotion' : 'deployment'} to this environment failed: {failure.message || 'the deployment failed'}
      </Alert>
    );
  }
  return null;
}
