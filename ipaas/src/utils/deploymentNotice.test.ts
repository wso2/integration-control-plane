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

import { describe, expect, it } from 'vitest';
import { deploymentNotice, notDeployedNotice } from './deploymentNotice';

describe('deploymentNotice', () => {
  it('asks for a deployment when the environment has none', () => {
    const notice = deploymentNotice(false, null, false);
    expect(notice.kind).toBe('notDeployed');
    expect(notice.message).not.toContain('Click');
  });

  it('ignores the status entirely when there is no deployment', () => {
    for (const status of ['ACTIVE', 'ERROR', 'IN_PROGRESS', 'SUSPENDED', null, undefined]) {
      expect(deploymentNotice(false, status, false).kind).toBe('notDeployed');
    }
  });

  it('reports a rollout in progress', () => {
    expect(deploymentNotice(true, 'IN_PROGRESS', false).kind).toBe('deploying');
  });

  it('reports an errored deployment', () => {
    expect(deploymentNotice(true, 'ERROR', false).kind).toBe('error');
  });

  it('reports a stopped deployment', () => {
    expect(deploymentNotice(true, 'SUSPENDED', false).kind).toBe('suspended');
  });

  it('never names a button in a state where the actions are disabled', () => {
    for (const status of ['IN_PROGRESS', 'ERROR', 'SUSPENDED']) {
      const { message } = deploymentNotice(true, status, true);
      expect(message).not.toContain('Click');
      expect(message).not.toContain('Schedule');
    }
  });

  it('points at the actions once the deployment is active', () => {
    expect(deploymentNotice(true, 'ACTIVE', false)).toEqual({
      kind: 'noExecutions',
      message: "No execution data available. Click 'Test' or use 'Schedule' to trigger an execution.",
    });
  });

  it('labels the action Run for a critical environment', () => {
    expect(deploymentNotice(true, 'ACTIVE', true).message).toContain("Click 'Run'");
  });

  it('treats an unreported status on a live deployment as actionable', () => {
    expect(deploymentNotice(true, undefined, false).kind).toBe('noExecutions');
    expect(deploymentNotice(true, null, false).kind).toBe('noExecutions');
  });
});

describe('notDeployedNotice', () => {
  it('is informational while a rollout is running', () => {
    expect(notDeployedNotice('IN_PROGRESS').severity).toBe('info');
  });

  it('is an error for a failed deployment', () => {
    expect(notDeployedNotice('ERROR').severity).toBe('error');
  });

  it('warns for a stopped deployment', () => {
    const notice = notDeployedNotice('SUSPENDED');
    expect(notice.severity).toBe('warning');
    expect(notice.message).toContain('stopped');
  });

  it('falls back to "not deployed" for an absent or unknown status', () => {
    for (const status of [null, undefined, 'ACTIVE', 'SOMETHING_NEW']) {
      const notice = notDeployedNotice(status);
      expect(notice.severity).toBe('warning');
      expect(notice.message).toContain('not yet deployed');
    }
  });

  it('words a Test page by default', () => {
    expect(notDeployedNotice(null).message).toBe('This integration is not yet deployed. Deploy it to start testing.');
    expect(notDeployedNotice('ERROR').message).toBe('This deployment is in an error state. Check the runtime logs and redeploy before testing.');
  });

  it('names what a workflow page needs the deployment for', () => {
    expect(notDeployedNotice(null, 'runWorkflows').message).toBe('This integration is not yet deployed. Deploy it to run its workflows.');
    expect(notDeployedNotice('IN_PROGRESS', 'workOnTasks').message).toBe('Deployment is still in progress. You can work on its tasks once it becomes active.');
    expect(notDeployedNotice('ERROR', 'runWorkflows').message).toBe('This deployment is in an error state. Check the runtime logs and redeploy to run its workflows.');
    expect(notDeployedNotice('SUSPENDED', 'workOnTasks').message).toBe('This deployment is stopped. Start it to work on its tasks.');
  });
});
