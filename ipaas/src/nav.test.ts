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
import { componentHumanTasksUrl, componentKeepsPage, componentWorkflowsUrl, navScopeSwitchUrl, navUrl, parentGroupId, resolveActiveNavId, resolveResourceKey, type ComponentScope } from './nav';

const ORDERS: ComponentScope = { level: 'components', org: 'acme', project: 'default', component: 'orders' };
const BILLING: ComponentScope = { ...ORDERS, component: 'billing' };
const BASE = '/organizations/acme/projects/default/components/orders';

describe('workflow pages in the navigation', () => {
  it('sit under Operate at /workflows and /human-tasks', () => {
    expect(navUrl(ORDERS, 'workflows')).toBe(`${BASE}/workflows`);
    expect(navUrl(ORDERS, 'human-tasks')).toBe(`${BASE}/human-tasks`);
    expect(parentGroupId(ORDERS, 'workflows')).toBe('operate');
    expect(parentGroupId(ORDERS, 'human-tasks')).toBe('operate');
  });

  it('highlight Workflows on a run’s execution view too', () => {
    expect(resolveActiveNavId(`${BASE}/workflows`, ORDERS)).toBe('workflows');
    expect(resolveActiveNavId(`${BASE}/workflows/run-1`, ORDERS)).toBe('workflows');
    expect(resolveActiveNavId(`${BASE}/human-tasks`, ORDERS)).toBe('human-tasks');
  });

  it('build the same URLs as their sidebar entries', () => {
    expect(componentWorkflowsUrl(ORDERS)).toBe(navUrl(ORDERS, 'workflows'));
    expect(componentWorkflowsUrl(ORDERS, 'run 1')).toBe(`${BASE}/workflows/run%201`);
    expect(componentHumanTasksUrl(ORDERS)).toBe(navUrl(ORDERS, 'human-tasks'));
  });

  it('keep the page when switching to another workflow integration', () => {
    expect(resolveResourceKey(`${BASE}/human-tasks`, ORDERS)).toBe('human-tasks');
    expect(navScopeSwitchUrl(`${BASE}/human-tasks`, ORDERS, BILLING)).toBe('/organizations/acme/projects/default/components/billing/human-tasks');
  });
});

describe('componentKeepsPage', () => {
  const workflow = { isGenericService: false, isWorkflow: true };
  const service = { isGenericService: true, isWorkflow: false };
  const automation = { isGenericService: false, isWorkflow: false };

  it('keeps a workflow-only page only for a workflow integration', () => {
    expect(componentKeepsPage('workflows', workflow)).toBe(true);
    expect(componentKeepsPage('human-tasks', workflow)).toBe(true);
    expect(componentKeepsPage('workflows', service)).toBe(false);
    expect(componentKeepsPage('human-tasks', automation)).toBe(false);
  });

  it('keeps a generic-only page only for a generic service', () => {
    expect(componentKeepsPage('scaling', service)).toBe(true);
    expect(componentKeepsPage('health-checks', workflow)).toBe(false);
  });

  it('keeps every other page', () => {
    expect(componentKeepsPage('runtime', automation)).toBe(true);
    expect(componentKeepsPage('overview', workflow)).toBe(true);
  });
});
