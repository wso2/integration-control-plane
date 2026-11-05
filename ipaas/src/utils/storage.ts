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

// Under a base path this console shares one origin with the other WSO2 Cloud consoles, and
// localStorage and sessionStorage are keyed by origin alone. Generic names like 'org_handle'
// would then be the same slot for every console, so this console's keys carry a prefix.
// The copilot constants in src/constants/copilot.ts already use it.
//
// This is hygiene, not isolation: same-origin pages can read every key either way.
const PREFIX = 'icp:';

/** The stored name for a key: 'org_handle' is kept as 'icp:org_handle'. */
export function prefixed(key: string): string {
  return `${PREFIX}${key}`;
}

/**
 * Keys an earlier, unprefixed build of this console wrote, whose value is worth keeping across
 * the upgrade: the active organization, the last project, and display preferences.
 *
 * Deliberately not here. On a shared origin an unprefixed slot may hold another console's value,
 * so nothing is adopted that would carry weight if it did:
 * - `github_oauth_state` and `skip-silent-sign-in` are one-shot flags, worthless after one load;
 * - `tos_accepted:*` records this console's own consent, which is not another console's to give;
 * - `redirect_url` becomes a navigation target on the next sign-in.
 */
const MIGRATABLE = [/^org_handle$/, /^last_project:/, /^persona:/, /^sidebar:collapsed$/, /^feature_preview$/];

interface ScopedStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

function scoped(storage: () => Storage, migratable: RegExp[]): ScopedStorage {
  return {
    // A migratable key with no prefixed value falls back to the unprefixed one and copies it
    // forward. The original is left alone: this console may not be the one that wrote it.
    get(key) {
      const store = storage();
      const current = store.getItem(prefixed(key));
      if (current !== null) return current;
      if (!migratable.some((pattern) => pattern.test(key))) return null;
      const legacy = store.getItem(key);
      if (legacy === null) return null;
      // The copy is an optimisation. A full store throws here, and these reads happen during
      // render, so a throw would take the page down for a value we already hold.
      try {
        store.setItem(prefixed(key), legacy);
      } catch {
        // keep the legacy value; the next read tries the copy again
      }
      return legacy;
    },
    set(key, value) {
      storage().setItem(prefixed(key), value);
    },
    // Only this console's own copy: the unprefixed slot is not ours to clear.
    remove(key) {
      storage().removeItem(prefixed(key));
    },
  };
}

/** This console's localStorage, for values that outlive the tab. */
export const local = scoped(() => localStorage, MIGRATABLE);

/** This console's sessionStorage, for values that belong to one tab. Nothing is adopted here. */
export const session = scoped(() => sessionStorage, []);
