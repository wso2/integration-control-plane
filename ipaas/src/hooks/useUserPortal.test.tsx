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

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../api/userPortal';
import type { UserPortalPublications, UserPortalPublishability } from '../types/userPortal';
import { useUserPortalPublications, useUserPortalPublishability } from './useUserPortal';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../api/userPortal', () => ({ fetchUserPortalPublishability: vi.fn(), fetchUserPortalPublications: vi.fn() }));
const publishability = vi.mocked(api.fetchUserPortalPublishability);
const publications = vi.mocked(api.fetchUserPortalPublications);

const report = (patch: Partial<UserPortalPublishability>): UserPortalPublishability => ({
  environment: 'production',
  published: false,
  publishable: true,
  reasons: [],
  redeploys: true,
  publishing: false,
  unpublishing: false,
  rejectedScopes: [],
  ...patch,
});
const listed = (unpublishing: string[]): UserPortalPublications => ({ environments: [], unpublishing, notGivenBack: [] });

let root: Root;
let container: HTMLDivElement;
let client: QueryClient;
beforeEach(() => {
  vi.clearAllMocks();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

function Reads() {
  useUserPortalPublishability('orders', 'production');
  useUserPortalPublications('orders');
  return null;
}

const settle = () => act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
const securityRereads = (invalidate: { mock: { calls: unknown[][] } }) => invalidate.mock.calls.filter(([filters]) => JSON.stringify(filters) === JSON.stringify({ queryKey: ['endpoint-security', 'orders', 'production'] })).length;

// A view of the endpoint's security that never saw the run is read again too, since it is done where the reads land.
describe("the User Portal reads, when a workflow's switch ends", () => {
  it('read its endpoint security again once, wherever it is shown', async () => {
    publishability.mockResolvedValue(report({ unpublishing: true }));
    publications.mockResolvedValue(listed(['production']));
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <Reads />
        </QueryClientProvider>,
      ),
    );
    await settle();
    expect(securityRereads(invalidate)).toBe(0);

    publishability.mockResolvedValue(report({}));
    publications.mockResolvedValue(listed([]));
    await act(async () => {
      await client.refetchQueries({ queryKey: ['userPortal'] });
    });
    await settle();
    expect(securityRereads(invalidate)).toBe(2);

    // A re-read of the same outcome asks for nothing more.
    await act(async () => {
      await client.refetchQueries({ queryKey: ['userPortal'] });
    });
    await settle();
    expect(securityRereads(invalidate)).toBe(2);
  });
});
