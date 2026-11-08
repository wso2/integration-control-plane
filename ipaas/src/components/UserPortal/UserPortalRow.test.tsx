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
import UserPortalRow from './UserPortalRow';
import { BffError } from '../../api/_client';
import * as api from '../../api/userPortal';
import { button, flush, reasonFor, renderWithScopes } from '../../test/renderWithScopes';
import { DEVELOPER, VIEWER } from '../../test/roles';
import type { UserPortalPublishability } from '../../types/userPortal';

vi.mock('../../api/userPortal', () => ({
  fetchUserPortalPublishability: vi.fn(),
  publishToUserPortal: vi.fn(),
  unpublishFromUserPortal: vi.fn(),
}));

const publishability = vi.mocked(api.fetchUserPortalPublishability);
const publish = vi.mocked(api.publishToUserPortal);

const refused: UserPortalPublishability = {
  environment: 'production',
  published: false,
  publishable: false,
  reasons: [
    { code: 'USER_PORTAL_PIPELINE', message: 'only integrations of projects on the "default" deployment pipeline can be published to the User Portal' },
    { code: 'USER_PORTAL_NOT_ENABLED', message: 'the user portal is not enabled in this environment' },
  ],
};

let unmount = () => {};
afterEach(() => unmount());
beforeEach(() => vi.clearAllMocks());

async function row(scopes: string[]) {
  const r = await renderWithScopes(
    <MemoryRouter>
      <UserPortalRow orgHandler="acme" componentId="orders" environment="production" envName="Production" />
    </MemoryRouter>,
    scopes,
  );
  unmount = r.unmount;
  await flush();
  return r.container;
}

describe("the deploy card's User Portal row", () => {
  it('blocks a publish the rules refuse, saying every reason', async () => {
    publishability.mockResolvedValue(refused);
    const container = await row(DEVELOPER);
    expect(button(container, 'Publish')?.disabled).toBe(true);
    for (const reason of refused.reasons) expect(container.textContent).toContain(reason.message);
    // The portal itself is the fix for one of them, and that one links to it.
    const link = container.querySelector('a');
    expect(link?.textContent).toBe('Enable it');
    expect(link?.getAttribute('href')).toBe('/organizations/acme/settings/user-portal');
    expect(publish).not.toHaveBeenCalled();
  });

  it('publishes when the rules pass, and reports scopes the portal could not take', async () => {
    publishability.mockResolvedValue({ environment: 'production', published: false, publishable: true, reasons: [] });
    publish.mockResolvedValue({ environment: 'production', published: true, rejectedScopes: ['bad scope'] });
    const container = await row(DEVELOPER);
    const b = button(container, 'Publish');
    expect(b?.disabled).toBe(false);
    await act(async () => b?.click());
    await flush();
    expect(publish).toHaveBeenCalledWith('orders', 'production');
    expect(container.textContent).toContain('bad scope');
  });

  it("tells a role that can't deploy why it can't publish", async () => {
    publishability.mockResolvedValue({ environment: 'production', published: false, publishable: true, reasons: [] });
    const container = await row(VIEWER);
    const b = button(container, 'Publish');
    expect(b?.disabled).toBe(true);
    expect(reasonFor(b)).toBe("Your role can't publish integrations to the User Portal.");
  });

  it('offers Unpublish for a published integration, with no reasons', async () => {
    publishability.mockResolvedValue({ ...refused, published: true });
    const container = await row(DEVELOPER);
    expect(container.textContent).toContain('Published');
    expect(button(container, 'Unpublish')?.disabled).toBe(false);
    expect(container.textContent).not.toContain(refused.reasons[0].message);
  });

  it('shows nothing where the BFF serves no User Portal', async () => {
    publishability.mockRejectedValue(new BffError(404, '404 page not found'));
    const container = await row(DEVELOPER);
    expect(container.textContent).toBe('');
  });
});
