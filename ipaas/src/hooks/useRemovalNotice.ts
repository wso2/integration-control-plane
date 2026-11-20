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

import { useCallback, useEffect, useRef } from 'react';

interface Removable {
  id: string;
  deleting?: boolean;
}

/** A removal waiting for a list to confirm it; `acceptedAt` is set for one recorded with `track`. */
interface Pending {
  label: string;
  acceptedAt?: number;
}

/**
 * Calls `onRemoved` once a deleting entry drops out of the list. A delete is only
 * accepted when the request returns, so confirming then would outrun the backend.
 * `scopeKey` identifies which list these entries belong to.
 *
 * The returned `track(id, label, acceptedAt, acceptedIn)` records a delete the backend accepted, for one that may
 * leave the list before any read shows it deleting. It is confirmed only by a list read after `acceptedAt`, so
 * `listedAt` (when `items` was read) must be passed for it. A delete accepted in another scope than the list's
 * current one is ignored.
 */
export function useRemovalNotice<T extends Removable>(scopeKey: string, items: T[] | undefined, labelOf: (item: T) => string, onRemoved: (label: string) => void, listedAt = 0): (id: string, label: string, acceptedAt: number, acceptedIn: string) => void {
  const pending = useRef<Map<string, Pending>>(new Map());
  const scope = useRef(scopeKey);
  const notify = useRef(onRemoved);
  notify.current = onRemoved;
  const latest = useRef({ items, listedAt });
  latest.current = { items, listedAt };

  const confirmAbsent = useCallback(() => {
    const { items: list, listedAt: readAt } = latest.current;
    if (!list) return;
    const present = new Set(list.map((item) => item.id));
    pending.current.forEach(({ label, acceptedAt }, id) => {
      if (present.has(id) || (acceptedAt !== undefined && readAt <= acceptedAt)) return;
      pending.current.delete(id);
      notify.current(label);
    });
  }, []);

  useEffect(() => {
    // The list swaps wholesale on a scope change; ids pending from the old one are
    // absent from the new one and would read as removals.
    if (scope.current !== scopeKey) {
      scope.current = scopeKey;
      pending.current.clear();
    }
    if (!items) return;
    confirmAbsent();
    items.forEach((item) => {
      if (item.deleting) pending.current.set(item.id, { label: labelOf(item) });
    });
    // labelOf is a render-scoped closure; the effect keys off the list and scope alone.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, listedAt, scopeKey, confirmAbsent]);

  return useCallback(
    (id: string, label: string, acceptedAt: number, acceptedIn: string) => {
      // A delete whose reply arrives after the list moved to another scope never belonged to this one.
      if (acceptedIn !== scope.current) return;
      pending.current.set(id, { label, acceptedAt });
      // The list may already have been read again since the delete was accepted.
      confirmAbsent();
    },
    [confirmAbsent],
  );
}
