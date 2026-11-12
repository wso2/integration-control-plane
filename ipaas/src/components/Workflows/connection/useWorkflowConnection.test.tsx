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

import { useSyncExternalStore } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BffError } from '../../../api/_client';
import type { EndpointTestAccess } from '../../../hooks/useEndpointTestAccess';
import type { EnvEndpoint } from '../../../types/component';
import { workflowKeys } from '../api/queryKeys';
import { useWorkflowApi, type WorkflowApi } from '../api/useWorkflowApi';
import type { WorkflowTarget } from './useWorkflowConnection';

const GATEWAY_URL = 'https://gw.example.dev/default/orders-workflow-ma-cf1/v1.0';

// The test access a store the test moves on, the way the real hook's state would.
const access = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  let value = {} as EndpointTestAccess;
  return {
    get: () => value,
    set(patch: Partial<EndpointTestAccess>) {
      value = { ...value, ...patch };
      listeners.forEach((listener) => listener());
    },
    reset(next: EndpointTestAccess) {
      value = next;
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
});
const testAccessCalls = vi.hoisted(() => [] as unknown[][]);
const endpoints = vi.hoisted(() => ({ list: [] as EnvEndpoint[], releaseIds: [] as string[] }));
// The environments the integration is published to the User Portal in, those it is being given back to the console in
// after an unpublish, and those it couldn't be given back in, or what reading them failed with.
const publications = vi.hoisted(() => ({ environments: [] as string[], unpublishing: [] as string[], notGivenBack: [] as string[], error: null as unknown, refetch: vi.fn(), portalUrl: undefined as string | undefined }));
// The unpublish that finishes giving it back, and whether the role may deploy.
const finish = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false, isError: false, error: null as unknown }));
const role = vi.hoisted(() => ({ canDeploy: true }));
vi.mock('../../../hooks/useCan', () => ({ useCan: () => () => role.canDeploy }));

vi.mock('../../../hooks/useDeployments', () => ({
  useEnvEndpoints: (_componentId: string, _trackId: string | undefined, releaseId: string) => {
    endpoints.releaseIds.push(releaseId);
    return releaseId ? { data: endpoints.list, isPending: false, isError: false, refetch: vi.fn() } : { data: undefined, isPending: true, isError: false, refetch: vi.fn() };
  },
}));
vi.mock('../../../hooks/useUserPortal', () => ({
  useUserPortalPublications: () =>
    publications.error
      ? { data: undefined, isPending: false, isError: true, error: publications.error, refetch: publications.refetch }
      : { data: { environments: publications.environments, unpublishing: publications.unpublishing, notGivenBack: publications.notGivenBack }, isPending: false, isError: false, error: null, refetch: publications.refetch },
  useUnpublishFromUserPortal: () => finish,
  useUserPortals: (environments: string[]) => environments.map((environment) => ({ data: { environment, state: 'active', url: publications.portalUrl } })),
}));
vi.mock('../../../hooks/useEndpointTestAccess', () => ({
  useEndpointTestAccess: (...args: unknown[]) => {
    testAccessCalls.push(args);
    return useSyncExternalStore(access.subscribe, access.get);
  },
}));

const management: EnvEndpoint = {
  id: 'workflow-ma-cf1',
  releaseId: 'release-1',
  environmentId: '',
  displayName: 'Workflow Management API',
  type: 'REST',
  visibility: 'Public',
  port: 8234,
  publicUrl: GATEWAY_URL,
};
const business: EnvEndpoint = { ...management, id: 'processorder', displayName: 'Order Processor API', port: 9090, publicUrl: 'https://gw.example.dev/default/orders-processorder/v1.0' };

const TARGET: WorkflowTarget = {
  componentId: 'orders',
  environmentId: 'development',
  trackId: 'track-1',
  deployment: { releaseId: 'release-1', deploymentStatusV2: 'ACTIVE' },
  isDeploymentLoading: false,
};
const SCOPE = 'orders|release-1|development';

function keyAccess(patch: Partial<EndpointTestAccess> = {}): EndpointTestAccess {
  return {
    gatewayUrl: GATEWAY_URL,
    aiGateway: null,
    mcpUrl: `${GATEWAY_URL}/mcp`,
    mode: 'api-key',
    authHeader: 'X-API-Key',
    apiKey: 'key-1',
    // Minted as the test starts: a refusal of it is not a stale key.
    keyMintedAt: Date.now(),
    isAuthorized: true,
    isMinting: false,
    canCreateKey: true,
    keyError: null,
    needsApiKeyAuth: false,
    canSwitch: true,
    managedIn: null,
    isSwitching: false,
    switchToApiKey: vi.fn(async () => null),
    isUnavailable: false,
    securityError: null,
    isResolving: false,
    mintKey: vi.fn(async () => null),
    renewKey: vi.fn(async () => null),
    retryUnauthorized: vi.fn(),
    ...patch,
  };
}

const fetchMock = vi.fn<typeof fetch>();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

let root: Root;
let container: HTMLDivElement;
let queryClient: QueryClient;
// What the hook last returned; cleared before each test, so a wait never reads the previous test's.
let rendered: WorkflowApi | undefined;

function Harness({ target }: { target: WorkflowTarget }) {
  rendered = useWorkflowApi(target);
  return null;
}

/** The hook's latest result; a test only reads it once a wait has seen it rendered. */
function current(): WorkflowApi {
  if (!rendered) throw new Error('the hook has not rendered yet');
  return rendered;
}

/** The ready client, for a test that has waited for the connection to be ready. */
function readyClient() {
  const { client } = current();
  if (!client) throw new Error('expected a ready client');
  return client;
}

function mount(target: WorkflowTarget = TARGET) {
  root.render(
    <QueryClientProvider client={queryClient}>
      <Harness target={target} />
    </QueryClientProvider>,
  );
}

const status = () => rendered?.connection.status;

/** The headers of the requests sent to `url`, in order. */
const sentTo = (url: string) => fetchMock.mock.calls.filter(([to]) => to === url).map(([, init]) => init?.headers as Record<string, string>);

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  queryClient = new QueryClient();
  endpoints.list = [business, management];
  endpoints.releaseIds = [];
  testAccessCalls.length = 0;
  publications.environments = [];
  publications.unpublishing = [];
  publications.notGivenBack = [];
  publications.error = null;
  finish.mutate.mockReset();
  role.canDeploy = true;
  publications.refetch.mockReset();
  publications.portalUrl = undefined;
  rendered = undefined;
  access.reset(keyAccess());
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(json({ taskQueue: 'orders-queue' }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  root.unmount();
  container.remove();
  queryClient.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useWorkflowConnection', () => {
  it('connects to the management endpoint through its gateway URL, with the test key alone', async () => {
    mount();
    await vi.waitFor(() => expect(status()).toBe('ready'));

    expect(sentTo(`${GATEWAY_URL}/runtime`)[0]).toEqual({ 'X-API-Key': 'key-1' });
    expect(current().connection).toMatchObject({ baseUrl: GATEWAY_URL, scopeId: SCOPE, endpointName: 'workflow-ma-cf1', runtime: { taskQueue: 'orders-queue' } });
    // The endpoint the test key is for, and its discovered public URL as the gateway URL fallback.
    expect(testAccessCalls.at(-1)).toEqual([
      { componentName: 'orders', environmentName: 'development', endpointName: 'workflow-ma-cf1', deploymentTrackId: 'track-1' },
      { enabled: true, mint: true, gatewayUrlFallback: GATEWAY_URL },
    ]);
  });

  // Publishing redeploys the workflow to take only User Portal sign-ins, so no test key opens it.
  it('steps aside for a workflow published to the User Portal in the environment, asking for no test key', async () => {
    publications.environments = ['development'];
    mount();
    await vi.waitFor(() => expect(current().connection).toMatchObject({ status: 'unavailable', reason: 'published-to-user-portal', notice: { severity: 'info' }, action: null }));
    expect(testAccessCalls.every(([, options]) => (options as { mint: boolean }).mint === false)).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('offers to open the User Portal a workflow is published to', async () => {
    publications.environments = ['development'];
    publications.portalUrl = 'https://portal.example/acme';
    mount();
    await vi.waitFor(() => expect(current().connection).toMatchObject({ status: 'unavailable', reason: 'published-to-user-portal', action: { label: 'Open User Portal', href: 'https://portal.example/acme' } }));
  });

  // Unpublishing answers before the workflow is redeployed to take the console's key, so the views wait for that rather
  // than offer to switch the API to API key. The User Portal reads have its security read again once it ends.
  it('waits while an unpublished workflow is given back to the console, then connects', async () => {
    publications.unpublishing = ['development'];
    mount();
    await vi.waitFor(() => expect(current().connection).toMatchObject({ status: 'unavailable', reason: 'unpublishing-from-user-portal', notice: { severity: 'info' }, action: null }));
    expect(testAccessCalls.every(([, options]) => (options as { mint: boolean }).mint === false)).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();

    publications.unpublishing = [];
    mount();
    await vi.waitFor(() => expect(status()).toBe('ready'));
  });

  // Its API may still take only User Portal sign-ins, so a switch to API key would leave the workflow refusing the key.
  it('offers to finish unpublishing a workflow that could not be given back, rather than switching its API', async () => {
    publications.notGivenBack = ['development'];
    mount();
    await vi.waitFor(() => expect(current().connection).toMatchObject({ status: 'unavailable', reason: 'not-given-back', notice: { severity: 'warning' }, action: { label: 'Finish unpublishing' } }));
    expect(testAccessCalls.every(([, options]) => (options as { mint: boolean }).mint === false)).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    const { connection } = current();
    if (connection.status !== 'unavailable' || !connection.action || !('run' in connection.action)) throw new Error('expected a finish to run');
    connection.action.run();
    expect(finish.mutate).toHaveBeenCalledWith({ componentId: 'orders', environment: 'development' });

    role.canDeploy = false;
    mount();
    await vi.waitFor(() => expect(current().connection).toMatchObject({ status: 'unavailable', reason: 'not-given-back', action: null }));
  });

  it('connects as before to a workflow published to the User Portal only in another environment', async () => {
    publications.environments = ['production'];
    mount();
    await vi.waitFor(() => expect(status()).toBe('ready'));
  });

  // Unread, a published workflow's views would offer to switch its API back to API key, which ipaas-service refuses there.
  it('stops on a failed read of where the workflow is published, asking for no test key, and reads it again on retry', async () => {
    publications.error = new BffError(500, '{"message":"boom"}');
    mount();
    await vi.waitFor(() => expect(current().connection).toMatchObject({ status: 'error', message: 'Could not check whether this workflow is published to the User Portal.' }));
    expect(testAccessCalls.every(([, options]) => (options as { mint: boolean }).mint === false)).toBe(true);
    const { connection } = current();
    if (connection.status !== 'error') throw new Error('expected an error');
    connection.retry();
    expect(publications.refetch).toHaveBeenCalled();
  });

  it('connects as before when the BFF serves no User Portal', async () => {
    publications.error = new BffError(404, '');
    mount();
    await vi.waitFor(() => expect(status()).toBe('ready'));
  });

  it('lists only the task queue the integration reports, since every integration in an environment shares its namespace', async () => {
    mount();
    await vi.waitFor(() => expect(status()).toBe('ready'));

    fetchMock.mockResolvedValueOnce(json({ items: [] }));
    await readyClient().instances.list({ status: 'RUNNING' });
    const listed = fetchMock.mock.calls.map(([to]) => String(to)).find((to) => to.startsWith(`${GATEWAY_URL}/workflows`)) ?? '';
    expect(new URL(listed).searchParams.get('taskQueue')).toBe('orders-queue');
  });

  it('drops what was read for the old task queue when a redeploy moves the worker to another', async () => {
    mount();
    await vi.waitFor(() => expect(status()).toBe('ready'));
    const runsKey = workflowKeys.instances(SCOPE, { status: 'RUNNING' });
    queryClient.setQueryData(runsKey, { items: ['a run on the old queue'] });

    queryClient.setQueryData(workflowKeys.runtime(SCOPE), { taskQueue: 'moved-queue' });
    await vi.waitFor(() => expect(current().connection).toMatchObject({ runtime: { taskQueue: 'moved-queue' } }));
    await vi.waitFor(() => expect(queryClient.getQueryData(runsKey)).toBeUndefined());
    // The probe itself is kept, so the connection stays up.
    expect(status()).toBe('ready');

    fetchMock.mockClear();
    fetchMock.mockResolvedValueOnce(json({ items: [] }));
    await readyClient().reviews.list({});
    const listed = fetchMock.mock.calls.map(([to]) => String(to)).find((to) => to.startsWith(`${GATEWAY_URL}/review-activities`)) ?? '';
    expect(new URL(listed).searchParams.get('taskQueue')).toBe('moved-queue');
  });

  it('sends no credential to an endpoint the gateway leaves open', async () => {
    access.reset(keyAccess({ mode: 'none', apiKey: null }));
    mount();
    await vi.waitFor(() => expect(status()).toBe('ready'));
    expect(sentTo(`${GATEWAY_URL}/runtime`)[0]).toEqual({});
  });

  it('says the track is not deployed, with the status it is in, and asks for nothing', async () => {
    mount({ ...TARGET, deployment: null, isDeploymentLoading: true });
    await vi.waitFor(() => expect(status()).toBe('loading'));

    mount({ ...TARGET, deployment: null });
    await vi.waitFor(() => expect(current().connection).toEqual({ status: 'not-deployed', deploymentStatus: null }));

    mount({ ...TARGET, deployment: { releaseId: 'release-1', deploymentStatusV2: 'IN_PROGRESS' } });
    await vi.waitFor(() => expect(current().connection).toEqual({ status: 'not-deployed', deploymentStatus: 'IN_PROGRESS' }));
    expect(endpoints.releaseIds.every((id) => id === '')).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is unavailable when the release lists no management endpoint', async () => {
    endpoints.list = [business];
    mount();
    await vi.waitFor(() => expect(current().connection).toMatchObject({ status: 'unavailable', reason: 'no-endpoint', notice: { text: 'This integration has no workflow management endpoint.' } }));
  });

  it('says the management API is not exposed on the gateway yet, as the Test Console does', async () => {
    access.reset(keyAccess({ apiKey: null, isAuthorized: false, mode: null, isUnavailable: true, gatewayUrl: '', securityError: Object.assign(new Error('HTTP 409'), { status: 409 }) }));
    mount();
    await vi.waitFor(() => expect(current().connection).toMatchObject({ status: 'unavailable', reason: 'not-exposed', notice: { severity: 'info' } }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('leaves switching an endpoint that takes no test key to API key to the person', async () => {
    const mintKey = vi.fn(async () => 'key-1');
    const switchToApiKey = vi.fn(async () => 'key-1');
    access.reset(keyAccess({ apiKey: null, isAuthorized: false, mode: 'jwt', needsApiKeyAuth: true, mintKey, switchToApiKey }));
    mount();
    await vi.waitFor(() => expect(current().connection).toMatchObject({ status: 'unavailable', reason: 'needs-api-key' }));
    expect(switchToApiKey).not.toHaveBeenCalled();

    const { connection } = current();
    if (connection.status !== 'unavailable' || !connection.action || !('run' in connection.action)) throw new Error('expected an action to run');
    expect(connection.action.label).toBe('Switch to API key');
    connection.action.run();
    expect(switchToApiKey).toHaveBeenCalledTimes(1);
    expect(mintKey).not.toHaveBeenCalled();
  });

  it('offers no switch to a role that may not make it', async () => {
    access.reset(keyAccess({ apiKey: null, isAuthorized: false, mode: 'jwt', needsApiKeyAuth: true, canSwitch: false }));
    mount();
    await vi.waitFor(() => expect(current().connection).toMatchObject({ status: 'unavailable', reason: 'needs-api-key', action: null }));
  });

  it('says where an environment that takes its security by promotion gets it, and offers no switch there', async () => {
    access.reset(keyAccess({ apiKey: null, isAuthorized: false, mode: 'jwt', needsApiKeyAuth: true, canSwitch: false, managedIn: 'development' }));
    mount();
    await vi.waitFor(() => expect(current().connection).toMatchObject({ status: 'unavailable', reason: 'secured-by-promotion', action: null }));
  });

  it('says a role that may not create test keys cannot reach the API, and offers nothing to retry', async () => {
    const mintKey = vi.fn(async () => null);
    access.reset(keyAccess({ apiKey: null, isAuthorized: false, canCreateKey: false, keyError: "Your role can't create test keys.", mintKey }));
    mount();
    await vi.waitFor(() => expect(current().connection).toMatchObject({ status: 'unavailable', reason: 'key-refused', action: null }));
    expect(mintKey).not.toHaveBeenCalled();
  });

  it('says the integration does not serve the API when the probe answers 404', async () => {
    fetchMock.mockResolvedValue(json({ error: { message: 'no such route' } }, 404));
    mount();
    await vi.waitFor(() => expect(current().connection).toMatchObject({ status: 'unavailable', reason: 'api-disabled' }));
  });

  it('reports refused credentials when a fresh key is refused, without minting again', async () => {
    const mintKey = vi.fn(async () => null);
    const renewKey = vi.fn(async () => null);
    access.reset(keyAccess({ mintKey, renewKey }));
    fetchMock.mockResolvedValue(json({}, 401));
    mount();
    await vi.waitFor(() => expect(current().connection).toMatchObject({ status: 'refused', message: 'The gateway rejected the test key. It may have expired.' }));
    expect(mintKey).not.toHaveBeenCalled();
    expect(renewKey).not.toHaveBeenCalled();
  });

  it('renews an old key when it is refused, then reads the refused data again with the new one', async () => {
    const start = Date.now();
    const now = vi.spyOn(Date, 'now').mockReturnValue(start);
    const renewKey = vi.fn(async () => {
      access.set({ apiKey: 'key-2' });
      return 'key-2';
    });
    access.reset(keyAccess({ renewKey }));
    mount();
    await vi.waitFor(() => expect(status()).toBe('ready'));
    const client = readyClient();

    // An hour on, the key has expired and a read is refused.
    now.mockReturnValue(start + 61 * 60_000);
    fetchMock.mockResolvedValueOnce(json({}, 401));
    await queryClient.fetchQuery({ queryKey: workflowKeys.definitions(SCOPE), queryFn: () => client.definitions.list(), retry: false }).catch(() => undefined);

    await vi.waitFor(() => expect(renewKey).toHaveBeenCalledTimes(1));
    // Only the refused key is renewed: one another view had renewed already would be reused.
    expect(renewKey).toHaveBeenCalledWith('key-1');
    // The probe is read again, now with the new key.
    await vi.waitFor(() => expect(sentTo(`${GATEWAY_URL}/runtime`).at(-1)?.['X-API-Key']).toBe('key-2'));
    expect(status()).toBe('ready');
  });

  it('keeps one client for the connection while the key changes under it', async () => {
    mount();
    await vi.waitFor(() => expect(status()).toBe('ready'));
    const first = current().client;

    access.set({ apiKey: 'key-2' });
    await vi.waitFor(() => expect(testAccessCalls.length).toBeGreaterThan(2));
    expect(current().client).toBe(first);
  });
});
