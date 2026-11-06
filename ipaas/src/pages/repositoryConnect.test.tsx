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

import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ImportIntegration from './ImportIntegration';
import { PUBLIC_REPO_URL_PLACEHOLDER } from '../constants/import';
import { Scopes } from '../constants/permissions';
import { CONNECT_REFUSAL } from '../hooks/useCan';
import { flush, renderWithScopes } from '../test/renderWithScopes';
import { DEVELOPER, PLATFORM_ENGINEER } from '../test/roles';
import type { SourceMode } from '../types/import';

// An organization with no git connection: every repository query is idle or empty.
const query = vi.hoisted(() => () => ({ data: undefined, isLoading: false, isFetching: false, isError: false, isSuccess: false, error: null, refetch: vi.fn() }));
vi.mock('../hooks/useRepository', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../hooks/useRepository')>()),
  useGitHubUserRepos: query,
  useAzureDevOpsOrganizations: () => ({ ...query(), data: [], isSuccess: true }),
  useAzureDevOpsProjects: query,
  useAzureDevOpsRepositories: query,
  useAzureDevOpsBranches: query,
  useAzureDevOpsContents: query,
  useAzureDevOpsMetadata: query,
  useRepoBranches: query,
  useRepoContents: query,
  useRepoMetadata: query,
  useComponentNameAvailability: query,
}));
vi.mock('../hooks/useProjects', () => ({ useProjectId: () => ({ projectId: 'default' }) }));
vi.mock('../hooks/useComponents', () => ({ useCreateComponent: () => ({ mutate: vi.fn(), isPending: false }) }));
vi.mock('../hooks/useBallerinaCentralToken', () => ({ useBallerinaCentralToken: () => ({ data: undefined }) }));
vi.mock('../hooks/useAppNavigate', () => ({ useAppNavigate: () => vi.fn() }));
vi.mock('../contexts/UnsavedChangesContext', () => ({ useUnsavedChanges: () => () => {} }));

window.API_CONFIG = { githubAppClientId: 'github-app', azureDevOpsClientId: 'azure-app' } as unknown as typeof window.API_CONFIG;

let unmount = () => {};
afterEach(() => unmount());

async function importPage(mode: SourceMode, scopes: string[]) {
  const r = await renderWithScopes(
    <MemoryRouter initialEntries={[{ pathname: '/', state: { mode } }]}>
      <ImportIntegration level="projects" org="acme" project="default" />
    </MemoryRouter>,
    scopes,
  );
  unmount = r.unmount;
  await flush();
  return r.container;
}

// The Azure DevOps icon carries its own <style>, so the label is matched at the end.
const connectButton = (c: HTMLElement, label: string) => [...c.querySelectorAll('button')].find((b) => b.textContent?.endsWith(label));
const WITHOUT_CONNECT = PLATFORM_ENGINEER.filter((s) => s !== Scopes.REPOSITORY_CONNECT);

describe('connecting a git account, which needs ipaas:repository:connect', () => {
  it.each([
    ['github', 'Authorize with GitHub'],
    ['azure-devops', 'Connect Azure DevOps'],
  ] as const)('is disabled, with the reason, on %s for a role without it', async (mode, control) => {
    const c = await importPage(mode, WITHOUT_CONNECT);
    expect(connectButton(c, control)?.disabled).toBe(true);
    expect(c.textContent).toContain(CONNECT_REFUSAL);
  });

  it.each([
    ['github', 'Authorize with GitHub'],
    ['azure-devops', 'Connect Azure DevOps'],
  ] as const)('is offered on %s to a Platform Engineer', async (mode, control) => {
    const c = await importPage(mode, PLATFORM_ENGINEER);
    expect(connectButton(c, control)?.disabled).toBe(false);
    expect(c.textContent).not.toContain(CONNECT_REFUSAL);
  });

  it('leaves a public repository importable for a Developer', async () => {
    const c = await importPage('public', DEVELOPER);
    expect(c.textContent).not.toContain(CONNECT_REFUSAL);
    expect(c.querySelector<HTMLInputElement>(`input[placeholder="${PUBLIC_REPO_URL_PLACEHOLDER}"]`)?.disabled).toBe(false);
  });
});
