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
import { afterEach, describe, expect, it, vi } from 'vitest';
import PermissionDeniedNotice from './PermissionDeniedNotice';
import McpEnvCardBody from './Overview/mcp-server/EnvCardBody';
import { BffError } from '../api/_client';
import { createEndpointTestKey, getEndpointSecurity } from '../api/consumers';
import { flush, renderWithScopes } from '../test/renderWithScopes';
import { DEVELOPER } from '../test/roles';
import type { EnvCardBodyProps } from '../types/integration';

vi.mock('../api/consumers', () => ({ getEndpointSecurity: vi.fn(), createEndpointTestKey: vi.fn() }));
vi.mock('../hooks/useDeployments', () => ({ useEnvEndpoints: () => ({ data: [{ id: 'mcp', publicUrl: 'https://gw.example/tools' }] }) }));
vi.mock('../hooks/useMcpTools', () => ({ useMcpTools: () => ({ tools: [], isLoading: false, error: null, isForbidden: false, isUnauthorized: false }) }));

/** A refusal as ipaas-service sends it, for a role whose grants are out of step with the console's gates. */
const refusal = (scope: string) => new BffError(403, JSON.stringify({ code: 'INSUFFICIENT_SCOPE', scope, message: `insufficient permissions: requires ${scope}` }));
const mcpCard = { component: { id: 'tools' }, env: { id: 'development' }, projectId: 'default', versionId: 'main', releaseId: 'r1', hasDeployment: true, loadingDeployment: false, deploymentStatusV2: 'ACTIVE' } as unknown as EnvCardBodyProps;

let unmount = () => {};
afterEach(() => unmount());

async function page(ui: ReactNode, scopes: string[]) {
  const r = await renderWithScopes(
    <>
      {ui}
      <PermissionDeniedNotice />
    </>,
    scopes,
  );
  unmount = r.unmount;
  await flush();
  return r.container;
}

/** Every message on the page that speaks of the refusal: the notice's and any the page shows itself. */
const refusalMessages = () => [...document.body.querySelectorAll('[role="alert"]')].map((a) => a.textContent ?? '').filter((t) => /role|permission|could not|failed/i.test(t));

describe('a refused write', () => {
  it('is reported once, naming the action, when a test key is refused', async () => {
    vi.mocked(getEndpointSecurity).mockResolvedValue({ mode: 'api-key', publicUrl: 'https://gw.example/tools' } as never);
    vi.mocked(createEndpointTestKey).mockRejectedValue(refusal('ipaas:endpoint:test'));
    await page(<McpEnvCardBody {...mcpCard} />, DEVELOPER);
    await flush();
    expect(refusalMessages()).toEqual(["Your role can't create test keys."]);
  });
});
