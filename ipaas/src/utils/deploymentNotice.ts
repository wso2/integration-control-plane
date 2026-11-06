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

/** Which situation an environment with nothing to show is in — picks icon and copy. */
export type DeploymentNoticeKind = 'notDeployed' | 'deploying' | 'error' | 'suspended' | 'noExecutions';

export interface DeploymentNotice {
  kind: DeploymentNoticeKind;
  message: string;
}

/**
 * Copy for an environment card with no execution data to show. Keyed purely on
 * the environment's own deployment — never on the build — because the build and
 * the deployment drift apart: a failed build leaves the previous deployment
 * running, and a green build is not deployed until the rollout lands.
 *
 * Only the `noExecutions` case names a button, since that is the one state where
 * Test/Run and Schedule are enabled.
 *
 * @param hasDeployment  whether the environment has a deployment at all
 * @param status         raw `deploymentStatusV2` (`ACTIVE` | `IN_PROGRESS` | `ERROR` | `SUSPENDED`)
 * @param envCritical    critical environments label the action "Run", others "Test"
 */
export function deploymentNotice(hasDeployment: boolean, status: string | null | undefined, envCritical: boolean): DeploymentNotice {
  if (!hasDeployment) {
    return { kind: 'notDeployed', message: 'This integration is not deployed to this environment yet. Deploy it to run executions.' };
  }
  switch (status) {
    case 'IN_PROGRESS':
      return { kind: 'deploying', message: 'Deployment in progress. Executions become available once it is active.' };
    case 'ERROR':
      return { kind: 'error', message: 'This deployment is in an error state. Check the runtime logs and redeploy to run executions.' };
    case 'SUSPENDED':
      return { kind: 'suspended', message: 'This deployment is stopped. Start it to run executions.' };
    default:
      // ACTIVE, or a status the backend has not reported yet — the card's actions
      // are live either way, so point at them.
      return { kind: 'noExecutions', message: `No execution data available. Click '${envCritical ? 'Run' : 'Test'}' or use 'Schedule' to trigger an execution.` };
  }
}

/** Severity + copy for a Test surface that has nothing to test. */
export interface NotDeployedNotice {
  severity: 'info' | 'warning' | 'error';
  message: string;
}

/** What a page with nothing to act on needs the deployment for: testing, or a workflow page's own work. */
export type NotDeployedPurpose = 'test' | 'runWorkflows' | 'workOnTasks';

// Each purpose's phrase in each sentence below, so every surface explains the same state alike.
const PURPOSE_PHRASES: Record<NotDeployedPurpose, { start: string; whenActive: string; redeploy: string; begin: string }> = {
  test: { start: 'start testing', whenActive: 'start testing', redeploy: 'before testing', begin: 'begin testing' },
  runWorkflows: { start: 'run its workflows', whenActive: 'run its workflows', redeploy: 'to run its workflows', begin: 'run its workflows' },
  workOnTasks: { start: 'work on its tasks', whenActive: 'work on its tasks', redeploy: 'to work on its tasks', begin: 'work on its tasks' },
};

/**
 * Why a Test page (or a workflow page, by `purpose`) cannot run anything, keyed on the
 * same `deploymentStatusV2` vocabulary as `deploymentNotice` above. Kept here rather
 * than in the Alert so the wording is testable and the surfaces cannot drift apart.
 */
export function notDeployedNotice(status: string | null | undefined, purpose: NotDeployedPurpose = 'test'): NotDeployedNotice {
  const phrase = PURPOSE_PHRASES[purpose];
  switch (status) {
    case 'IN_PROGRESS':
      return { severity: 'info', message: `Deployment is still in progress. You can ${phrase.whenActive} once it becomes active.` };
    case 'ERROR':
      return { severity: 'error', message: `This deployment is in an error state. Check the runtime logs and redeploy ${phrase.redeploy}.` };
    case 'SUSPENDED':
      return { severity: 'warning', message: `This deployment is stopped. Start it to ${phrase.begin}.` };
    default:
      return { severity: 'warning', message: `This integration is not yet deployed. Deploy it to ${phrase.start}.` };
  }
}
