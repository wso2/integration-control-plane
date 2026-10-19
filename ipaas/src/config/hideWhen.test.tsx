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

import { act, type FC } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { hideWhen } from './hideWhen';
import { orgHomeUrl, projectHomeUrl } from '../paths';

// React only flushes act() updates when told it runs in a test environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const Page: FC = () => <p>page</p>;
const Landed: FC = () => <p>{useLocation().pathname}</p>;

let root: Root | undefined;
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
});

function renderAt(path: string, pattern: string, hidden: boolean): HTMLElement {
  const container = document.createElement('div');
  const Hideable = hideWhen(Page, () => hidden);
  root = createRoot(container);
  act(() =>
    root!.render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={pattern} element={<Hideable />} />
          <Route path="*" element={<Landed />} />
        </Routes>
      </MemoryRouter>,
    ),
  );
  return container;
}

describe('hideWhen', () => {
  it('renders the page while it is not hidden', () => {
    expect(renderAt('/organizations/acme/environments', '/organizations/:orgHandler/environments', false).textContent).toBe('page');
  });

  it('sends a hidden org page to the org home', () => {
    expect(renderAt('/organizations/acme/environments', '/organizations/:orgHandler/environments', true).textContent).toBe(orgHomeUrl('acme'));
  });

  it('sends a hidden project page to the project home', () => {
    expect(renderAt('/organizations/acme/projects/shop/devops/environments', '/organizations/:orgHandler/projects/:projectHandler/devops/environments', true).textContent).toBe(projectHomeUrl('acme', 'shop'));
  });

  it('keeps the wrapped page’s preload for the navigation preloader', () => {
    const preload = vi.fn(async () => ({}));
    const Lazy: FC & { preload: typeof preload } = Object.assign(() => null, { preload });
    expect((hideWhen(Lazy, () => false) as FC & { preload?: unknown }).preload).toBe(preload);
  });
});
