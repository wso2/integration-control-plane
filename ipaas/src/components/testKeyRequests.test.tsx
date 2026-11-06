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

import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AgentChat from './AgentChat';
import McpEnvCardBody from './Overview/mcp-server/EnvCardBody';
import TestConsole from '../pages/TestConsole';
import { createEndpointTestKey, getEndpointSecurity } from '../api/consumers';
import { button, flush, renderWithScopes } from '../test/renderWithScopes';
import { DEVELOPER, VIEWER } from '../test/roles';
import type { EnvCardBodyProps } from '../types/integration';

vi.mock('../api/consumers', () => ({ getEndpointSecurity: vi.fn(), createEndpointTestKey: vi.fn(), getEndpointPolicies: vi.fn(async () => ({})) }));
const endpoint = { id: 'http', releaseId: 'r1', environmentId: 'development', displayName: 'http', type: 'REST', visibility: 'Public', publicUrl: 'https://gw.example/orders' };
vi.mock('../hooks/useDeployments', () => ({
  useEnvEndpoints: () => ({ data: [endpoint], isLoading: false }),
  useApiDefinition: () => ({ data: undefined }),
  useComponentDeployment: () => ({ data: { releaseId: 'r1', deploymentStatusV2: 'ACTIVE' } }),
}));
vi.mock('../hooks/useMcpTools', () => ({ useMcpTools: () => ({ tools: [], isLoading: false, error: null, isForbidden: false, isUnauthorized: false, refetch: vi.fn() }) }));
vi.mock('../hooks/useComponents', () => ({ useComponentByHandler: () => ({ data: { id: 'orders' }, isLoading: false }) }));
vi.mock('../hooks/useEnvironments', () => ({ useEnvironments: () => ({ data: [{ id: 'development', name: 'Development' }] }) }));
vi.mock('../hooks/useProjects', () => ({ useProjectId: () => ({ projectId: 'default' }) }));
vi.mock('../hooks/useOrgUuid', () => ({ useOrgUuid: () => 'acme' }));
vi.mock('../hooks/useSelectedTrack', () => ({ useSelectedTrack: () => ({ tracks: [], trackId: 'main' }) }));
vi.mock('../hooks/useApim', () => ({ useApimSwagger: () => ({ data: undefined, isLoading: false }) }));
vi.mock('./DeploymentTrackBar', () => ({ default: () => null }));
vi.mock('swagger-ui-react', () => ({ default: () => null }));

const mcpCard = { component: { id: 'orders' }, env: { id: 'development' }, projectId: 'default', versionId: 'main', releaseId: 'r1', hasDeployment: true, loadingDeployment: false, deploymentStatusV2: 'ACTIVE' } as unknown as EnvCardBodyProps;

// Every surface that shows a test key, on an endpoint secured by an API key.
const surfaces: [string, ReactNode][] = [
  ['the MCP overview card', <McpEnvCardBody {...mcpCard} />],
  ['the Test console', <TestConsole level="components" org="acme" project="default" component="orders" />],
  ['the agent chat', <AgentChat projectId="default" componentId="orders" versionId="main" releaseId="r1" environmentName="development" envCritical={false} />],
];

let unmount = () => {};
afterEach(() => unmount());
beforeEach(() => {
  vi.mocked(createEndpointTestKey).mockReset().mockResolvedValue({ keyId: 'k', apiKey: 'test-key' });
  vi.mocked(getEndpointSecurity).mockResolvedValue({ mode: 'api-key', publicUrl: 'https://gw.example/orders' } as never);
});

async function open(ui: ReactNode, scopes: string[]) {
  const r = await renderWithScopes(ui, scopes);
  unmount = r.unmount;
  await flush();
  await flush();
  return r.container;
}

describe('test keys', () => {
  it.each(surfaces)('are not requested on %s for a Viewer, who lacks ipaas:endpoint:test', async (_, ui) => {
    const c = await open(ui, VIEWER);
    expect(createEndpointTestKey).not.toHaveBeenCalled();
    expect(c.textContent).toContain("Your role can't create test keys.");
    expect(button(c, 'Get test key')).toBeUndefined();
  });

  it.each(surfaces)('are minted on %s for a Developer', async (_, ui) => {
    await open(ui, DEVELOPER);
    expect(createEndpointTestKey).toHaveBeenCalledTimes(1);
  });

  it('are not requested for an agent without amp:agent:api-key-manage', async () => {
    await open(
      surfaces[2][1],
      DEVELOPER.filter((s) => s !== 'amp:agent:api-key-manage'),
    );
    expect(createEndpointTestKey).not.toHaveBeenCalled();
  });
});
