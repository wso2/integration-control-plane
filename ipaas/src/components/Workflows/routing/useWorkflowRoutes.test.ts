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

import { describe, expect, it, vi } from 'vitest';
import type { ComponentScope } from '../../../nav';
import { humanTasksUrl, workflowRunsUrl } from './useWorkflowRoutes';

// The URL builders only; the navigation hook needs a router.
vi.mock('../../../hooks/useAppNavigate', () => ({ useAppNavigate: () => vi.fn() }));

const SCOPE: ComponentScope = { level: 'components', org: 'acme', project: 'default', component: 'orders' };
const BASE = '/organizations/acme/projects/default/components/orders';

describe('workflowRunsUrl', () => {
  it('opens the Workflows page under the integration', () => {
    expect(workflowRunsUrl(SCOPE)).toBe(`${BASE}/workflows`);
  });

  it('carries the environment, definition and status a figure counted', () => {
    expect(workflowRunsUrl(SCOPE, { workflowType: 'orderWorkflow', status: 'FAILED', envId: 'production' })).toBe(`${BASE}/workflows?type=orderWorkflow&status=FAILED&env=production`);
  });

  it('carries the window a figure of closed runs counts in', () => {
    expect(workflowRunsUrl(SCOPE, { status: 'FAILED', closedWithin: '24h', envId: 'production' })).toBe(`${BASE}/workflows?status=FAILED&closed=24h&env=production`);
  });

  it('opens a run by its id, or a workflow’s newest run when only the workflow is known', () => {
    expect(workflowRunsUrl(SCOPE, { runId: 'run/1', workflowId: 'order-1' })).toBe(`${BASE}/workflows/run%2F1`);
    expect(workflowRunsUrl(SCOPE, { workflowId: 'order-1', envId: 'development' })).toBe(`${BASE}/workflows?env=development&workflowId=order-1`);
  });

  it('keeps the deployment track the page shows', () => {
    expect(workflowRunsUrl(SCOPE, { status: 'RUNNING' }, '?track=track-2&type=x')).toBe(`${BASE}/workflows?status=RUNNING&track=track-2`);
  });
});

describe('humanTasksUrl', () => {
  it('carries the kind of work item, the definition and the environment', () => {
    expect(humanTasksUrl(SCOPE, { type: 'review', workflowType: 'orderWorkflow', envId: 'production' })).toBe(`${BASE}/human-tasks?type=review&workflowType=orderWorkflow&env=production`);
    expect(humanTasksUrl(SCOPE)).toBe(`${BASE}/human-tasks`);
  });
});
