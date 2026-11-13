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

/**
 * Where this tab's visit came from, for session.start and onboarding.first-session. By the time a session starts,
 * `document.referrer` names the identity provider or the gateway that just signed the user in, so the source is
 * recorded on the tab's first page load, before any sign-in redirect, and kept for the tab in sessionStorage, which
 * survives the redirect.
 */

import { basePath } from '../../utils/basePath';
import { REFERRER_SOURCES, referrerSource, type ReferrerContext, type ReferrerSource } from '../../utils/referrer';
import { session } from '../../utils/storage';

const KEY = 'console_entry_referrer';

function hostOf(url: string | undefined): string | undefined {
  try {
    return url ? new URL(url, window.location.origin).hostname.toLowerCase() : undefined;
  } catch {
    return undefined;
  }
}

function referrerContext(): ReferrerContext {
  const { authBaseUrl, authBffContext, authBffSignInUrl } = window.API_CONFIG;
  const authPath = (() => {
    try {
      const url = new URL(authBaseUrl, window.location.origin);
      return url.origin === window.location.origin ? url.pathname : '';
    } catch {
      return '';
    }
  })();
  return {
    origin: window.location.origin,
    consolePath: basePath,
    signInHosts: [hostOf(authBaseUrl)].filter((host): host is string => !!host),
    signInPaths: [authBffContext ?? '', (authBffSignInUrl ?? '').split(/[?#]/)[0], authPath].filter((path) => path !== ''),
  };
}

/** Records where the tab came from, once per tab. Call after the runtime config loads and before the app renders. */
export function rememberEntryReferrer(): void {
  try {
    if (session.get(KEY) !== null) return;
    const source = referrerSource(document.referrer, referrerContext());
    if (source) session.set(KEY, source);
  } catch {
    // Blocked storage: the session reports `unknown`.
  }
}

/** The tab's recorded source, or `unknown` when its first load came straight from signing in. */
export function entryReferrer(): ReferrerSource {
  try {
    const stored = session.get(KEY);
    return REFERRER_SOURCES.find((source) => source === stored) ?? 'unknown';
  } catch {
    return 'unknown';
  }
}
