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

import { useMemo } from 'react';

export function useFiltered<T>(items: T[] | undefined, search: string, getSearchStr: (item: T) => string): T[] {
  return useMemo(() => {
    if (!items) return [];
    if (!search.trim()) return items;
    const s = search.toLowerCase();
    return items.filter((x) => getSearchStr(x).toLowerCase().includes(s));
  }, [items, search, getSearchStr]);
}

export const mappingLevel = (m: { projectUuid?: string | null; integrationUuid?: string | null }) => (m.integrationUuid ? 'Component' : m.projectUuid ? 'Project' : 'Organization');

export const envLabel = (m: { envUuid?: string | null }, environments: { id: string; name: string }[]) => {
  if (!m.envUuid) return 'All';
  const env = environments.find((e) => e.id === m.envUuid);
  return env?.name ?? m.envUuid;
};

export const getUserInitial = (user: { displayName?: string; username?: string; email?: string }): string => {
  const initial = user.displayName?.trim().charAt(0) || user.email?.trim().charAt(0) || user.username?.trim().charAt(0) || '?';
  return initial.toUpperCase();
};
