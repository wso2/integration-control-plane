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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrganizationSwitchState } from '../auth';
import { renderWithScopes } from '../test/renderWithScopes';
import OrganizationSwitcher from './OrganizationSwitcher';

const ACME = { id: 'acme-id', handle: 'acme', name: 'Acme Corp' };
const GLOBEX = { id: 'globex-id', handle: 'globex', name: 'Globex' };

const auth = vi.hoisted(() => ({ canSwitch: true, sessionOrg: 'acme', list: {} as OrganizationSwitchState }));

vi.mock('../auth', () => ({
  useAuth: () => ({ orgHandle: auth.sessionOrg }),
  canSwitchOrganization: () => auth.canSwitch,
  OrganizationList: ({ children }: { children: (state: OrganizationSwitchState) => unknown }) => children(auth.list),
}));

// A dirty form's leave guard: whether the user chooses to leave, and what it was asked to run.
const leaveGuard = vi.hoisted(() => ({ leave: true, asked: 0 }));
vi.mock('../contexts/UnsavedChangesContext', () => ({
  useLeaveGuard: () => (proceed: () => void) => {
    leaveGuard.asked++;
    if (leaveGuard.leave) proceed();
  },
}));

const onSwitch = vi.fn();
const onHome = vi.fn();
let unmount = () => {};

function listing(patch: Partial<OrganizationSwitchState> = {}): void {
  auth.list = { organizationUnits: [ACME, GLOBEX], error: null, switchingId: null, onSwitch, ...patch };
}

async function render(org = 'acme'): Promise<HTMLElement> {
  const rendered = await renderWithScopes(<OrganizationSwitcher org={org} name="Acme" onHome={onHome} switchUrl={(handle) => `/organizations/${handle}/logs`} />, []);
  unmount = rendered.unmount;
  return rendered.container;
}

const combobox = (container: HTMLElement): HTMLElement => container.querySelector('[role="combobox"]') as HTMLElement;
const options = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('[role="option"]')];

function open(container: HTMLElement): void {
  act(() => {
    combobox(container).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
  });
}

function pick(name: string): void {
  const option = options().find((o) => o.textContent?.includes(name));
  act(() => option?.click());
}

beforeEach(() => {
  vi.resetAllMocks();
  auth.canSwitch = true;
  auth.sessionOrg = 'acme';
  leaveGuard.leave = true;
  leaveGuard.asked = 0;
  listing();
});

afterEach(() => unmount());

describe('OrganizationSwitcher', () => {
  it('lists the user’s organizations and switches to the one picked', async () => {
    const container = await render();
    expect(combobox(container).textContent).toContain('Acme');

    open(container);
    expect(options().map((o) => o.textContent)).toEqual(['Acme Corpacme', 'Globexglobex']);
    pick('Globex');

    expect(onSwitch).toHaveBeenCalledWith(GLOBEX, ACME.id, '/organizations/globex/logs');
    expect(onHome).not.toHaveBeenCalled();
  });

  it('asks about unsaved changes before switching, and switches nothing when the user stays', async () => {
    leaveGuard.leave = false;
    const container = await render();
    open(container);
    pick('Globex');

    expect(leaveGuard.asked).toBe(1);
    expect(onSwitch).not.toHaveBeenCalled();
  });

  it('shows a retry’s failure even when it reads the same as the one dismissed', async () => {
    listing({ error: "Couldn't switch to Globex. Try again." });
    const container = await render();
    expect(document.body.textContent).toContain("Couldn't switch to Globex. Try again.");

    // Opening the menu dismisses the message; picking again starts a new attempt.
    open(container);
    expect(document.querySelector('[role="tooltip"]')?.textContent ?? '').not.toContain('Try again');
    pick('Globex');

    expect(onSwitch).toHaveBeenCalledWith(GLOBEX, ACME.id, '/organizations/globex/logs');
    expect(document.querySelector('[role="tooltip"]')?.textContent).toContain("Couldn't switch to Globex. Try again.");
  });

  it('opens the current organization’s overview when it is picked, without switching', async () => {
    const container = await render();
    open(container);
    pick('Acme Corp');

    expect(onHome).toHaveBeenCalled();
    expect(onSwitch).not.toHaveBeenCalled();
  });

  it('shows the chosen organization, disabled, while the switch runs', async () => {
    listing({ switchingId: GLOBEX.id });
    const container = await render();

    expect(combobox(container).textContent).toContain('Globex');
    expect(combobox(container).getAttribute('aria-disabled')).toBe('true');
  });

  it('shows why a switch failed', async () => {
    listing({ error: 'Could not switch to Globex.' });
    await render();

    expect(document.body.textContent).toContain('Could not switch to Globex.');
  });

  it.each([
    ['the switcher is off', () => (auth.canSwitch = false)],
    ['the user has one organization', () => listing({ organizationUnits: [ACME] })],
    ['the list has not arrived', () => listing({ organizationUnits: [] })],
  ])('keeps the organization card that opens the overview when %s', async (_, arrange) => {
    arrange();
    const container = await render();

    expect(container.querySelector('[role="button"]')).not.toBeNull();
    act(() => (container.querySelector('[role="button"]') as HTMLElement).click());
    expect(onHome).toHaveBeenCalled();
    open(container);
    expect(options()).toEqual([]);
  });

  it('makes the card one labelled control: one tab stop, its look hidden from assistive technology', async () => {
    auth.canSwitch = false;
    const container = await render();

    const card = container.querySelector<HTMLElement>('[role="button"]');
    expect(card?.getAttribute('aria-label')).toBe('Open Acme overview');
    expect([...container.querySelectorAll('[tabindex]')].filter((el) => el.getAttribute('tabindex') !== '-1')).toEqual([card]);
    expect(combobox(container).getAttribute('tabindex')).toBe('-1');
    expect(combobox(container).closest('[aria-hidden="true"]')).not.toBeNull();

    for (const key of ['Enter', ' ']) {
      act(() => {
        card?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      });
    }
    expect(onHome).toHaveBeenCalledTimes(2);
  });

  // A link to another organization shows "no access"; the session can only switch from its own.
  it('offers no switch on another organization’s URL', async () => {
    const container = await render('initech');
    open(container);
    expect(options()).toEqual([]);
  });
});
