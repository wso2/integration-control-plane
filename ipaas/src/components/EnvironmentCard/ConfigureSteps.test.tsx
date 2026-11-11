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

import { act } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ManageEndpoint } from './ConfigureSteps';
import { UnsavedChangesProvider } from '../../contexts/UnsavedChangesContext';
import { button, renderWithScopes } from '../../test/renderWithScopes';
import { DEVELOPER, VIEWER } from '../../test/roles';
import type { EnvEndpoint } from '../../types/component';

// The update the editor sends, without a BFF behind it.
const updateEndpoint = vi.hoisted(() => vi.fn());
vi.mock('../../hooks/useComponents', () => ({ useUpdateEndpoint: () => ({ mutate: updateEndpoint, isPending: false }) }));

const ep = { id: 'http', displayName: 'HTTP', networkVisibilities: ['Public'] } as EnvEndpoint;
const management = { id: 'workflow-ma-cf1', displayName: 'Workflow Management API', networkVisibilities: ['Public'] } as EnvEndpoint;
let unmount = () => {};
afterEach(() => {
  unmount();
  updateEndpoint.mockReset();
});

async function render(scopes: string[], endpoint: EnvEndpoint = ep, isWorkflow = false) {
  const r = await renderWithScopes(
    <MemoryRouter>
      <UnsavedChangesProvider>
        <ManageEndpoint ep={endpoint} componentId="orders" projectId="default" versionId="v1" releaseId="orders-1" environmentId="production" isWorkflow={isWorkflow} onBack={() => {}} />
      </UnsavedChangesProvider>
    </MemoryRouter>,
    scopes,
  );
  unmount = r.unmount;
  return r.container;
}

const update = async (scopes: string[]) => button(await render(scopes), 'Update');

const checkbox = (container: HTMLElement, label: string) => container.querySelector<HTMLInputElement>(`input[type="checkbox"][aria-label="${label}"]`)!;
const checkedLabels = (container: HTMLElement) => [...container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].filter((c) => c.checked).map((c) => c.getAttribute('aria-label'));

describe('ManageEndpoint visibility', () => {
  it('lets a Developer update it', async () => {
    expect((await update(DEVELOPER))?.disabled).toBe(false);
  });

  it('is not offered to a Viewer', async () => {
    expect(await update(VIEWER)).toBeUndefined();
  });
});

describe('ManageEndpoint network visibility', () => {
  it('shows Project as checked and locked', async () => {
    const project = checkbox(await render(DEVELOPER), 'Project');
    expect(project.checked).toBe(true);
    expect(project.disabled).toBe(true);
  });

  it('clears the checked host when it is clicked again', async () => {
    const container = await render(DEVELOPER);
    expect(checkedLabels(container)).toEqual(['Project', 'Public']);
    await act(async () => checkbox(container, 'Public').click());
    expect(checkedLabels(container)).toEqual(['Project']);
    await act(async () => checkbox(container, 'Public').click());
    expect(checkedLabels(container)).toEqual(['Project', 'Public']);
  });

  it('keeps Public and Organization exclusive', async () => {
    const container = await render(DEVELOPER);
    await act(async () => checkbox(container, 'Organization').click());
    expect(checkedLabels(container)).toEqual(['Project', 'Organization']);
  });
});

describe("ManageEndpoint on a workflow's Management API", () => {
  const dialog = (container: HTMLElement) => container.ownerDocument.querySelector('[role="dialog"]');
  const dialogButton = (container: HTMLElement, name: string) => [...(dialog(container)?.querySelectorAll('button') ?? [])].find((b) => b.textContent === name);
  const changeVisibility = (container: HTMLElement) => act(async () => checkbox(container, 'Organization').click());

  it('says what its visibility reaches, and asks before updating it', async () => {
    const container = await render(DEVELOPER, management, true);
    expect(container.textContent).toContain('the User Portal calls it only on the public host');
    await changeVisibility(container);
    await act(async () => button(container, 'Update')?.click());
    expect(dialog(container)?.textContent).toContain('Change the Workflow Management API’s visibility?');
    expect(updateEndpoint).not.toHaveBeenCalled();

    await act(async () => dialogButton(container, 'Cancel')?.click());
    expect(dialog(container)).toBeNull();
    expect(updateEndpoint).not.toHaveBeenCalled();

    await act(async () => button(container, 'Update')?.click());
    await act(async () => dialogButton(container, 'Update')?.click());
    expect(updateEndpoint).toHaveBeenCalledWith(expect.objectContaining({ endpointId: 'workflow-ma-cf1' }), expect.anything());
  });

  it('does not ask when the update changes nothing', async () => {
    const container = await render(DEVELOPER, management, true);
    await act(async () => button(container, 'Update')?.click());
    expect(dialog(container)).toBeNull();
    expect(updateEndpoint).toHaveBeenCalled();
  });

  it('treats an endpoint of that title outside a workflow as any other', async () => {
    const container = await render(DEVELOPER, management);
    expect(container.textContent).not.toContain('the User Portal calls it only on the public host');
    await changeVisibility(container);
    await act(async () => button(container, 'Update')?.click());
    expect(dialog(container)).toBeNull();
    expect(updateEndpoint).toHaveBeenCalled();
  });

  it('updates any other endpoint without asking', async () => {
    const container = await render(DEVELOPER, ep, true);
    expect(container.textContent).not.toContain('Workflow Management API');
    await act(async () => button(container, 'Update')?.click());
    expect(dialog(container)).toBeNull();
    expect(updateEndpoint).toHaveBeenCalledWith(expect.objectContaining({ endpointId: 'http' }), expect.anything());
  });

  it('says nothing to a role that cannot change it', async () => {
    expect((await render(VIEWER, management, true)).textContent).not.toContain('the User Portal calls it only on the public host');
  });
});
