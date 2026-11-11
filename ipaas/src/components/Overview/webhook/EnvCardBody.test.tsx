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

// A workflow program exports its management API beside its own endpoints, in whichever order the BFF lists them.
const listed = vi.hoisted(() => ({ data: [] as { id: string; displayName: string }[] }));
vi.mock('../../../hooks/useDeployments', () => ({ useEnvEndpoints: () => listed }));
const PROCESS_ORDER = { id: 'processorder', displayName: 'Processorder' };
const MANAGEMENT = { id: 'workflow-ma-cf1', displayName: 'Workflow Management API' };
vi.mock('../_shared/EndpointUrlsPanel', () => ({
  default: ({ endpoints }: { endpoints: { displayName: string }[] }) => (
    <ul>
      {endpoints.map((endpoint) => (
        <li key={endpoint.displayName}>{endpoint.displayName}</li>
      ))}
    </ul>
  ),
}));
vi.mock('../integration-as-api/ServiceInsights', () => ({ default: () => null }));

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

async function listedEndpoints(displayType: string, endpoints = [PROCESS_ORDER, MANAGEMENT]): Promise<string[]> {
  listed.data = endpoints;
  const props = {
    component: { id: 'orderprocessor', displayType, componentSubType: null },
    env: { id: 'development', name: 'Development' },
    versionId: '',
    releaseId: 'release-1',
    hasDeployment: true,
    loadingDeployment: false,
    deploymentStatusV2: 'ACTIVE',
  } as unknown as EnvCardBodyProps;
  await act(async () => root.render(<EnvCardBody {...props} />));
  return Array.from(container.querySelectorAll('li')).map((item) => item.textContent ?? '');
}

describe('webhook EnvCardBody endpoints', () => {
  // A team may share a workflow's Management API through the Developer Portal, or call it from its own applications.
  it('lists a management API with the integration’s own endpoints', async () => {
    expect(await listedEndpoints('ballerinaWorkflow')).toEqual(['Processorder', 'Workflow Management API']);
  });

  it('lists the management API after the integration’s own endpoints, so the card opens on those', async () => {
    expect(await listedEndpoints('ballerinaWorkflow', [MANAGEMENT, PROCESS_ORDER])).toEqual(['Processorder', 'Workflow Management API']);
  });
});
