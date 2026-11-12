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
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EnvCardActionsProps } from '../../../types/integration';
import EnvCardActions from './EnvCardActions';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// A voice agent as the release lists it: its WebSocket endpoint sorts first.
const voiceEndpoint = { id: 'voice-agent', displayName: 'voice-agent', type: 'Websocket', publicUrl: 'wss://gw.example/voice-agent-integration-voice-agent' };
const chatEndpoint = { id: 'voice-agent-integration-endpoint', displayName: 'voice-agent-integration-endpoint', type: 'HTTP', publicUrl: 'https://gw.example/voice-agent-integration' };
const listed = vi.hoisted(() => ({ endpoints: [] as unknown[] }));
vi.mock('../../../hooks/useDeployments', () => ({
  useEnvEndpoints: () => ({ data: listed.endpoints }),
  useRedeployDeployment: () => ({ mutate: () => {}, isPending: false }),
  useStopDeployment: () => ({ mutate: () => {}, isPending: false }),
}));
vi.mock('../../../hooks/useAppNavigate', () => ({ useAppNavigate: () => () => {} }));
vi.mock('../../../hooks/useSelectedTrack', () => ({ withTrackParam: (url: string) => url }));
vi.mock('../../../hooks/useCan', () => ({ useCan: () => () => true }));
vi.mock('../../../hooks/useVoiceAgents', () => ({ useLinkedVoiceAgents: () => ({ voiceAgents: [], isLoading: false, isError: false, refetch: () => {} }) }));
vi.mock('../integration-as-api/ServiceLogsDrawer', () => ({ default: () => null }));
vi.mock('react-router', async (original) => ({ ...(await original<object>()), useLocation: () => ({ search: '', pathname: '/' }) }));

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function renderButtons(): Promise<string[]> {
  const props = {
    component: { id: 'voice-agent-integration' },
    env: { id: 'development', name: 'Development' },
    versionId: 'main',
    releaseId: 'r1',
    orgHandler: 'acme',
    projectHandler: 'default',
    componentHandler: 'voice-agent-integration',
    projectId: 'default',
    hasDeployment: true,
    deploymentStatusV2: 'ACTIVE',
    isBuildInProgress: false,
    onNotify: () => {},
    requestPoll: () => {},
  } as unknown as EnvCardActionsProps;
  await act(async () => root.render(<EnvCardActions {...props} />));
  return [...container.querySelectorAll('button')].map((b) => b.textContent?.trim() ?? '');
}

describe('ai-agent EnvCardActions', () => {
  it('offers the chat Test, not Test voice, when a WebSocket endpoint sorts first', async () => {
    listed.endpoints = [voiceEndpoint, chatEndpoint];
    const buttons = await renderButtons();
    expect(buttons).toContain('Test');
    expect(buttons).not.toContain('Test voice');
  });

  it('offers Test voice for an agent whose only endpoint is a WebSocket one', async () => {
    listed.endpoints = [voiceEndpoint];
    const buttons = await renderButtons();
    expect(buttons).toContain('Test voice');
    expect(buttons).not.toContain('Test');
  });
});
