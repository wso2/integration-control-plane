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

import { prefixed, session } from './storage';

/**
 * A test key kept in this tab's sessionStorage, so a page load reuses it rather than minting
 * another. It is a plaintext credential, so only a short-lived test key is kept, only in the tab
 * that minted it, and every one is cleared on sign-out.
 */
export interface StoredTestKey {
  key: string;
  /** When it was minted (epoch ms). */
  mintedAt: number;
  /** When it is due for renewal (epoch ms). */
  renewAt: number;
}

const SLOT = 'endpoint-test-key:';

/**
 * The key kept for `scope`, or `null` when none is, or the one kept is due for renewal: presenting
 * a key about to expire would cost a refused call before the mint it saves.
 */
export function readStoredTestKey(scope: string, now = Date.now()): StoredTestKey | null {
  try {
    const raw = session.get(SLOT + scope);
    if (!raw) return null;
    const { key, mintedAt, renewAt } = JSON.parse(raw) as Partial<StoredTestKey>;
    if (typeof key !== 'string' || !key || typeof mintedAt !== 'number' || typeof renewAt !== 'number' || renewAt <= now) {
      session.remove(SLOT + scope);
      return null;
    }
    return { key, mintedAt, renewAt };
  } catch {
    // Storage blocked, or a value this build can't read: mint as if none were kept.
    return null;
  }
}

export function storeTestKey(scope: string, held: StoredTestKey): void {
  try {
    session.set(SLOT + scope, JSON.stringify({ key: held.key, mintedAt: held.mintedAt, renewAt: held.renewAt }));
  } catch {
    // A full or blocked store only costs the next page load a mint.
  }
}

/** Removes every kept test key, so none outlives the session that minted it. */
export function clearStoredTestKeys(): void {
  try {
    const slot = prefixed(SLOT);
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const name = sessionStorage.key(i);
      if (name?.startsWith(slot)) sessionStorage.removeItem(name);
    }
  } catch {
    // Nothing can be read from a store that can't be reached either.
  }
}
