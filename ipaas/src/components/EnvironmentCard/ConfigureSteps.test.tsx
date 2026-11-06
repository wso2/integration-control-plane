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
import { afterEach, describe, expect, it } from 'vitest';
import { ManageEndpoint } from './ConfigureSteps';
import { UnsavedChangesProvider } from '../../contexts/UnsavedChangesContext';
import { button, renderWithScopes } from '../../test/renderWithScopes';
import { DEVELOPER, VIEWER } from '../../test/roles';
import type { EnvEndpoint } from '../../types/component';

const ep = { id: 'http', displayName: 'HTTP', networkVisibilities: ['Public'] } as EnvEndpoint;
let unmount = () => {};
afterEach(() => unmount());

async function render(scopes: string[]) {
  const r = await renderWithScopes(
    <MemoryRouter>
      <UnsavedChangesProvider>
        <ManageEndpoint ep={ep} componentId="orders" projectId="default" versionId="v1" releaseId="orders-1" environmentId="production" onBack={() => {}} />
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
