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
import { afterEach, describe, expect, it, vi } from 'vitest';
import CreateProject from './CreateProject';
import { button, renderWithScopes } from '../test/renderWithScopes';
import { DEVELOPER, VIEWER } from '../test/roles';

vi.mock('../hooks/useProjectHandler', () => ({ useProjectHandler: () => ({ handler: 'orders', handlerEdited: false, handlerTaken: false, isCheckingAvailability: false, availability: { handlerUnique: true } }) }));
vi.mock('../hooks/useProjects', () => ({ useCreateProject: () => ({}) }));
vi.mock('../hooks/useAppNavigate', () => ({ useAppNavigate: () => vi.fn() }));
vi.mock('../contexts/UnsavedChangesContext', () => ({ useUnsavedChanges: () => () => true }));
vi.mock('../nav', async (importOriginal) => ({ ...(await importOriginal<typeof import('../nav')>()), resourceUrl: () => '/' }));

let unmount = () => {};
afterEach(() => unmount());

/** The Create button once a name is typed into the form's first field. */
async function createProject(scopes: string[]) {
  const r = await renderWithScopes(<CreateProject level="organizations" org="acme" />, scopes);
  unmount = r.unmount;
  const name = r.container.querySelector('input')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(name, 'Orders');
    name.dispatchEvent(new Event('input', { bubbles: true }));
  });
  return button(r.container, 'Create');
}

describe('Create Project', () => {
  it('lets a Developer submit', async () => {
    expect((await createProject(DEVELOPER))?.disabled).toBe(false);
  });

  it('keeps a Viewer, who opens the page by URL, from submitting', async () => {
    expect((await createProject(VIEWER))?.disabled).toBe(true);
  });
});
