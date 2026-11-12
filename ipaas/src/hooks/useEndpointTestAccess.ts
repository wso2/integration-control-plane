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

import { useCallback, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DEFAULT_API_KEY_HEADER } from '../constants/apiConsumption';
import { isCompleteRef, useCreateEndpointTestKey, useEnableEndpointApiKeyAuth, useEndpointSecurity } from './useConsumers';
import type { ApiKeyResult, EndpointRef, SecurityMode } from '../types/consumers';
import { codedApiError, friendlyApiError } from '../utils/apiSecurity';
import { httpStatusOf, isApiKeyAuthRequired, isPermissionError } from '../utils/apiErrors';
import { aiGatewayAccessOf, mcpUrlOf, type AiGatewayAccess } from '../utils/mcpGateway';
import { Scopes } from '../constants/permissions';
import { useCan } from './useCan';

export interface EndpointTestAccess {
  /**
   * The enforcing API Platform gateway invoke URL for the endpoint — the ONLY URL
   * a cloud caller may invoke. Empty until resolved, and empty forever if the
   * endpoint is not exposed; never substitute the endpoint's own external route,
   * which is open (the policy engine is not in its path), because presenting a
   * credential there discloses it to a host that does not validate it and makes an
   * unenforced call look like a secured one. Wait, or report `isUnavailable`.
   */
  gatewayUrl: string;
  /**
   * Set when Agent Manager's AI gateway fronts the endpoint, as it does an MCP server. No test key is minted for it
   * unasked: the gateway answers no browser's CORS preflight, so the page calls it through ipaas-service's relay,
   * which holds a key of its own. `mintKey` mints one for another MCP client. `null` for the API Platform.
   */
  aiGateway: AiGatewayAccess | null;
  /** The URL an MCP client connects to on the gateway, or '' while there is none. */
  mcpUrl: string;
  /** Active auth mode of the exposed API; `null` until it is known. */
  mode: SecurityMode | null;
  /** Request header the credential must be sent in. */
  authHeader: string;
  /** Plaintext test key, or `null` when none is held (or none is needed). */
  apiKey: string | null;
  /** When the held key was minted (epoch ms), or 0 when none is held. */
  keyMintedAt: number;
  /** True once a credential is held, or none is required because the API is open. */
  isAuthorized: boolean;
  /** A key is being minted for this view: it holds none yet, or it asked for a new one. A held key's background renewal does not count. */
  isMinting: boolean;
  /** The role may create test keys. Without it, no test-key request is sent. */
  canCreateKey: boolean;
  /** Minting failed, or the role can't mint for an endpoint that needs a key, as a message the user can act on. */
  keyError: string | null;
  /** The endpoint uses another auth mode (jwt, or a refused test key says so), so it takes no test key until switched to API-key auth. */
  needsApiKeyAuth: boolean;
  /**
   * The role may switch the endpoint to API-key auth, and the environment may change the API's security. Never for an AI
   * agent: its security comes from Agent Manager, while the switch edits the API Platform's API. Never where the API's
   * security comes only by promotion (`managedIn`): ipaas-service refuses the switch there.
   */
  canSwitch: boolean;
  /**
   * The environment the API's security is changed in, when this one takes it only by promotion from there; null when it
   * is changed here.
   */
  managedIn: string | null;
  /** The endpoint is being switched to API-key auth. */
  isSwitching: boolean;
  /** Switch the endpoint to API-key auth, then mint. Resolves to the plaintext, or `null` on failure. */
  switchToApiKey: () => Promise<string | null>;
  /**
   * The endpoint cannot be reached through the gateway: its security config could
   * not be read (usually "not exposed as an API yet"), or it is exposed but
   * advertises no gateway URL. Distinct from "still resolving", so callers can show
   * a terminal state instead of an endless spinner.
   */
  isUnavailable: boolean;
  /** The security read's failure, for `endpointLoadNotice` — 409 is a state, other statuses are not. */
  securityError: unknown;
  /** The endpoint's security is still being read, so which gateway fronts it, and how, is not known yet. */
  isResolving: boolean;
  /**
   * Mint a new test key, for an explicit action such as regenerating one. Every view of the
   * endpoint moves to it. Resolves to the plaintext, or `null` on failure.
   */
  mintKey: () => Promise<string | null>;
  /**
   * Renew the key after `refused` was turned down. Mints only while `refused` is still the held
   * key; when another view has renewed it already, resolves to that key instead, so views that
   * hear the same refusal don't mint one key each. Resolves to `null` on failure.
   */
  renewKey: (refused: string | null) => Promise<string | null>;
  /** Renew the key once per endpoint after a 401: a test key expires, and another tab may reap it. */
  retryUnauthorized: () => void;
}

const MINT_FAILED = 'Could not mint a test key.';
const MINT_REFUSED = "Your role can't create test keys.";

/** How long a test key lasts when its mint states no expiry: ipaas-service's test-key TTL. */
const DEFAULT_KEY_VALIDITY_MS = 60 * 60_000;
/** A key is renewed this long before it expires. */
const RENEW_BEFORE_EXPIRY_MS = 60_000;
/**
 * The shortest time a key is kept, unless it states a shorter life, when it is kept for half of it. A
 * stated expiry is read against this browser's clock, so a clock running ahead of the server's can
 * make a key look nearly spent; this bounds what that costs, while a key that really is short-lived
 * is still renewed before it expires.
 */
const MIN_KEY_LIFE_MS = 5 * 60_000;
/** However spent a key looks, it is kept this long, so a clock far ahead of the server's can't mint in a loop. */
const MIN_RENEW_GAP_MS = 30_000;
/** After a failed renewal, how long until the next try (the held key may still be valid meanwhile). */
const RENEW_RETRY_MS = 30_000;
/**
 * A held key outlives the views that use it by this long, so coming back to one reuses it. It is a
 * plaintext credential kept in the shared query cache, so a cache persister added later must leave
 * out `heldKeyQueryKey` queries.
 */
const HELD_KEY_GC_MS = DEFAULT_KEY_VALIDITY_MS;
/** The longest delay a browser timer honours; a longer one fires at once. */
const MAX_TIMER_MS = 2 ** 31 - 1;

/** Identity of the endpoint a minted key belongs to, so a key can never leak across endpoints. */
const keyOf = (ref: EndpointRef | null | undefined): string => `${ref?.componentName ?? ''}|${ref?.environmentName ?? ''}|${ref?.endpointName ?? ''}|${ref?.deploymentTrackId ?? ''}`;

/** A minted test key, held once per endpoint for every view of it. */
interface HeldKey {
  key: string;
  /** When it was minted (epoch ms). */
  mintedAt: number;
  /** When to mint again (epoch ms): a minute before it expires. */
  renewAt: number;
}

const heldKeyQueryKey = (refKey: string) => ['endpoint-test-key', refKey] as const;

/**
 * When a key minted at `mintedAt` is renewed: a minute before it expires. Its lifetime is the one
 * `expiresAt` states, capped at the default validity: `expiresAt` comes from the server's clock, and
 * read against a browser clock running behind, it would put the renewal after the real expiry. It is
 * kept at least `MIN_KEY_LIFE_MS`, or half its stated lifetime if that is shorter, and never less than
 * `MIN_RENEW_GAP_MS`.
 */
export function keyRenewalTime(expiresAt: string | undefined, mintedAt: number): number {
  const stated = expiresAt ? Date.parse(expiresAt) : Number.NaN;
  const lifetime = Number.isFinite(stated) ? Math.min(stated - mintedAt, DEFAULT_KEY_VALIDITY_MS) : DEFAULT_KEY_VALIDITY_MS;
  const shortest = Math.min(Math.max(lifetime / 2, MIN_RENEW_GAP_MS), MIN_KEY_LIFE_MS);
  return mintedAt + Math.max(lifetime - RENEW_BEFORE_EXPIRY_MS, shortest);
}

/** Mints through `mint`, the test-key mutation, so a refusal reaches the mutation cache's listeners (the permission notice). */
async function mintHeldKey(mint: (target: EndpointRef) => Promise<ApiKeyResult>, target: EndpointRef): Promise<HeldKey> {
  const mintedAt = Date.now();
  const result = await mint(target);
  // An answer without a key is a failed mint: held as one, a view that mounts tries again.
  if (!result?.apiKey) throw new Error('The test-key route answered without a key.');
  return { key: result.apiKey, mintedAt, renewAt: keyRenewalTime(result.expiresAt, mintedAt) };
}

/**
 * Test-time access to a deployed endpoint exposed on the API Platform gateway:
 * the enforcing invoke URL, the active auth mode, and a short-lived test key.
 *
 * Product-agnostic by construction — it acts only on the `ref` it is given, so
 * the caller (which knows whether it is a cloud build) passes `null` when the
 * APIM path applies instead. Shared by the AI agent chat, the MCP tools list and
 * the swagger test console.
 *
 * A key is minted automatically only when `api-key` is the active mode — that is
 * the auto-expose default — and never for an AI gateway endpoint, which gets one
 * only from `mintKey`. For another mode, ipaas-service refuses a test key
 * (`needsApiKeyAuth`) until the caller switches the endpoint with `switchToApiKey()`,
 * which changes how every caller of the API authenticates.
 *
 * The key is held once per endpoint, not once per view: every view of an endpoint, and every
 * later visit to one, uses the same key until shortly before it expires, and only one mint is in
 * flight for it at a time. ipaas-service keeps only the newest few test keys of an API and revokes
 * the rest, so a key per view would revoke keys that other views are still using.
 */
interface TestAccessOptions {
  enabled?: boolean;
  /**
   * Whether a test key may be minted for the endpoint yet. The security is read either way, so a caller that must
   * settle something first loses no time reading it.
   */
  mint?: boolean;
  /** The gateway URL endpoint discovery returned, for when the security read carries none. */
  gatewayUrlFallback?: string;
  /** An AI agent's test key comes from Agent Manager, which also checks `amp:agent:api-key-manage`. */
  agent?: boolean;
}

export function useEndpointTestAccess(ref: EndpointRef | null | undefined, { enabled = true, mint = true, gatewayUrlFallback = '', agent = false }: TestAccessOptions = {}): EndpointTestAccess {
  const { data: security, isError: isSecurityError, error: securityError, isLoading: isSecurityLoading } = useEndpointSecurity(ref, enabled);
  const can = useCan();
  const canCreateKey = can(Scopes.ENDPOINT_TEST) && (!agent || can(Scopes.AGENT_API_KEY_MANAGE));
  const canSwitch = canCreateKey && !agent && can(Scopes.ENDPOINT_UPDATE);
  const queryClient = useQueryClient();
  const { mutateAsync: createKeyFor } = useCreateEndpointTestKey();
  const enableApiKeyAuth = useEnableEndpointApiKeyAuth();

  // Each request goes to the endpoint it was started for, and its result is stored against that
  // endpoint, so a response that lands after the selection moved on is ignored by construction.
  const refKey = keyOf(ref);
  // The endpoint by identity: a caller's new object for the same endpoint must not re-run the auto-mint.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const endpoint = useMemo(() => ref, [refKey]);
  const [switchFailure, setSwitchFailure] = useState<{ refKey: string; message: string } | null>(null);

  const aiGateway = aiGatewayAccessOf(security, securityError);
  const mintable = canCreateKey && mint;
  // A key is minted unasked for the API Platform only. On the AI gateway the Test page's relay holds a key of its
  // own, so one there is for another MCP client: minted only when asked for, and not renewed.
  const autoMint = mintable && !aiGateway;
  const managedIn = security?.editable === false ? security.entryEnvironment || 'the first environment' : null;
  const switchable = canSwitch && !aiGateway && managedIn === null;
  const mode = security?.mode ?? null;

  const held = useQuery({
    queryKey: heldKeyQueryKey(refKey),
    queryFn: () => mintHeldKey(createKeyFor, endpoint!),
    // Auto-mint for an api-key-secured endpoint only: for another mode the test-key route answers 409.
    enabled: enabled && isCompleteRef(endpoint) && autoMint && mode === 'api-key',
    // Fresh until it is due for renewal, so a view that mounts later uses the held key.
    staleTime: (query) => Math.max((query.state.data?.renewAt ?? 0) - Date.now(), 0),
    gcTime: HELD_KEY_GC_MS,
    // Renewed ahead of expiry while a view is open. A hidden tab renews when it is shown again,
    // since the key is stale by then.
    refetchInterval: (query) => {
      const { data, status, error } = query.state;
      if (!data) return false;
      // A failed renewal keeps the held key, whose renewal time has passed: try again after a pause,
      // and not at all for a refusal another try can't change.
      if (status === 'error') return error && (isPermissionError(error) || isApiKeyAuthRequired(error)) ? false : RENEW_RETRY_MS;
      return Math.min(Math.max(data.renewAt - Date.now(), 1_000), MAX_TIMER_MS);
    },
    // A failed mint is not retried on focus or reconnect; a view that mounts tries once more, and
    // the views offer the way out (switch, retry).
    retry: false,
    refetchOnWindowFocus: (query) => query.state.status !== 'error',
    refetchOnReconnect: (query) => query.state.status !== 'error',
  });

  // A key nothing renews is shown only until it is due for renewal, so the view never offers one about to lapse.
  const apiKey = held.data && (autoMint || Date.now() < held.data.renewAt) ? held.data.key : null;
  const needsKey = !aiGateway && (mode === 'api-key' || mode === 'jwt');
  // A mint in flight is the answer to the last failure, so the failure is not shown meanwhile.
  const mintError = held.isFetching ? null : held.error;
  const apiKeyRequired = !!mintError && isApiKeyAuthRequired(mintError);
  // The API Platform's reading of a 404 or 409, an endpoint not exposed as an API yet, doesn't apply on the AI gateway.
  const gatewayMisread = !!aiGateway && !!mintError && !codedApiError(mintError) && [404, 409].includes(httpStatusOf(mintError));
  const mintFailure = mintError && !apiKeyRequired && !isPermissionError(mintError) ? (gatewayMisread ? MINT_FAILED : friendlyApiError(mintError, MINT_FAILED)) : null;
  const keyError = !canCreateKey && needsKey ? MINT_REFUSED : switchFailure?.refKey === refKey ? switchFailure.message : mintFailure;

  const mintFor = useCallback(
    async (target: EndpointRef, refused?: string | null): Promise<string | null> => {
      // An AI gateway binding that checks no key takes none.
      if (!mintable || (aiGateway && mode !== 'api-key')) return null;
      const queryKey = heldKeyQueryKey(keyOf(target));
      if (refused !== undefined) {
        // Another view renewed the refused key already: use theirs rather than mint again.
        const current = queryClient.getQueryData<HeldKey>(queryKey)?.key ?? null;
        if (current && current !== refused) return current;
      }
      try {
        // Mints even though a key is held; a mint already in flight for the endpoint is joined, not repeated.
        const minted = await queryClient.fetchQuery({ queryKey, queryFn: () => mintHeldKey(createKeyFor, target), staleTime: 0, gcTime: HELD_KEY_GC_MS, retry: false });
        return minted.key;
      } catch {
        // The failure is on the held key's query, where every view of the endpoint reads it.
        return null;
      }
    },
    [mintable, aiGateway, mode, queryClient, createKeyFor],
  );
  // Mints a view asked for, which it shows as minting even while it holds a key.
  const [requestedMints, setRequestedMints] = useState(0);
  const mintKey = useCallback(async () => {
    if (!endpoint) return null;
    setRequestedMints((n) => n + 1);
    try {
      return await mintFor(endpoint);
    } finally {
      setRequestedMints((n) => n - 1);
    }
  }, [endpoint, mintFor]);
  const renewKey = useCallback(async (refused: string | null) => (endpoint ? mintFor(endpoint, refused) : null), [endpoint, mintFor]);

  // One renewal per endpoint: a fresh key 401s the same way when the cause is not the key,
  // so retrying per credential would mint without end.
  const retriedFor = useRef<string | null>(null);
  const retryUnauthorized = useCallback(() => {
    // An open endpoint's 401 is not a stale key, and minting would switch it to api-key auth.
    if (!autoMint || mode !== 'api-key') return;
    if (retriedFor.current === refKey) return;
    retriedFor.current = refKey;
    void renewKey(apiKey);
  }, [autoMint, mode, refKey, renewKey, apiKey]);

  const { mutateAsync: enableApiKeyAuthFor } = enableApiKeyAuth;
  const switchToApiKey = useCallback(async (): Promise<string | null> => {
    if (!endpoint || !switchable) return null;
    const target = endpoint;
    setSwitchFailure(null);
    try {
      await enableApiKeyAuthFor(target);
    } catch (err) {
      if (!isPermissionError(err)) setSwitchFailure({ refKey: keyOf(target), message: friendlyApiError(err, 'Could not switch the endpoint to API key.') });
      return null;
    }
    // Once the mode reads as api-key the held key's query would mint too; it joins this mint instead.
    return mintFor(target);
  }, [endpoint, switchable, enableApiKeyAuthFor, mintFor]);

  // Endpoint security describes enforcement and may not carry an invoke URL. Release-scoped
  // endpoint discovery already returns the APIP Public URL, so callers that have it can provide
  // that authoritative gateway address without making a missing optional field look like an
  // unexposed API.
  const gatewayUrl = security?.publicUrl || gatewayUrlFallback;
  const mcpUrl = mcpUrlOf(gatewayUrl, aiGateway);

  return {
    gatewayUrl,
    aiGateway,
    mcpUrl,
    mode,
    authHeader: security?.apiKey?.header || DEFAULT_API_KEY_HEADER,
    apiKey,
    keyMintedAt: apiKey ? (held.data?.mintedAt ?? 0) : 0,
    // An open (mode `none`) endpoint needs no credential; anything else does.
    isAuthorized: mode === 'none' || !!apiKey,
    // A held key's renewal runs in the background: the view keeps using the key meanwhile.
    isMinting: (held.isFetching && !apiKey) || requestedMints > 0,
    canCreateKey,
    keyError,
    needsApiKeyAuth: autoMint && ((mode === 'jwt' && !apiKey) || apiKeyRequired),
    canSwitch: switchable,
    managedIn,
    isSwitching: enableApiKeyAuth.isPending && keyOf(enableApiKeyAuth.variables) === refKey,
    switchToApiKey,
    // A disabled/incomplete ref leaves both terms false, so an idle hook never
    // reports unavailable — only a real answer does.
    // AI gateway deployment states report through `aiGateway`; a resolved mode with no
    // URL is still terminal, including a deployed open binding whose URL is absent.
    isUnavailable: (!aiGateway && isSecurityError) || (mode !== null && !mcpUrl),
    securityError,
    isResolving: isSecurityLoading,
    mintKey,
    renewKey,
    retryUnauthorized,
  };
}
