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

import type { JSX } from 'react';
import WorkflowRunsPage from '../components/Workflows/runs/WorkflowRunsPage';
import WorkflowPageShell from '../components/Workflows/shared/WorkflowPageShell';
import type { ComponentScope } from '../nav';

/**
 * A workflow integration's runs, under Operate at `.../workflows` (and a run's execution view at
 * `.../workflows/:runId`, read from the route params by the content).
 */
export default function ComponentWorkflows(scope: ComponentScope): JSX.Element {
  return (
    <WorkflowPageShell scope={scope} title="Workflows" purpose="runWorkflows">
      {(slot) => <WorkflowRunsPage {...slot} />}
    </WorkflowPageShell>
  );
}
