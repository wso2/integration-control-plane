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
import type { OrganizationSwitchState } from './OrganizationList';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ACME = { id: 'acme-id', handle: 'acme', name: 'Acme' };
const GLOBEX = { id: 'globex-id', handle: 'globex', name: 'Globex' };
const GLOBEX_LOGS = '/organizations/globex/logs';

const sdk = vi.hoisted(() => ({ props: {} as Record<string, unknown> }));

vi.mock('@thunderid/react', () => ({
  OrganizationUnitSwitcher: (props: { children: (state: unknown) => unknown } & Record<string, unknown>) => {
    sdk.props = props;
    return props.children({ organizationUnits: [ACME, GLOBEX], current: null, currentName: null, error: null, isLoading: false, limit: 50, offset: 0, onPageChange: () => {}, onSwitch: () => {}, switchingId: null, totalResults: 2 });
  },
}));

const orgSwitch = vi.hoisted(() => ({ switchOrganization: vi.fn(), loadConsolePage: vi.fn() }));
vi.mock('./orgSwitch', async (original) => ({ ...(await original<typeof import('./orgSwitch')>()), ...orgSwitch }));

const { OrganizationList } = await import('./OrganizationList');
const { OrganizationSwitchError } = await import('./orgSwitch');

let root: Root;
let state: OrganizationSwitchState;

async function render(): Promise<void> {
  await act(async () => {
    root.render(
      <OrganizationList>
        {(s) => {
          state = s;
          return null;
        }}
      </OrganizationList>,
    );
  });
}

async function pick(unit = GLOBEX): Promise<void> {
  await act(async () => {
    state.onSwitch(unit, ACME.id, GLOBEX_LOGS);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  root = createRoot(document.createElement('div'));
});

afterEach(() => {
  act(() => root.unmount());
});

describe('OrganizationList', () => {
  it('lists the current organization’s siblings and takes picks over from the SDK', async () => {
    await render();
    expect(sdk.props).toMatchObject({ scope: 'siblings', limit: 50 });
    expect(sdk.props.onSelect).toBeTypeOf('function');
    expect(state.organizationUnits).toEqual([ACME, GLOBEX]);
  });

  it('switches every session, then reloads the console, staying disabled until it does', async () => {
    orgSwitch.switchOrganization.mockResolvedValue(undefined);
    await render();
    await pick();

    expect(orgSwitch.switchOrganization).toHaveBeenCalledWith(GLOBEX.id, ACME.id);
    expect(orgSwitch.loadConsolePage).toHaveBeenCalledWith(GLOBEX_LOGS);
    expect(state.switchingId).toBe(GLOBEX.id);
  });

  // The header runs the switch through useLeaveGuard, which keeps leaving allowed until this settles.
  it('never settles a successful switch: the page is leaving', async () => {
    orgSwitch.switchOrganization.mockResolvedValue(undefined);
    await render();
    const settled = vi.fn();

    await act(async () => {
      void state.onSwitch(GLOBEX, ACME.id, GLOBEX_LOGS).then(settled, settled);
    });

    expect(orgSwitch.loadConsolePage).toHaveBeenCalled();
    expect(settled).not.toHaveBeenCalled();
  });

  it('settles a failed switch, so a leave guard comes back', async () => {
    orgSwitch.switchOrganization.mockRejectedValue(new OrganizationSwitchError('failed'));
    await render();

    await act(async () => {
      await expect(state.onSwitch(GLOBEX, ACME.id, GLOBEX_LOGS)).resolves.toBeUndefined();
    });
  });

  it('ignores a second pick while a switch runs', async () => {
    orgSwitch.switchOrganization.mockReturnValue(new Promise(() => {}));
    await render();
    await pick();
    await pick(ACME);
    expect(orgSwitch.switchOrganization).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['forbidden', "You don't have access to Globex."],
    ['failed', "Couldn't switch to Globex. Try again."],
    ['incomplete', "Switching to Globex didn't finish. Pick Globex again to complete it."],
  ] as const)('explains a %s switch and lets the user pick again', async (reason, message) => {
    orgSwitch.switchOrganization.mockRejectedValue(new OrganizationSwitchError(reason));
    await render();
    await pick();

    expect(state.error).toBe(message);
    expect(state.switchingId).toBeNull();
    expect(orgSwitch.loadConsolePage).not.toHaveBeenCalled();
  });
});
