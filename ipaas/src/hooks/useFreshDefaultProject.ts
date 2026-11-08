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

import { useEffect } from 'react';
import { useLocation } from 'react-router';

/**
 * True only on the single navigation that immediately follows provisioning a fresh org's default
 * project during onboarding (see OrgHome.tsx, which sets `state: { freshDefaultProject: true }` on
 * that `navigate` call). This is a one-shot signal, not a recomputed "is this project still empty"
 * check — the project overview header (Project.tsx) hides on it for that first landing only. The
 * moment the user navigates anywhere else and comes back — even if the project is still empty —
 * this is false again and the header shows normally, so it never vanishes and reappears on repeat
 * visits, which would read as broken chrome rather than a deliberate first-run empty state.
 */
export function useFreshDefaultProject(): boolean {
  const { state } = useLocation();
  const isFresh = (state as { freshDefaultProject?: boolean } | null)?.freshDefaultProject === true;

  useEffect(() => {
    if (!isFresh) return;
    // Consume the flag directly on the browser's history entry rather than via react-router's
    // navigate(), which would trigger a reactive re-render here and flip `isFresh` back to false
    // immediately — flashing the header back on right after hiding it. A plain
    // history.replaceState only affects what a future reload of this exact URL sees; it doesn't
    // notify react-router's own location listeners, so this render's already-returned value is
    // unaffected. Without this, `history.state` persists across a plain reload of the same URL,
    // so refreshing right after onboarding would keep re-triggering the hidden chrome indefinitely.
    const { freshDefaultProject: _freshDefaultProject, ...rest } = (state ?? {}) as Record<string, unknown>;
    window.history.replaceState(rest, '', window.location.href);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFresh]);

  return isFresh;
}
