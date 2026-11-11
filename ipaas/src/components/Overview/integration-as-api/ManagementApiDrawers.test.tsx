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
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../../api/consumers';
import { UnsavedChangesProvider } from '../../../contexts/UnsavedChangesContext';
import { button, flush, renderWithScopes } from '../../../test/renderWithScopes';
import { DEVELOPER, VIEWER } from '../../../test/roles';
import type { EndpointOption } from '../../../types/consumers';
import ApiSecurityDrawer from './ApiSecurityDrawer';
import ApiSettingsDrawer from './ApiSettingsDrawer';

vi.mock('../../../api/consumers', () => ({
  getEndpointSecurity: vi.fn(),
  setEndpointSecurity: vi.fn(),
  getEndpointPolicies: vi.fn(),
  setEndpointPolicies: vi.fn(),
}));

const getSecurity = vi.mocked(api.getEndpointSecurity);
const setSecurity = vi.mocked(api.setEndpointSecurity);
const getPolicies = vi.mocked(api.getEndpointPolicies);
const setPolicies = vi.mocked(api.setEndpointPolicies);

// A workflow program exports its Management API beside its own endpoints. The same title on a service's endpoint is no
// Management API, which its option says by leaving the flag off.
const ENDPOINTS: EndpointOption[] = [
  { name: 'processorder', displayName: 'Order Processor API' },
  { name: 'workflow-ma-cf1', displayName: 'Workflow Management API', managementApi: true },
  { name: 'lookalike', displayName: 'Workflow Management API' },
];

const SAVED_CORS = { enabled: true, allowOrigins: ['*'], allowMethods: [], allowHeaders: [], allowCredentials: true };

let unmount = () => {};
beforeEach(() => {
  vi.clearAllMocks();
  getSecurity.mockResolvedValue({ mode: 'api-key', apiKey: { header: 'X-API-Key' }, editable: true });
  setSecurity.mockImplementation(async (_ref, cfg) => cfg);
  getPolicies.mockResolvedValue({ cors: SAVED_CORS, rateLimit: { level: 'api', requestCount: 10, timeUnit: 'MINUTE' }, platformOrigins: ['*'], editable: true });
  setPolicies.mockImplementation(async (_ref, cfg) => cfg);
});
afterEach(() => unmount());

async function render(drawer: 'security' | 'settings', endpoint: string, scopes = DEVELOPER) {
  const props = { open: true, onClose: () => {}, componentName: 'orders', envName: 'development', deploymentTrackId: 'track-1', endpoints: ENDPOINTS, activeEndpointName: endpoint };
  const r = await renderWithScopes(
    <MemoryRouter>
      <UnsavedChangesProvider>{drawer === 'security' ? <ApiSecurityDrawer {...props} /> : <ApiSettingsDrawer {...props} />}</UnsavedChangesProvider>
    </MemoryRouter>,
    scopes,
  );
  unmount = r.unmount;
  await flush();
  return r.container.ownerDocument.body;
}

// The drawer is a dialog too; the confirmation is the one that asks about the Management API.
const dialog = (page: HTMLElement) => [...page.querySelectorAll('[role="dialog"]')].find((d) => d.textContent?.includes('Change the Workflow Management API')) ?? null;
const dialogButton = (page: HTMLElement, name: string) => [...(dialog(page)?.querySelectorAll('button') ?? [])].find((b) => b.textContent === name);

const type = async (input: HTMLInputElement | null | undefined, value: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
    input?.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const apiKeyHeader = (page: HTMLElement) => page.querySelector<HTMLInputElement>('input[aria-label="API key header"]');
const maxRequests = (page: HTMLElement) => [...page.querySelectorAll('label')].find((l) => l.textContent?.startsWith('Max requests'))?.parentElement?.querySelector('input');
const enableCors = (page: HTMLElement) => [...page.querySelectorAll('label')].find((l) => l.textContent === 'Enable CORS')?.querySelector('input');

describe("a workflow's Management API in the security drawer", () => {
  it('says what its security keeps working, and applies a change only once confirmed', async () => {
    const page = await render('security', 'workflow-ma-cf1');
    expect(page.textContent).toContain('the console takes only API key security, and the User Portal only OAuth');

    await type(apiKeyHeader(page), 'X-Workflow-Key');
    await act(async () => button(page, 'Apply')?.click());
    expect(dialog(page)?.textContent).toContain('Change the Workflow Management API’s security?');
    expect(setSecurity).not.toHaveBeenCalled();

    await act(async () => dialogButton(page, 'Cancel')?.click());
    expect(dialog(page)).toBeNull();
    expect(setSecurity).not.toHaveBeenCalled();

    await act(async () => button(page, 'Apply')?.click());
    await act(async () => dialogButton(page, 'Apply')?.click());
    await flush();
    expect(setSecurity).toHaveBeenCalledWith(expect.objectContaining({ endpointName: 'workflow-ma-cf1' }), expect.objectContaining({ mode: 'api-key' }));
  });

  it('does not ask when nothing changed', async () => {
    const page = await render('security', 'workflow-ma-cf1');
    await act(async () => button(page, 'Apply')?.click());
    await flush();
    expect(dialog(page)).toBeNull();
    expect(setSecurity).toHaveBeenCalled();
  });

  it('cannot apply once the scheme is cleared, since ipaas-service refuses an open Management API', async () => {
    const page = await render('security', 'workflow-ma-cf1');
    await act(async () => page.querySelector<HTMLInputElement>('input[type="radio"][value="api-key"], input[type="radio"]:checked')?.click());
    expect(button(page, 'Apply')?.disabled).toBe(true);
  });

  it('says nothing to a role that cannot change it', async () => {
    const page = await render('security', 'workflow-ma-cf1', VIEWER);
    expect(page.textContent).not.toContain('Changing its security can stop them working');
  });

  it('treats an endpoint of that title outside a workflow as any other', async () => {
    const page = await render('security', 'lookalike');
    expect(page.textContent).not.toContain('Workflow Management API’s');
    await type(apiKeyHeader(page), 'X-Other');
    await act(async () => button(page, 'Apply')?.click());
    await flush();
    expect(dialog(page)).toBeNull();
    expect(setSecurity).toHaveBeenCalledWith(expect.objectContaining({ endpointName: 'lookalike' }), expect.anything());
  });

  it('applies a change to any other endpoint without asking', async () => {
    const page = await render('security', 'processorder');
    expect(page.textContent).not.toContain('Workflow Management API’s');
    await act(async () => button(page, 'Apply')?.click());
    await flush();
    expect(dialog(page)).toBeNull();
    expect(setSecurity).toHaveBeenCalledWith(expect.objectContaining({ endpointName: 'processorder' }), expect.anything());
  });
});

describe("a workflow's Management API in the API settings drawer", () => {
  it('keeps its CORS as ipaas-service sets it, says what a rate limit reaches, and applies only once confirmed', async () => {
    const page = await render('settings', 'workflow-ma-cf1');
    expect(page.textContent).toContain('A rate limit applies to their calls too');
    expect(enableCors(page)?.disabled).toBe(true);

    await type(maxRequests(page), '20');
    await act(async () => button(page, 'Apply')?.click());
    expect(dialog(page)?.textContent).toContain('Change the Workflow Management API’s settings?');
    expect(setPolicies).not.toHaveBeenCalled();
    await act(async () => dialogButton(page, 'Apply')?.click());
    await flush();
    expect(setPolicies).toHaveBeenCalledWith(expect.objectContaining({ endpointName: 'workflow-ma-cf1' }), expect.objectContaining({ rateLimit: expect.objectContaining({ requestCount: 20 }) }));
  });

  it('sends the CORS it loaded as it came, whatever the editor would rebuild from it', async () => {
    const page = await render('settings', 'workflow-ma-cf1');
    await type(maxRequests(page), '20');
    await act(async () => button(page, 'Apply')?.click());
    await act(async () => dialogButton(page, 'Apply')?.click());
    await flush();
    expect(setPolicies).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ cors: SAVED_CORS }));
  });

  it('does not ask when nothing changed', async () => {
    const page = await render('settings', 'workflow-ma-cf1');
    await act(async () => button(page, 'Apply')?.click());
    await flush();
    expect(dialog(page)).toBeNull();
    expect(setPolicies).toHaveBeenCalled();
  });

  it('says nothing to a role that cannot change it', async () => {
    const page = await render('settings', 'workflow-ma-cf1', VIEWER);
    expect(page.textContent).not.toContain('A rate limit applies to their calls too');
  });

  it('leaves the CORS of an endpoint that is no Management API editable, and applies without asking', async () => {
    for (const name of ['processorder', 'lookalike']) {
      vi.clearAllMocks();
      const page = await render('settings', name);
      expect(enableCors(page)?.disabled).toBe(false);
      await type(maxRequests(page), '20');
      await act(async () => button(page, 'Apply')?.click());
      await flush();
      expect(dialog(page)).toBeNull();
      expect(setPolicies).toHaveBeenCalled();
      unmount();
    }
  });
});
