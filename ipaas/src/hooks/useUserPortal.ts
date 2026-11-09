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
import { disableUserPortal, enableUserPortal, fetchUserPortal, fetchUserPortalEnvironments, fetchUserPortalPublications, fetchUserPortalPublishability, publishToUserPortal, unpublishFromUserPortal } from '../api/userPortal';
import type { UserPortal, UserPortalPublishability } from '../types/userPortal';
import { isUserPortalUnavailable } from '../utils/apiErrors';

const ROOT_KEY = 'userPortal';

/**
 * How often a portal that is still setting up or being removed is read again. Short enough that
 * Open portal shows soon after it is ready; the poll stops once every portal has settled.
 */
const SETTLING_POLL_MS = 3_000;

const settling = (portal: UserPortal | undefined): boolean => portal?.state === 'setting-up' || portal?.state === 'removing';

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

/**
 * One environment's User Portal, read only when `enabled`, and again every few seconds while it is
 * settling. It shares the cache with `useUserPortals`, so the User Portal page and the env cards agree
 * on its state and address.
 */
export function useUserPortal(environment: string, enabled: boolean) {
  return useQuery({
    queryKey: [ROOT_KEY, 'portal', environment],
    queryFn: () => fetchUserPortal(environment),
    enabled: enabled && !!environment,
    retry: (failures, err) => !isUserPortalUnavailable(err) && failures < 2,
    staleTime: 60_000,
    refetchInterval: (query) => (settling(query.state.data) ? SETTLING_POLL_MS : false),
  });
}

/**
 * Whether ipaas-service serves the User Portal for environment, so copy may point to it: false once reading its portal
 * says there is no User Portal to read (a BFF without its routes), true until then. It shares `useUserPortal`'s read.
 */
export function useUserPortalServed(environment: string): boolean {
  const { error } = useUserPortal(environment, true);
  return !isUserPortalUnavailable(error);
}

function useWritePortal(write: (environment: string) => Promise<UserPortal>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: write,
    onSuccess: (portal) => {
      qc.setQueryData([ROOT_KEY, 'portal', portal.environment], portal);
      // A disable unpublishes the portal's integrations, and an enable changes what can be published.
      void qc.invalidateQueries({ queryKey: [ROOT_KEY, 'publishability'] });
      void qc.invalidateQueries({ queryKey: [ROOT_KEY, 'publications'] });
    },
  });
}

export const useEnableUserPortal = () => useWritePortal(enableUserPortal);

export const useDisableUserPortal = () => useWritePortal(disableUserPortal);

/**
 * Whether the integration is, and can be, published to the environment's User Portal. While `rereadWhile` holds for the
 * report read last, it is read again every few seconds, as a settling portal is.
 */
export function useUserPortalPublishability(componentId: string, environment: string, { rereadWhile }: { rereadWhile?: (report: UserPortalPublishability) => boolean } = {}) {
  return useQuery({
    queryKey: [ROOT_KEY, 'publishability', componentId, environment],
    queryFn: () => fetchUserPortalPublishability(componentId, environment),
    enabled: !!componentId && !!environment,
    retry: (failures, err) => !isUserPortalUnavailable(err) && failures < 2,
    staleTime: 30_000,
    refetchInterval: (query) => (query.state.data && rereadWhile?.(query.state.data) ? SETTLING_POLL_MS : false),
  });
}

/**
 * The environments the integration is published to the User Portal in. A workflow published in one is managed
 * from the User Portal there, so the console's workflow views step aside.
 */
export function useUserPortalPublications(componentId: string, { enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: [ROOT_KEY, 'publications', componentId],
    queryFn: () => fetchUserPortalPublications(componentId),
    enabled: enabled && !!componentId,
    retry: (failures, err) => !isUserPortalUnavailable(err) && failures < 2,
    staleTime: 30_000,
  });
}

function useWritePublication<T>(write: (componentId: string, environment: string) => Promise<T>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ componentId, environment }: { componentId: string; environment: string }) => write(componentId, environment),
    onSettled: (_data, _err, { componentId }) => Promise.all([qc.invalidateQueries({ queryKey: [ROOT_KEY, 'publishability', componentId] }), qc.invalidateQueries({ queryKey: [ROOT_KEY, 'publications', componentId] })]),
  });
}

export const usePublishToUserPortal = () => useWritePublication(publishToUserPortal);

export const useUnpublishFromUserPortal = () => useWritePublication(unpublishFromUserPortal);
