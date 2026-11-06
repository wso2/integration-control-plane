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
import type { WorkflowNotice } from '../connection/workflowCredential';
import type { WorkflowNoticeAction } from '../connection/useWorkflowConnection';

interface TestKeyNoticeProps {
  notice: WorkflowNotice;
  /** What can be done about it here, such as switching the endpoint to API key or trying again. */
  action?: WorkflowNoticeAction | null;
}

/**
 * Stands in for a workflow view the console cannot reach the management API for: the gateway has
 * not exposed it yet, holds no test key the console may use, or the integration does not serve it
 * (`WorkflowConnection`'s `unavailable` state). Worded and styled as the Test Console's notice for
 * an endpoint it cannot test.
 */
export default function TestKeyNotice({ notice, action }: TestKeyNoticeProps): JSX.Element {
  return (
    <Alert
      severity={notice.severity}
      action={
        action ? (
          <Button color="inherit" size="small" disabled={action.pending} onClick={action.run} startIcon={action.pending ? <CircularProgress size={14} color="inherit" /> : undefined}>
            {action.label}
          </Button>
        ) : undefined
      }>
      {notice.text}
    </Alert>
  );
}
