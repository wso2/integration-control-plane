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

import { afterEach, describe, expect, it, vi } from 'vitest';
import { Scopes } from '../../../constants/permissions';
import { button, renderWithScopes } from '../../../test/renderWithScopes';
import EditModelsDrawer from './EditModelsDrawer';

vi.mock('../../../hooks/useContextEngine', () => ({
  useUpdateContextModels: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false, error: new Error('failed to change the models of the context engine') }),
}));
vi.mock('../../../contexts/UnsavedChangesContext', () => ({ useUnsavedChanges: () => () => {} }));

const models = { embedding: { provider: 'openai', model: 'text-embedding-3-small' }, llm: { provider: 'openai', model: 'gpt-4o' }, answer: null, embeddingLocked: true };

let unmount = () => {};
afterEach(() => unmount());

describe('EditModelsDrawer', () => {
  it('shows a failed save beside the save button, where a scrolled drawer still shows it', async () => {
    const r = await renderWithScopes(<EditModelsDrawer engineId="docs" models={models} answersEnabled open onClose={() => {}} />, [Scopes.CONFIG_MANAGE]);
    unmount = r.unmount;
    expect(button(r.container, 'Save and restart')?.closest('footer')?.textContent).toContain("Couldn't save the models");
  });
});
