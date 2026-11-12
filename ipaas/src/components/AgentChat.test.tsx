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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AgentChat from './AgentChat';
import { createEndpointTestKey, getEndpointSecurity } from '../api/consumers';
import { flush, renderWithScopes } from '../test/renderWithScopes';
import { DEVELOPER } from '../test/roles';

vi.mock('../api/consumers', () => ({ getEndpointSecurity: vi.fn(), createEndpointTestKey: vi.fn(), getEndpointPolicies: vi.fn(async () => ({})) }));
// A voice agent: its WebSocket endpoint sorts first and has its own wss:// route.
const endpoints = [
  { id: 'voice-agent', releaseId: 'r1', environmentId: 'development', displayName: 'voice-agent', type: 'Websocket', visibility: 'Public', publicUrl: 'wss://gw.example/voice-agent' },
  { id: 'voice-agent-integration-endpoint', releaseId: 'r1', environmentId: 'development', displayName: 'chat', type: 'HTTP', visibility: 'Public', publicUrl: 'https://gw.example/ai/voice-agent' },
];
vi.mock('../hooks/useDeployments', () => ({
  useEnvEndpoints: () => ({ data: endpoints, isLoading: false }),
  useApiDefinition: () => ({ data: undefined }),
}));
vi.mock('../hooks/useOrgUuid', () => ({ useOrgUuid: () => 'acme' }));

let unmount = () => {};
afterEach(() => unmount());
beforeEach(() => {
  vi.mocked(getEndpointSecurity).mockReset().mockResolvedValue({ mode: 'api-key', publicUrl: 'https://gw.example/ai/voice-agent' } as never);
  vi.mocked(createEndpointTestKey).mockReset().mockResolvedValue({ keyId: 'k', apiKey: 'test-key' });
});

describe('AgentChat', () => {
  it("chats with the agent's own endpoint, never its WebSocket one", async () => {
    const r = await renderWithScopes(
      <AgentChat projectId="default" componentId="voice-agent-integration" versionId="main" releaseId="r1" environmentName="development" envCritical={false} />,
      DEVELOPER,
    );
    unmount = r.unmount;
    await flush();
    await flush();
    const asked = vi.mocked(getEndpointSecurity).mock.calls.map(([ref]) => ref.endpointName);
    expect(asked).toContain('voice-agent-integration-endpoint');
    expect(asked).not.toContain('voice-agent');
  });
});
