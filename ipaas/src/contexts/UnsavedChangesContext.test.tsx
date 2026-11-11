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
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UnsavedChangesProvider, useLeaveGuard, useUnsavedChanges } from './UnsavedChangesContext';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let container: HTMLDivElement;
let guard: ReturnType<typeof useLeaveGuard>;

function DirtyForm() {
  useUnsavedChanges(true);
  guard = useLeaveGuard();
  return null;
}

/** Whether a reload now would get the browser's leave prompt. */
function reloadIsBlocked(): boolean {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

const button = (name: string): HTMLButtonElement | undefined => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === name);

function ask(proceed: () => void | Promise<unknown>): void {
  act(() => guard(proceed));
}

function answer(name: 'Leave page' | 'Stay on page'): void {
  act(() => button(name)?.click());
}

beforeEach(async () => {
  vi.useFakeTimers();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <MemoryRouter>
        <UnsavedChangesProvider>
          <DirtyForm />
        </UnsavedChangesProvider>
      </MemoryRouter>,
    );
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe('useLeaveGuard with a dirty form', () => {
  it('runs nothing when the user stays', () => {
    const proceed = vi.fn();
    ask(proceed);
    answer('Stay on page');

    expect(proceed).not.toHaveBeenCalled();
    expect(reloadIsBlocked()).toBe(true);
  });

  it('lets a plain navigation through for a moment, then guards again', () => {
    const proceed = vi.fn();
    ask(proceed);
    answer('Leave page');

    expect(proceed).toHaveBeenCalled();
    expect(reloadIsBlocked()).toBe(false);
    act(() => vi.advanceTimersByTime(1_500));
    expect(reloadIsBlocked()).toBe(true);
  });

  // An organization switch makes two gateway calls before it reloads.
  it('keeps leaving allowed while a navigation that returns a promise is still under way', () => {
    ask(() => new Promise(() => {}));
    answer('Leave page');

    act(() => vi.advanceTimersByTime(60_000));
    expect(reloadIsBlocked()).toBe(false);
  });

  it.each([
    ['resolves', () => Promise.resolve()],
    ['rejects', () => Promise.reject(new Error('switch failed'))],
  ])('guards again once that navigation %s without leaving', async (_, proceed) => {
    ask(proceed);
    answer('Leave page');
    await act(async () => {});

    expect(reloadIsBlocked()).toBe(true);
  });
});
