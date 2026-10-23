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

import { useEffect, useMemo, useState } from 'react';
import type { EndpointOption, EndpointRef } from '../../../types/consumers';

interface UseEndpointDrawerArgs {
  open: boolean;
  projectName: string;
  componentName: string;
  envName: string;
  endpoints: EndpointOption[];
  activeEndpointName?: string;
}

interface UseEndpointDrawerResult {
  selectedIdx: number;
  selectEndpoint: (idx: number) => void;
  selectedEndpoint: EndpointOption | null;
  /** null until every path segment is known, which is what gates the drawer's queries. */
  endpointRef: EndpointRef | null;
  /** Identity of the current (endpoint, open) pair, for seeding form state once per opening. */
  syncKey: string;
}

/**
 * Endpoint selection shared by the cloud API drawers: the caller's `activeEndpointName` picks the
 * endpoint on open, the user's own choice takes over until the drawer closes.
 */
export function useEndpointDrawer({ open, projectName, componentName, envName, endpoints, activeEndpointName }: UseEndpointDrawerArgs): UseEndpointDrawerResult {
  const [userSelectedIdx, setUserSelectedIdx] = useState<number | null>(null);

  // Drop the override on close, so reopening derives the endpoint from activeEndpointName again.
  useEffect(() => {
    if (!open) setUserSelectedIdx(null);
  }, [open]);

  const matchedIdx = useMemo(() => {
    const i = endpoints.findIndex((ep) => ep.name === activeEndpointName);
    return i >= 0 ? i : 0;
  }, [endpoints, activeEndpointName]);

  const selectedIdx = userSelectedIdx ?? matchedIdx;
  const selectedEndpoint = endpoints[selectedIdx] ?? null;

  const endpointRef: EndpointRef | null = useMemo(() => (selectedEndpoint ? { projectName, componentName, environmentName: envName, endpointName: selectedEndpoint.name } : null), [projectName, componentName, envName, selectedEndpoint]);

  const syncKey = JSON.stringify({ projectName, componentName, envName, endpointName: selectedEndpoint?.name ?? '', open });

  return { selectedIdx, selectEndpoint: setUserSelectedIdx, selectedEndpoint, endpointRef, syncKey };
}
