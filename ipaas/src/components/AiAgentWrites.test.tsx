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

import { act, type ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import BuildHistory from './Build/BuildHistory';
import DeleteIntegrationButton from './DeleteIntegrationButton';
import IntegrationTypeSelector from './IntegrationCreate/IntegrationTypeSelector';
import SampleRowCard from './SampleRowCard';
import { Scopes } from '../constants/permissions';
import { AGENT_REFUSAL } from '../hooks/useCan';
import { button, flush, reasonFor, renderWithScopes } from '../test/renderWithScopes';
import { DEVELOPER, PLATFORM_ENGINEER } from '../test/roles';
import type { Component } from '../types/component';
import type { Repository } from '../types/repository';
import type { Sample } from '../types/samples';

vi.mock('../hooks/useDeployments', () => ({ useTriggerBuild: () => ({ mutate: vi.fn(), isPending: false }) }));
vi.mock('./Build/BuildRightDrawer', () => ({ default: () => null }));

const agent = { id: 'helper', displayName: 'Helper', displayType: 'ballerinaService', componentSubType: 'aiAgent' } as Component;
const agentSample = { displayName: 'Helper', componentType: 'ai-agent', repositoryUrl: '', subDirectory: '', componentPath: '', tags: [] } as unknown as Sample;
let unmount = () => {};
afterEach(() => unmount());

async function render(ui: ReactElement, scopes: string[]) {
  const r = await renderWithScopes(ui, scopes);
  unmount = r.unmount;
  await flush();
  return r.container;
}

async function agentCard(scopes: string[]) {
  const onSelect = vi.fn();
  const c = await render(<IntegrationTypeSelector selected={null} onSelect={onSelect} />, scopes);
  const card = [...c.querySelectorAll<HTMLElement>('[role="button"]')].find((e) => e.textContent?.includes('AI Agent'));
  await act(async () => card?.click());
  return { card, selected: onSelect.mock.calls.length > 0 };
}

const quickDeploy = async (scopes: string[]) => button(await render(<SampleRowCard sample={agentSample} onDeploy={() => {}} isDeploying={false} />, scopes), 'Deploy');

const buildConfiguration = async (scopes: string[]) =>
  button(
    await render(
      <MemoryRouter>
        <BuildHistory componentId="helper" versionId="v1" envId="development" branch="main" builds={[]} buildsLoading={false} commits={[]} commitsLoading={false} repository={{} as Repository} aiAgent />
      </MemoryRouter>,
      scopes,
    ),
    'Build configuration',
  );

const deleteAgent = async (scopes: string[]) => button(await render(<DeleteIntegrationButton component={agent} onClick={() => {}} />, scopes), 'Delete Helper');

describe('AI-agent writes, which agent-manager checks against amp:agent:*', () => {
  it('refuses a Platform Engineer to create an AI agent, with the reason', async () => {
    const { card, selected } = await agentCard(PLATFORM_ENGINEER);
    expect(card?.getAttribute('aria-disabled')).toBe('true');
    expect(card?.getAttribute('title')).toBe(AGENT_REFUSAL);
    expect(selected).toBe(false);
    unmount();
    const sample = await quickDeploy(PLATFORM_ENGINEER);
    expect(sample?.disabled).toBe(true);
    expect(reasonFor(sample)).toBe(AGENT_REFUSAL);
  });

  it("refuses a Platform Engineer to edit an AI agent's build parameters, with the reason", async () => {
    const b = await buildConfiguration(PLATFORM_ENGINEER);
    expect(b?.disabled).toBe(true);
    expect(reasonFor(b)).toBe(AGENT_REFUSAL);
  });

  it('refuses a Platform Engineer to delete an AI agent, with the reason', async () => {
    const b = await deleteAgent(PLATFORM_ENGINEER);
    expect(b?.disabled).toBe(true);
    expect(reasonFor(b)).toBe(AGENT_REFUSAL);
  });

  it('lets a Developer create and edit the build parameters of an AI agent, and Admin delete one', async () => {
    expect((await agentCard(DEVELOPER)).selected).toBe(true);
    unmount();
    expect((await quickDeploy(DEVELOPER))?.disabled).toBe(false);
    unmount();
    expect((await buildConfiguration(DEVELOPER))?.disabled).toBe(false);
    unmount();
    // Admin holds both ipaas:integration:delete and amp:agent:delete; Developer only the second.
    expect((await deleteAgent([...DEVELOPER, Scopes.INTEGRATION_DELETE]))?.disabled).toBe(false);
  });
});
