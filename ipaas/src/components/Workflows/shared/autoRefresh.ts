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

import { local } from '../../../utils/storage';

/**
 * Whether the workflow views poll: per viewer, persisted in
 * the browser, on unless switched off. It governs refreshing what is already on screen (a manual
 * refresh always works), and every workflow poll reads it through `whenAutoRefresh`, so switching
 * it off stops them all at their next tick without re-rendering anything.
 */

/** Stored through `utils/storage`, which prefixes it for this console. */
export const AUTO_REFRESH_KEY = 'wf.autoRefresh';

export function autoRefreshEnabled(): boolean {
  try {
    return local.get(AUTO_REFRESH_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setAutoRefreshEnabled(on: boolean): void {
  try {
    local.set(AUTO_REFRESH_KEY, on ? 'on' : 'off');
  } catch {
    // Storage unavailable: the toggle still works for this page, it just does not persist.
  }
}

/**
 * A poll interval that yields to the viewer's choice. A hidden tab needs no check here: React Query
 * skips interval ticks while the window is unfocused, and an interval this returned as off would
 * stay off until the component re-rendered.
 */
export function whenAutoRefresh(intervalMs: number | false): number | false {
  if (!intervalMs || !autoRefreshEnabled()) {
    return false;
  }
  return intervalMs;
}

/** The workflow reads to refetch when auto-refresh comes back on: everything under `wf`. */
export function isWorkflowDataQuery(queryKey: readonly unknown[]): boolean {
  return queryKey[0] === 'wf';
}
