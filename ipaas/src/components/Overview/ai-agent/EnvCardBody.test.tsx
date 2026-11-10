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
import type { EnvCardBodyProps } from '../../../types/integration';
import EnvCardBody from './EnvCardBody';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const projectUrl = 'http://math-tutor.dp-default-development.svc.cluster.local:9090/MathTutor';
const rawRoute = 'https://npvdrmdwhj-gw-p1.gateway.dp.dev.cloud.wso2.com/math-tutor-math-tutor-endpoint';
const gatewayUrl = 'https://npvdrmdwhj-gw-p1.gateway.dp.dev.cloud.wso2.com/math-tutor';

// The release listing as the BFF reports an agent: its own routes, whatever exposure it claims.
const listed = vi.hoisted(() => ({ endpoints: [] as unknown[] }));
const agentEndpoint = { id: 'math-tutor-endpoint', displayName: 'math-tutor-endpoint', networkVisibilities: ['Project'], exposure: 'none', projectUrl, publicUrl: rawRoute, invokeUrl: rawRoute };
vi.mock('../../../hooks/useDeployments', () => ({ useEnvEndpoints: () => ({ data: listed.endpoints }) }));
const security = vi.hoisted(() => ({ data: undefined as { publicUrl?: string } | undefined, error: null as Error | null, refetch: (() => {}) as () => void }));
vi.mock('../../../hooks/useConsumers', () => ({
  useEndpointSecurity: () => ({ data: security.data, isError: !!security.error, error: security.error, isFetching: false, refetch: security.refetch }),
}));
vi.mock('../../AgentChat', () => ({ default: () => null }));
vi.mock('../../../hooks/useVoiceAgents', () => ({ useLinkedVoiceAgents: () => ({ voiceAgents: [], isLoading: false, isError: false, refetch: () => {} }) }));

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  listed.endpoints = [agentEndpoint];
  security.error = null;
  security.refetch = () => {};
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function render(): Promise<string> {
  const props = {
    component: { id: 'math-tutor', displayType: 'ballerinaService', componentSubType: 'aiAgent' },
    env: { id: 'development', name: 'Development' },
    projectId: 'default',
    versionId: 'main',
    releaseId: 'release-1',
    hasDeployment: true,
  } as unknown as EnvCardBodyProps;
  await act(async () => root.render(<EnvCardBody {...props} />));
  return container.textContent ?? '';
}

describe('ai-agent EnvCardBody URLs', () => {
  it('lists the AI gateway URL as Public and none of the endpoint’s own URLs', async () => {
    security.data = { publicUrl: gatewayUrl };
    const text = await render();
    expect(text).toContain(gatewayUrl);
    expect(container.querySelector('[aria-label="Visibility: Public (through the AI gateway)"]')).not.toBeNull();
    expect(text).not.toContain(projectUrl);
    expect(text).not.toContain(rawRoute);
  });

  it('shows "—" for Public, not the project URL, while the gateway has no URL', async () => {
    for (const data of [undefined, { publicUrl: '' }]) {
      security.data = data;
      const text = await render();
      expect(container.querySelector('[aria-label="No public URL"]')?.textContent).toBe('—');
      expect(text).not.toContain(projectUrl);
      expect(text).not.toContain(rawRoute);
    }
  });

  it('offers a retry when the gateway URL could not be read, keeping "—" and no project URL', async () => {
    const refetch = vi.fn();
    security.data = undefined;
    security.error = new Error('agent-manager unavailable');
    security.refetch = refetch;
    const text = await render();
    expect(container.querySelector('[aria-label="No public URL"]')?.textContent).toBe('—');
    expect(text).not.toContain(projectUrl);
    const retry = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Retry');
    expect(retry).toBeDefined();
    await act(async () => retry!.click());
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('shows no error when the gateway simply has no URL yet', async () => {
    security.data = { publicUrl: '' };
    await render();
    expect([...container.querySelectorAll('button')].some((b) => b.textContent === 'Retry')).toBe(false);
  });

  it('keeps the endpoint section, with "—", before the release lists an endpoint', async () => {
    listed.endpoints = [];
    security.data = undefined;
    await render();
    expect(container.querySelector('[aria-label="No public URL"]')?.textContent).toBe('—');
    expect(container.querySelector('[aria-label="Download API specification"]')?.hasAttribute('disabled')).toBe(true);
  });
});
