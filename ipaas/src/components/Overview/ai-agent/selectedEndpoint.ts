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

import { useCallback, useSyncExternalStore } from 'react';

const selected = new Map<string, string>();
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function useSelectedAgentEndpoint(componentId: string, envId: string): [string | null, (endpointId: string) => void] {
  const key = `${componentId}:${envId}`;
  const value = useSyncExternalStore(subscribe, () => selected.get(key) ?? null);
  const set = useCallback(
    (endpointId: string) => {
      selected.set(key, endpointId);
      listeners.forEach((l) => l());
    },
    [key],
  );
  return [value, set];
}
