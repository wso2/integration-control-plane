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

import { workflowKeys } from '../api/queryKeys';
import type { Page } from '../api/types';

/**
 * Counts for the overview's figures: the engine has no count
 * operation, so a count is the first page of a listing, capped when the page filled.
 */

/** The engine's own page limit: filtering in the console counts best over the largest page. */
export const COUNT_PAGE = 100;

export interface CappedCount {
  count: number;
  /** The page filled: the real number is at least `count`. */
  capped: boolean;
}

/** A figure as the card holds it: `undefined` while it loads, `null` when it could not be read. */
export type FigureCount = CappedCount | null | undefined;

export function countOf<T>(page: Page<T> | null | undefined, keep: (item: T) => boolean = () => true): CappedCount {
  const items = page?.items ?? [];
  return { count: items.filter(keep).length, capped: page?.hasMore === true };
}

/** `…` while loading, an en dash when the read failed, `50+` when the page filled. */
export function countText(count: FigureCount): string {
  if (count === undefined) return '…';
  if (count === null) return '–';
  return `${count.count}${count.capped ? '+' : ''}`;
}

/**
 * The key of one figure's read. It sits under the connection's keys, so a renewed credential and
 * the workflow pages' refresh read it again, but apart from the listings: a figure caches one page,
 * which is not the shape the Workflows and Human Tasks lists hold under their own keys.
 */
export function workflowCountKey(scopeId: string, ...figure: unknown[]) {
  return [...workflowKeys.all(scopeId), 'count', ...figure] as const;
}
