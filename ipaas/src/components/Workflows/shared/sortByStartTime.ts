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
 * A copy of `items` ordered by start time, newest first. A missing or unreadable start time sorts last.
 *
 * Only what has been loaded is ordered: the engine pages in its own order (open runs ahead of
 * closed ones), so a page fetched later can still hold an older run that belongs higher up.
 */
export function sortByStartTimeDesc<T extends { startTime?: string | null }>(items: T[]): T[] {
  const startedAt = (value?: string | null) => {
    const time = value ? Date.parse(value) : NaN;
    return Number.isNaN(time) ? 0 : time;
  };
  return [...items].sort((a, b) => startedAt(b.startTime) - startedAt(a.startTime));
}
