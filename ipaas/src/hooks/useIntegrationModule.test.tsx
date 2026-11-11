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
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { useIntegrationModule } from './useIntegrationModule';
import type { IntegrationModule, IntegrationType } from '../types/integration';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function load(type: IntegrationType): Promise<IntegrationModule | null> {
  let result: IntegrationModule | null = null;
  function Probe() {
    result = useIntegrationModule(type);
    return null;
  }
  const root = createRoot(document.createElement('div'));
  await act(async () => root.render(<Probe />));
  await vi.waitFor(() => expect(result).not.toBeNull(), { timeout: 15000 });
  act(() => root.unmount());
  return result;
}

describe('the User Portal env card action', { timeout: 20000 }, () => {
  it('is a footer action for an automation', async () => {
    expect((await load('automation'))?.EnvCardSharedAction).toBeDefined();
  });

  it('is a footer action for a workflow', async () => {
    expect((await load('workflow'))?.EnvCardSharedAction).toBeDefined();
  });

  it('is not added to integration-as-API, which the portal does not show', async () => {
    expect((await load('integration-as-api'))?.EnvCardSharedAction).toBeUndefined();
  });
});
