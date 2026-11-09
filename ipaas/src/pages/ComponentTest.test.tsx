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

import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TestConsoleRoute } from './ComponentTest';
import { flush, renderWithScopes } from '../test/renderWithScopes';

const componentByHandler = vi.fn();
vi.mock('../hooks/useProjects', () => ({ useProjectId: () => ({ projectId: 'p1' }) }));
vi.mock('../hooks/useComponents', () => ({ useComponentByHandler: () => componentByHandler() }));
vi.mock('./TestConsole', () => ({ default: () => <div>test console</div> }));
vi.mock('./AgentChatConsole', () => ({ default: () => null }));
vi.mock('./AutomationTest', () => ({ default: () => null }));
vi.mock('./McpTest', () => ({ default: () => null }));

const WORKFLOW = { id: 'c1', displayType: 'ballerinaWorkflow', componentSubType: null };
const API = { id: 'c2', displayType: 'ballerinaService', componentSubType: null };

let unmount = () => {};
beforeEach(() => componentByHandler.mockReset());
afterEach(() => unmount());

async function open() {
  const r = await renderWithScopes(
    <MemoryRouter initialEntries={['/organizations/acme/projects/default/components/orders/test/console']}>
      <Routes>
        <Route path="/organizations/acme/projects/default/components/orders/test/console" element={<TestConsoleRoute level="components" org="acme" project="default" component="orders" />} />
        <Route path="*" element={<div>overview</div>} />
      </Routes>
    </MemoryRouter>,
    [],
  );
  unmount = r.unmount;
  await flush();
  return r.container;
}

describe('the test console route', () => {
  it('mounts nothing of the console while the integration is read', async () => {
    componentByHandler.mockReturnValue({ data: undefined, isPending: true });
    const container = await open();
    expect(container.textContent).not.toContain('test console');
    expect(container.querySelector('[role="progressbar"]')).not.toBeNull();
  });

  it("sends a workflow's link to its overview", async () => {
    componentByHandler.mockReturnValue({ data: WORKFLOW, isPending: false });
    const container = await open();
    expect(container.textContent).toBe('overview');
  });

  it('opens the console for any other integration', async () => {
    componentByHandler.mockReturnValue({ data: API, isPending: false });
    const container = await open();
    expect(container.textContent).toBe('test console');
  });
});
