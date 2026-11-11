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

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Scopes } from '../../../constants/permissions';
import { useCan } from '../../../hooks/useCan';
import { useEnvEndpoints } from '../../../hooks/useDeployments';
import { useEndpointTestAccess } from '../../../hooks/useEndpointTestAccess';
import { useUnpublishFromUserPortal, useUserPortalPublications, useUserPortals } from '../../../hooks/useUserPortal';
import type { EndpointRef } from '../../../types/consumers';
import type { ComponentDeployment } from '../../../types/deployment';
import { isUserPortalUnavailable } from '../../../utils/apiErrors';
import { userPortalErrorText } from '../../../utils/userPortal';
import { createWorkflowClient, type WorkflowClient } from '../api/client';
import { isWorkflowError, retryWorkflowRead } from '../api/http';
import { isScopedWorkflowKey, workflowKeys } from '../api/queryKeys';
import type { WorkflowRuntimeInfo } from '../api/types';
import { resolveWorkflowBaseUrl, resolveWorkflowEndpoint } from './resolveWorkflowBaseUrl';
import { testKeyNotice, testKeyReasonOf, workflowRequestHeaders, type GatewayCredential, type TestKeyReason, type WorkflowNotice } from './workflowCredential';
import { isKeyRefusal } from './workflowTestKey';

/**
 * Resolves everything one call to the workflow Management API needs, and says which state the
 * connection is in until it is ready.
 *
 * The API is the release's "Workflow Management API" endpoint (`resolveWorkflowEndpoint`), listed
 * by ipaas-service like any other endpoint. The console calls it through the API Platform gateway,
 * at the invoke URL and with the test key `useEndpointTestAccess` holds for it, as the Test Console
 * calls an endpoint. The key is the only credential sent, and it names no user
 * (`workflowCredential.ts`).
 *
 * The key is the one `useEndpointTestAccess` holds for the endpoint, shared with every other view of
 * it and renewed there ahead of expiry. When a read is refused and that key is old enough to have
 * expired, it is renewed, and the refused reads of this connection are read again. A cheap
 * `GET /runtime` probe decides the connection is ready: a 404 there means the integration does not
 * serve the API, and a 401 with a fresh key means the credentials themselves are refused.
 *
 * A workflow published to the User Portal in the environment is managed from the portal: publishing
 * redeploys it so its management API takes only User Portal sign-ins, on the gateway and in the
 * workflow, and no test key opens it. The connection then says so rather than reach for a key. One
 * just unpublished takes no key either until it is redeployed back, which ends after the unpublish
 * answers, so the connection waits for that; one that couldn't be redeployed back offers to finish
 * unpublishing. The User Portal reads have the API's security read again once a redeploy ends.
 *
 * Call it once per view and environment and pass the result down, so one probe and one renewal
 * serve the whole view.
 */

/** Which deployment of which integration to connect to. */
export interface WorkflowTarget {
  /** The integration's id, which the BFF names it by. */
  componentId: string;
  /** The environment's id, which the BFF names it by. */
  environmentId: string;
  /** The deployment track shown; undefined while the page resolves it. */
  trackId: string | undefined;
  /** The track's deployment in the environment; null or undefined when there is none (yet). */
  deployment: Pick<ComponentDeployment, 'releaseId' | 'deploymentStatusV2'> | null | undefined;
  /** Tells "still loading" apart from "this track is not deployed here". */
  isDeploymentLoading: boolean;
}

export type WorkflowUnavailableReason = TestKeyReason | 'no-endpoint' | 'api-disabled' | 'published-to-user-portal' | 'unpublishing-from-user-portal' | 'not-given-back';

/** What a notice offers to do about its state: something to run here, or a page to open in a new tab. */
export type WorkflowNoticeAction = { label: string; run: () => void; pending: boolean } | { label: string; href: string };

export interface ReadyWorkflowConnection {
  status: 'ready';
  /** Stable for the life of the connection: it reads the current credential per request. */
  client: WorkflowClient;
  /** The management API's gateway URL. */
  baseUrl: string;
  /** Identifies this connection in query keys (`workflowKeys`): integration, release, environment. */
  scopeId: string;
  /** What the probe read; `taskQueue` is the queue a task must belong to for this integration to act on it. */
  runtime: WorkflowRuntimeInfo;
  /** The management endpoint's name (on the live integration, `workflow-ma-cf1`). */
  endpointName: string;
  /** Mints the test key again and re-reads this connection: for a 401 a mutation got. */
  renewCredential: () => void;
}

export type WorkflowConnection =
  /** Connecting: the deployment, endpoints, gateway access, test key or probe are still resolving. */
  | { status: 'loading' }
  /** The track has no active deployment here; `deploymentStatus` says which state it is in instead. */
  | { status: 'not-deployed'; deploymentStatus: string | null }
  /** The management API cannot be reached from the console, for `reason`. */
  | { status: 'unavailable'; reason: WorkflowUnavailableReason; notice: WorkflowNotice; action: WorkflowNoticeAction | null }
  /** A read the connection needs failed. */
  | { status: 'error'; message: string; retry: () => void }
  /** The gateway or the engine refused a credential that was not stale. */
  | { status: 'refused'; message: string; retry: () => void }
  | ReadyWorkflowConnection;

const LOADING: WorkflowConnection = { status: 'loading' };

const API_DISABLED: WorkflowNotice = {
  severity: 'warning',
  text: 'This integration answers that it does not serve the Workflow Management API. Check that its management API is enabled, then deploy it again.',
};

const PUBLISHED: WorkflowNotice = {
  severity: 'info',
  text: 'This workflow is published to the User Portal in this environment, so its runs and human tasks are managed there. Its Workflow Management API accepts only User Portal sign-ins, so the console can’t reach it. Unpublish it to manage it from the console again.',
};

const UNPUBLISHING: WorkflowNotice = {
  severity: 'info',
  text: 'This workflow is unpublished from the User Portal in this environment, and is being redeployed to take the console’s API key again. Its runs and human tasks show here once that’s done, in a minute or two.',
};

const NOT_GIVEN_BACK: WorkflowNotice = {
  severity: 'warning',
  text: 'This workflow is unpublished from the User Portal in this environment, but it couldn’t be redeployed to take the console’s API key again, so the console can’t reach it yet. Finish unpublishing to manage its runs and human tasks here.',
};

export function useWorkflowConnection({ componentId, environmentId, trackId, deployment, isDeploymentLoading }: WorkflowTarget): WorkflowConnection {
  const queryClient = useQueryClient();
  const isActive = deployment?.deploymentStatusV2 === 'ACTIVE';
  const releaseId = isActive ? deployment.releaseId : '';
  // The credential is not in it: every call names the signed-in user, who cannot change mid-session.
  const scopeId = releaseId ? `${componentId}|${releaseId}|${environmentId}` : '';

  // The selected track's release, so the endpoint is the one deployed on that track.
  const endpoints = useEnvEndpoints(componentId, trackId, releaseId);
  const resolution = useMemo(() => resolveWorkflowEndpoint(endpoints.data ?? []), [endpoints.data]);
  const endpoint = resolution.status === 'ready' ? resolution.endpoint : null;
  const endpointName = endpoint?.id ?? '';

  // A BFF that serves no User Portal publishes nothing: the views carry on as before. Any other failed read
  // leaves it unknown, and the views wait for it: a published workflow's would offer a switch back to API key,
  // which ipaas-service refuses for it, instead of pointing to the User Portal it is managed in.
  const publications = useUserPortalPublications(componentId, { enabled: isActive });
  const publishedHere = publications.data?.environments.includes(environmentId) ?? false;
  const unpublishingHere = publications.data?.unpublishing.includes(environmentId) ?? false;
  const notGivenBackHere = publications.data?.notGivenBack.includes(environmentId) ?? false;
  // Unpublishing again finishes giving it back; it is out of the User Portal already, so it isn't confirmed.
  const unpublish = useUnpublishFromUserPortal();
  const canDeploy = useCan()(Scopes.INTEGRATION_DEPLOY);
  const publicationsKnown = publications.data !== undefined || (publications.isError && isUserPortalUnavailable(publications.error));
  // Where the User Portal it is published to runs, to open it from the notice.
  const [portal] = useUserPortals(publishedHere ? [environmentId] : []);
  const portalUrl = portal?.data?.url;

  const ref = useMemo<EndpointRef | null>(() => (endpointName ? { componentName: componentId, environmentName: environmentId, endpointName, deploymentTrackId: trackId } : null), [componentId, environmentId, endpointName, trackId]);
  // Release-scoped discovery already returns the gateway's public URL; the security read may too. A
  // published workflow takes no test key, and nor does one being given back or not given back, so none
  // is minted until it is known to be none of them. Its security is read meanwhile, which changes nothing.
  const portalHeld = publishedHere || unpublishingHere || notGivenBackHere;
  const access = useEndpointTestAccess(ref, { enabled: !!ref, mint: publicationsKnown && !portalHeld, gatewayUrlFallback: endpoint?.publicUrl ?? '' });
  const { authHeader, apiKey, mintKey, renewKey } = access;
  const baseUrl = ref ? resolveWorkflowBaseUrl(access.gatewayUrl) : '';

  // The credential as of the last commit, read by each request as it goes out, so a key minted
  // again reaches every query without a new client. Synced before any child's effects can fetch.
  const credential = useRef<GatewayCredential>({ authHeader, apiKey });
  useLayoutEffect(() => {
    credential.current = { authHeader, apiKey };
  }, [authHeader, apiKey]);

  const getHeaders = useCallback(async () => workflowRequestHeaders(credential.current), []);
  const client = useMemo(() => (baseUrl ? createWorkflowClient({ baseUrl, getHeaders }) : null), [baseUrl, getHeaders]);

  const probe = useQuery({
    queryKey: workflowKeys.runtime(scopeId),
    queryFn: () => client!.runtime.get(),
    enabled: !!client && !!scopeId && access.isAuthorized && publicationsKnown && !portalHeld,
    staleTime: 5 * 60_000,
    retry: retryWorkflowRead,
  });

  // When the held key was minted, to tell a stale key's refusal from any other. The key is shared,
  // so it can be older than this connection.
  const keyMintedAt = useRef(access.keyMintedAt);
  useLayoutEffect(() => {
    keyMintedAt.current = access.keyMintedAt;
  }, [access.keyMintedAt]);

  // Renewing: renew the refused key, then read again what this connection holds. An open API has no
  // key to renew, so it is only read again. Every view on the connection hears the same refusal; one
  // renewal serves them all.
  const rereadAfterMint = useRef(false);
  const rereadAll = useCallback(() => queryClient.invalidateQueries({ predicate: (query) => isScopedWorkflowKey(query.queryKey, scopeId) }), [queryClient, scopeId]);
  const renew = useCallback(() => {
    if (rereadAfterMint.current) return;
    if (!credential.current.apiKey) {
      void rereadAll();
      return;
    }
    rereadAfterMint.current = true;
    void renewKey(credential.current.apiKey).then((key) => {
      // The new key reached this connection first and read everything again already (below).
      if (!rereadAfterMint.current) return;
      // A new key reads everything again once it reaches this connection (below).
      if (key && key !== credential.current.apiKey) return;
      rereadAfterMint.current = false;
      // Another view had renewed it already, so the key in use is current: read again now.
      if (key) void rereadAll();
    });
  }, [renewKey, rereadAll]);
  useEffect(() => {
    if (!rereadAfterMint.current || !apiKey) return;
    rereadAfterMint.current = false;
    void rereadAll();
  }, [apiKey, rereadAll]);

  // A refused read most often means the key expired or another tab's mint reaped it. Only a key old
  // enough for that is renewed, so a refusal with another cause cannot loop.
  useEffect(() => {
    if (!scopeId) return undefined;
    return queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== 'updated' || event.action.type !== 'error') return;
      if (!isScopedWorkflowKey(event.query.queryKey, scopeId)) return;
      if (credential.current.apiKey && isKeyRefusal(event.action.error, keyMintedAt.current)) renew();
    });
  }, [queryClient, scopeId, renew]);

  // The client the pages get lists and counts only this integration's task queue: every integration
  // in an environment shares one namespace, and the API otherwise answers for all of them. The lists
  // only run once the probe has answered, so they are limited from the first read.
  const taskQueue = probe.data?.taskQueue ?? null;
  const scopedClient = useMemo(() => (baseUrl && taskQueue ? createWorkflowClient({ baseUrl, getHeaders, taskQueue }) : client), [baseUrl, getHeaders, taskQueue, client]);
  // A redeploy can move the worker to another queue while a page is open: what was read for the old
  // queue is someone else's runs now, so drop it rather than show it until the next poll. The probe
  // itself is kept, or the connection would drop back to connecting.
  const readForQueue = useRef(taskQueue);
  useEffect(() => {
    if (readForQueue.current === taskQueue) return;
    const hadQueue = readForQueue.current !== null;
    readForQueue.current = taskQueue;
    if (!hadQueue || !scopeId) return;
    const runtimeKey = workflowKeys.runtime(scopeId);
    void queryClient.resetQueries({ predicate: (query) => isScopedWorkflowKey(query.queryKey, scopeId) && query.queryKey[2] !== runtimeKey[2] });
  }, [taskQueue, scopeId, queryClient]);

  if (!deployment) {
    // Not a failure: the pages tell the reader to deploy, as the Test Console does.
    return isDeploymentLoading ? LOADING : { status: 'not-deployed', deploymentStatus: null };
  }
  if (!isActive) {
    return { status: 'not-deployed', deploymentStatus: deployment.deploymentStatusV2 ?? null };
  }
  if (publications.isPending) return LOADING;
  if (publishedHere) {
    const action = portalUrl ? { label: 'Open User Portal', href: portalUrl } : null;
    return { status: 'unavailable', reason: 'published-to-user-portal', notice: PUBLISHED, action };
  }
  if (unpublishingHere) {
    return { status: 'unavailable', reason: 'unpublishing-from-user-portal', notice: UNPUBLISHING, action: null };
  }
  if (notGivenBackHere) {
    // A finish that is refused has nothing else to show it on.
    const notice = unpublish.isError ? { ...NOT_GIVEN_BACK, text: `${NOT_GIVEN_BACK.text} ${userPortalErrorText(unpublish.error, environmentId)}` } : NOT_GIVEN_BACK;
    const action = canDeploy ? { label: 'Finish unpublishing', run: () => unpublish.mutate({ componentId, environment: environmentId }), pending: unpublish.isPending } : null;
    return { status: 'unavailable', reason: 'not-given-back', notice, action };
  }
  if (!publicationsKnown) {
    return { status: 'error', message: 'Could not check whether this workflow is published to the User Portal.', retry: () => void publications.refetch() };
  }
  if (endpoints.isError) {
    return { status: 'error', message: 'Could not load this integration’s endpoints.', retry: () => void endpoints.refetch() };
  }
  if (endpoints.isPending) return LOADING;
  if (resolution.status === 'unavailable') {
    return { status: 'unavailable', reason: 'no-endpoint', notice: { severity: 'warning', text: resolution.reason }, action: null };
  }
  const reason = testKeyReasonOf(access);
  if (reason) {
    // The switch changes every caller's auth, so it is offered, never made for the person.
    const action =
      reason === 'needs-api-key' && access.canSwitch
        ? { label: 'Switch to API key', run: () => void access.switchToApiKey(), pending: access.isSwitching }
        : reason === 'mint-failed'
          ? { label: 'Retry', run: () => void mintKey(), pending: access.isMinting }
          : null;
    return { status: 'unavailable', reason, notice: testKeyNotice(reason, access), action };
  }
  if (!client || !access.isAuthorized) return LOADING;
  // Data held from an earlier probe keeps the connection up through a failed background refetch.
  if (probe.data !== undefined) {
    return { status: 'ready', client: scopedClient ?? client, baseUrl, scopeId, runtime: probe.data ?? { taskQueue: null }, endpointName, renewCredential: renew };
  }
  const { error } = probe;
  if (error) {
    if (isWorkflowError(error, 'GATEWAY_REJECTED')) return { status: 'refused', message: error.message, retry: renew };
    if (isWorkflowError(error, 'NOT_FOUND')) {
      return { status: 'unavailable', reason: 'api-disabled', notice: API_DISABLED, action: { label: 'Retry', run: () => void probe.refetch(), pending: probe.isFetching } };
    }
    return { status: 'error', message: error.message, retry: () => void probe.refetch() };
  }
  return LOADING;
}
