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

import { useState } from 'react';

export type SortOrder = 'asc' | 'desc';

/** TableSortLabel state: clicking the active column flips direction, a new column starts ascending. */
export function useSortState<K extends string>(initialKey: K, initialOrder: SortOrder = 'desc') {
  const [sortKey, setSortKey] = useState<K>(initialKey);
  const [sortOrder, setSortOrder] = useState<SortOrder>(initialOrder);

  const handleSort = (key: K) => {
    if (sortKey === key) {
      setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortOrder('asc');
    }
  };

  return { sortKey, sortOrder, handleSort };
}
