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

import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { disableUserPortal, enableUserPortal, fetchUserPortal, fetchUserPortalEnvironments, fetchUserPortalPublishability, publishToUserPortal, unpublishFromUserPortal } from '../api/userPortal';
import { BffError } from '../api/_client';
import type { UserPortal } from '../types/userPortal';

const ROOT_KEY = 'userPortal';

/**
 * How often a portal that is still setting up or being removed is read again. Short enough that
 * Open portal shows soon after it is ready; the poll stops once every portal has settled.
 */
const SETTLING_POLL_MS = 3_000;

const settling = (portal: UserPortal | undefined): boolean => portal?.state === 'setting-up' || portal?.state === 'removing';

/** Whether ipaas-service answered that it serves no User Portal: the routes are off (404) or it is not configured (503). */
export const isUserPortalUnavailable = (err: unknown): boolean => err instanceof BffError && (err.status === 404 || err.status === 503);

/** The environments a User Portal can run in, in promotion order. */
export function useUserPortalEnvironments() {
  return useQuery({ queryKey: [ROOT_KEY, 'environments'], queryFn: fetchUserPortalEnvironments });
}

/** Each environment's User Portal, read again every few seconds while any of them is settling. */
export function useUserPortals(environments: string[]) {
  return useQueries({
    queries: environments.map((environment) => ({
      queryKey: [ROOT_KEY, 'portal', environment],
      queryFn: () => fetchUserPortal(environment),
      retry: (failures: number, err: unknown) => !isUserPortalUnavailable(err) && failures < 2,
      refetchInterval: (query: { state: { data?: UserPortal } }) => (settling(query.state.data) ? SETTLING_POLL_MS : false),
    })),
  });
}

function useWritePortal(write: (environment: string) => Promise<UserPortal>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: write,
    onSuccess: (portal) => {
      qc.setQueryData([ROOT_KEY, 'portal', portal.environment], portal);
      // A disable unpublishes the portal's integrations, and an enable changes what can be published.
      void qc.invalidateQueries({ queryKey: [ROOT_KEY] });
    },
  });
}

export const useEnableUserPortal = () => useWritePortal(enableUserPortal);

export const useDisableUserPortal = () => useWritePortal(disableUserPortal);

/** Whether the integration is, and can be, published to the environment's User Portal. */
export function useUserPortalPublishability(componentId: string, environment: string, enabled = true) {
  return useQuery({
    queryKey: [ROOT_KEY, 'publishability', componentId, environment],
    queryFn: () => fetchUserPortalPublishability(componentId, environment),
    enabled: enabled && !!componentId && !!environment,
    retry: (failures, err) => !isUserPortalUnavailable(err) && failures < 2,
    staleTime: 30_000,
  });
}

function useWritePublication<T>(write: (componentId: string, environment: string) => Promise<T>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ componentId, environment }: { componentId: string; environment: string }) => write(componentId, environment),
    onSettled: (_data, _err, { componentId }) => qc.invalidateQueries({ queryKey: [ROOT_KEY, 'publishability', componentId] }),
  });
}

export const usePublishToUserPortal = () => useWritePublication(publishToUserPortal);

export const useUnpublishFromUserPortal = () => useWritePublication(unpublishFromUserPortal);
