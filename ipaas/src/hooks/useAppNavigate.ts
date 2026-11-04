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

import { useCallback } from 'react';
import { useNavigate, type NavigateFunction, type NavigateOptions, type To } from 'react-router';
import { beginNavigation } from '../utils/navigationPending';
import { collectPreloads, preloadRoute } from '../config/preloadRoute';
import { useLeaveGuard } from '../contexts/UnsavedChangesContext';

/**
 * `useNavigate` that fetches the destination's code before changing the URL, so
 * the address bar and the page move together instead of the URL jumping ahead of
 * a Suspense fallback.
 *
 * Signature-compatible with `useNavigate` on purpose: a page swaps the hook and
 * every existing call site keeps working. Navigations that cannot be preloaded —
 * history deltas, non-string targets, already-loaded routes, routes whose
 * `preload` is unreachable — pass straight through unchanged.
 *
 * While a form registered with `useUnsavedChanges` is dirty, the navigation waits
 * for the user to confirm leaving.
 */
/**
 * Supersession token. Module-level, not a ref: navigation is app-wide, so a
 * sidebar click must invalidate a preload started by a page — different hook
 * instances, same navigation.
 */
let latestNavigation = 0;

export function useAppNavigate(): NavigateFunction {
  const navigate = useNavigate();
  const guardNavigation = useLeaveGuard();

  const go = useCallback(
    (to: To | number, options?: NavigateOptions) => {
      const token = (latestNavigation += 1);
      // `navigate(-1)` and friends move through history; there is nothing to fetch.
      if (typeof to === 'number') {
        navigate(to);
        return;
      }

      const path = typeof to === 'string' ? to : to.pathname;
      const preloaders = path ? collectPreloads(path) : [];
      if (preloaders.length === 0) {
        navigate(to, options);
        return;
      }

      const end = beginNavigation();
      void preloadRoute(preloaders).finally(() => {
        // Always release the indicator, even when superseded, or the count leaks.
        end();
        if (token !== latestNavigation) return;
        navigate(to, options);
      });
    },
    [navigate],
  );

  return useCallback((to: To | number, options?: NavigateOptions) => guardNavigation(() => go(to, options)), [go, guardNavigation]) as NavigateFunction;
}
