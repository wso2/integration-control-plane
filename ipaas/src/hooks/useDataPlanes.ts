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

import { useQuery } from '@tanstack/react-query';
import { listDataPlanes, listPdps } from '../api/dataPlanes';
import { useOrgUuid } from './useOrgUuid';

const ROOT_KEY = 'dataPlanes';

/** All data planes for the org (Cloud + Private). */
export function useDataPlanes() {
  const orgUuid = useOrgUuid();
  return useQuery({
    queryKey: [ROOT_KEY, 'list', orgUuid],
    queryFn: () => listDataPlanes(),
    enabled: !!orgUuid,
    retry: false,
  });
}

/**
 * Private Data Planes tracked by the PDP manager. Polls every 30s so a
 * provisioning PDP's progress updates without a manual refresh.
 */
export function usePdps(enabled = true) {
  const orgUuid = useOrgUuid();
  return useQuery({
    queryKey: [ROOT_KEY, 'pdps', orgUuid],
    queryFn: () => listPdps(),
    enabled: enabled && !!orgUuid,
    retry: false,
    refetchInterval: 30_000,
  });
}
