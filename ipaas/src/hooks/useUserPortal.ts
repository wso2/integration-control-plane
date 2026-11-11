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

import { useEffect, useRef } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { disableUserPortal, enableUserPortal, fetchUserPortal, fetchUserPortalEnvironments, fetchUserPortalPublications, fetchUserPortalPublishability, publishToUserPortal, unpublishFromUserPortal } from '../api/userPortal';
import type { UserPortal, UserPortalPublications, UserPortalPublishability, UserPortalRefusal } from '../types/userPortal';
import { isUserPortalUnavailable } from '../utils/apiErrors';
import { portalBusy } from '../utils/userPortal';
import { invalidateEndpointSettings } from './useConsumers';

const ROOT_KEY = 'userPortal';

/**
 * How often a portal that is setting up, starting or being removed is read again. Short enough that
 * Open portal shows soon after it is ready; the poll stops once every portal has settled.
 */
const SETTLING_POLL_MS = 3_000;

/** How often a portal that isn't ready is read again: it can stay so for hours, so less often. */
const NOT_READY_POLL_MS = 30_000;

const pollInterval = (portal: UserPortal | undefined): number | false => {
  if (!portal) return false;
  if (portalBusy(portal.state)) return SETTLING_POLL_MS;
  return portal.state === 'unhealthy' ? NOT_READY_POLL_MS : false;
};

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
      refetchInterval: (query: { state: { data?: UserPortal } }) => pollInterval(query.state.data),
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
    refetchInterval: (query) => pollInterval(query.state.data),
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
    // A refusal can mean the portal changed elsewhere, removed for one, so it is read again.
    onError: (_err, environment) => void qc.invalidateQueries({ queryKey: [ROOT_KEY, 'portal', environment] }),
  });
}

export const useEnableUserPortal = () => useWritePortal(enableUserPortal);

export const useDisableUserPortal = () => useWritePortal(disableUserPortal);

/**
 * A publish or an unpublish that ran in the background switched the workflow's Management API between the console's API
 * key and the User Portal's sign-in, so every view of its endpoint security in environment reads it again once that
 * ends. It is done where the reads that see the end land, rather than in one view, so the views that never saw the run
 * aren't left with the security from before it.
 */
function rereadSecurityOnceSettled(qc: QueryClient, componentId: string, environment: string, wasRunning: boolean, isRunning: boolean): void {
  if (wasRunning && !isRunning) invalidateEndpointSettings(qc, componentId, environment);
}

/**
 * Whether the integration is, and can be, published to the environment's User Portal. It is read again every few seconds
 * while a background publish or unpublish is running, and while `rereadWhile` holds for the report read last, as a
 * settling portal is.
 */
export function useUserPortalPublishability(componentId: string, environment: string, { rereadWhile }: { rereadWhile?: (report: UserPortalPublishability) => boolean } = {}) {
  const qc = useQueryClient();
  const queryKey = [ROOT_KEY, 'publishability', componentId, environment];
  return useQuery({
    queryKey,
    queryFn: async () => {
      const before = qc.getQueryData<UserPortalPublishability>(queryKey);
      const report = await fetchUserPortalPublishability(componentId, environment);
      rereadSecurityOnceSettled(qc, componentId, environment, !!before && (before.publishing || before.unpublishing), report.publishing || report.unpublishing);
      return report;
    },
    enabled: !!componentId && !!environment,
    retry: (failures, err) => !isUserPortalUnavailable(err) && failures < 2,
    staleTime: 30_000,
    refetchInterval: (query) => (query.state.data && (query.state.data.publishing || query.state.data.unpublishing || rereadWhile?.(query.state.data)) ? SETTLING_POLL_MS : false),
  });
}

/**
 * The environments the integration is published to the User Portal in. A workflow published in one is managed
 * from the User Portal there, so the console's workflow views step aside, and they wait while one unpublished is
 * given back to the console: they are read again every few seconds until that ends.
 */
export function useUserPortalPublications(componentId: string, { enabled = true }: { enabled?: boolean } = {}) {
  const qc = useQueryClient();
  const queryKey = [ROOT_KEY, 'publications', componentId];
  return useQuery({
    queryKey,
    queryFn: async () => {
      const before = qc.getQueryData<UserPortalPublications>(queryKey);
      const publications = await fetchUserPortalPublications(componentId);
      for (const environment of before?.unpublishing ?? []) rereadSecurityOnceSettled(qc, componentId, environment, true, publications.unpublishing.includes(environment));
      return publications;
    },
    enabled: enabled && !!componentId,
    retry: (failures, err) => !isUserPortalUnavailable(err) && failures < 2,
    staleTime: 30_000,
    refetchInterval: (query) => ((query.state.data?.unpublishing.length ?? 0) > 0 ? SETTLING_POLL_MS : false),
  });
}

interface BackgroundOutcomeHandlers {
  onPublished: (rejectedScopes: string[]) => void;
  onFailed: (error: UserPortalRefusal) => void;
  /** An unpublish's work after its response finished: the scopes are in step, and the workflow is given back. */
  onUnpublished: () => void;
  /** The scopes, or giving the workflow back to the console, failed after an unpublish. */
  onUnpublishFailed: (error: UserPortalRefusal) => void;
}

/**
 * Runs `onPublished` or `onFailed` once when a background publish this page saw running ends, and `onUnpublished` or
 * `onUnpublishFailed` when a background unpublish does. One that was already over when the page loaded reports nothing,
 * and neither does a re-read of the same outcome.
 */
export function useBackgroundPublishOutcome(componentId: string, environment: string, handlers: BackgroundOutcomeHandlers) {
  const { data: report } = useUserPortalPublishability(componentId, environment);
  const sawRunning = useRef<'publishing' | 'unpublishing' | null>(null);
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });
  useEffect(() => {
    if (!report) return;
    if (report.publishing || report.unpublishing) {
      sawRunning.current = report.publishing ? 'publishing' : 'unpublishing';
      return;
    }
    const ended = sawRunning.current;
    sawRunning.current = null;
    if (ended === 'publishing') {
      if (report.published) latest.current.onPublished(report.rejectedScopes);
      else if (report.publishError) latest.current.onFailed(report.publishError);
    } else if (ended === 'unpublishing') {
      if (report.unpublishError) latest.current.onUnpublishFailed(report.unpublishError);
      else if (!report.published) latest.current.onUnpublished();
    }
  }, [report]);
}

function useWritePublication<T>(write: (componentId: string, environment: string) => Promise<T>, onSuccess?: (out: T, vars: { componentId: string; environment: string }) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ componentId, environment }: { componentId: string; environment: string }) => write(componentId, environment),
    onSuccess,
    onSettled: (_data, _err, { componentId }) => Promise.all([qc.invalidateQueries({ queryKey: [ROOT_KEY, 'publishability', componentId] }), qc.invalidateQueries({ queryKey: [ROOT_KEY, 'publications', componentId] })]),
  });
}

/**
 * A publish that redeploys a workflow answers once accepted, with `publishing` set. The report then says so at once,
 * so nothing offers Publish again before the re-read the mutation awaits has landed. That re-read keeps it fresh.
 */
export function usePublishToUserPortal() {
  const qc = useQueryClient();
  return useWritePublication(publishToUserPortal, (out, { componentId, environment }) => {
    if (!out.publishing) return;
    qc.setQueryData<UserPortalPublishability>([ROOT_KEY, 'publishability', componentId, environment], (report) => report && { ...report, publishing: true, publishError: undefined });
  });
}

/**
 * An unpublish that gives a workflow back to the console answers once it is out of the User Portal, with `unpublishing`
 * set, and the redeploy carries on in the background. The report says so at once, as for a publish.
 */
export function useUnpublishFromUserPortal() {
  const qc = useQueryClient();
  return useWritePublication(unpublishFromUserPortal, (out, { componentId, environment }) => {
    if (!out.unpublishing) return;
    qc.setQueryData<UserPortalPublishability>([ROOT_KEY, 'publishability', componentId, environment], (report) => report && { ...report, published: false, unpublishing: true, unpublishError: undefined });
  });
}
