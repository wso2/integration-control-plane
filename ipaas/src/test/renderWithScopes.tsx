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
import { act, useLayoutEffect, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { AccessControlProvider, useAccessControl } from '../contexts/AccessControlContext';

// eslint-disable-next-line react-refresh/only-export-components -- a test helper, never hot-reloaded
function Grant({ scopes, children }: { scopes: string[]; children: ReactNode }) {
  const { setOrgPermissions } = useAccessControl();
  useLayoutEffect(() => setOrgPermissions(scopes), [scopes, setOrgPermissions]);
  return <>{children}</>;
}

/** Renders `ui` for a role holding `scopes`. Unmount when done. */
export async function renderWithScopes(ui: ReactNode, scopes: string[]): Promise<{ container: HTMLElement; unmount: () => void }> {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <AccessControlProvider>
          <Grant scopes={scopes}>{ui}</Grant>
        </AccessControlProvider>
      </QueryClientProvider>,
    ),
  );
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

/** The button whose text or accessible name is `name`. */
export const button = (container: HTMLElement, name: string): HTMLButtonElement | undefined => [...container.ownerDocument.querySelectorAll('button')].find((b) => b.textContent?.trim() === name || b.getAttribute('aria-label') === name);

/** The reason a tooltip gives for a disabled control: the aria-label MUI puts on its wrapper. */
export const reasonFor = (b: HTMLElement | undefined): string | null => b?.closest('[aria-label]:not(button)')?.getAttribute('aria-label') ?? null;

/** Lets pending queries settle and re-render. */
export const flush = (): Promise<void> => act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
