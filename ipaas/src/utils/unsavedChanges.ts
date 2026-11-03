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

import { basePath } from './basePath';

export interface LinkClick {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
}

export interface LinkTarget {
  /** The anchor's resolved `href` property (absolute URL). */
  href: string;
  target: string;
  download: boolean;
}

/** Whether a link click moves to another console page in this tab; the browser and `beforeunload` cover the rest. */
export function isLeavingLinkClick(click: LinkClick, link: LinkTarget, current: URL, base: string = basePath): boolean {
  if (click.defaultPrevented || click.button !== 0) return false;
  if (click.metaKey || click.ctrlKey || click.shiftKey || click.altKey) return false;
  if (link.download || (link.target !== '' && link.target !== '_self')) return false;

  let next: URL;
  try {
    next = new URL(link.href, current);
  } catch {
    return false;
  }
  if (next.origin !== current.origin) return false;
  if (base && next.pathname !== base && !next.pathname.startsWith(`${base}/`)) return false;
  return next.pathname !== current.pathname || next.search !== current.search;
}

/** The `history.go` delta that undoes a popstate, from React Router's `idx`; null lets the pop through. */
export function historyRestoreDelta(currentIdx: number | null, poppedState: unknown): number | null {
  const idx = historyIndex(poppedState);
  if (currentIdx === null || idx === null || idx === currentIdx) return null;
  return currentIdx - idx;
}

/** The `idx` React Router stores in a history entry's state, or null when it is absent. */
export function historyIndex(state: unknown): number | null {
  if (typeof state !== 'object' || state === null) return null;
  const idx = (state as { idx?: unknown }).idx;
  return typeof idx === 'number' ? idx : null;
}
