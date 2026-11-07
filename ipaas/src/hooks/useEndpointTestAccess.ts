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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_API_KEY_HEADER } from '../constants/apiConsumption';
import { useCreateEndpointTestKey, useEnableEndpointApiKeyAuth, useEndpointSecurity } from './useConsumers';
import type { EndpointRef, SecurityMode } from '../types/consumers';
import { friendlyApiError } from '../utils/apiSecurity';
import { isApiKeyAuthRequired, isPermissionError } from '../utils/apiErrors';
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
   * Set when Agent Manager's AI gateway fronts the endpoint, as it does an MCP server. No test key is minted for it:
   * the AI gateway issues keys only to Agent Manager agents. `null` for the API Platform.
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
  /** True once a credential is held, or none is required because the API is open. */
  isAuthorized: boolean;
  /** A key is being minted right now. */
  isMinting: boolean;
  /** The role may create test keys. Without it, no test-key request is sent. */
  canCreateKey: boolean;
  /** Minting failed, or the role can't mint for an endpoint that needs a key, as a message the user can act on. */
  keyError: string | null;
  /** The endpoint uses another auth mode (jwt, or a refused test key says so), so it takes no test key until switched to API-key auth. */
  needsApiKeyAuth: boolean;
  /**
   * The role may switch the endpoint to API-key auth. Never for an AI agent: its security comes from Agent Manager,
   * while the switch edits the API Platform's API.
   */
  canSwitch: boolean;
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
  /** Mint (or replace) the test key. Resolves to the plaintext, or `null` on failure. */
  mintKey: () => Promise<string | null>;
  /** Re-mint after a 401, once per key — a test key expires, and another surface may reap it. */
  retryUnauthorized: () => void;
}

const MINT_FAILED = 'Could not mint a test key.';
const MINT_REFUSED = "Your role can't create test keys.";

/** Identity of the endpoint a minted key belongs to, so a key can never leak across endpoints. */
const keyOf = (ref: EndpointRef | null | undefined): string => `${ref?.componentName ?? ''}|${ref?.environmentName ?? ''}|${ref?.endpointName ?? ''}|${ref?.deploymentTrackId ?? ''}`;

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
 * the auto-expose default. For another mode, ipaas-service refuses a test key
 * (`needsApiKeyAuth`) until the caller switches the endpoint with `switchToApiKey()`,
 * which changes how every caller of the API authenticates.
 */
interface TestAccessOptions {
  enabled?: boolean;
  /** The gateway URL endpoint discovery returned, for when the security read carries none. */
  gatewayUrlFallback?: string;
  /** An AI agent's test key comes from Agent Manager, which also checks `amp:agent:api-key-manage`. */
  agent?: boolean;
}

export function useEndpointTestAccess(ref: EndpointRef | null | undefined, { enabled = true, gatewayUrlFallback = '', agent = false }: TestAccessOptions = {}): EndpointTestAccess {
  const { data: security, isError: isSecurityError, error: securityError } = useEndpointSecurity(ref, enabled);
  const can = useCan();
  const canCreateKey = can(Scopes.ENDPOINT_TEST) && (!agent || can(Scopes.AGENT_API_KEY_MANAGE));
  const canSwitch = canCreateKey && !agent && can(Scopes.ENDPOINT_UPDATE);
  const createTestKey = useCreateEndpointTestKey();
  const enableApiKeyAuth = useEnableEndpointApiKeyAuth();

  // Each request goes to the endpoint it was started for, and its result is stored against that
  // endpoint, so a response that lands after the selection moved on is ignored by construction.
  const refKey = keyOf(ref);
  // The endpoint by identity: a caller's new object for the same endpoint must not re-run the auto-mint.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const endpoint = useMemo(() => ref, [refKey]);
  const [minted, setMinted] = useState<{ refKey: string; key: string | null } | null>(null);
  const [failure, setFailure] = useState<{ refKey: string; message: string } | null>(null);
  const [apiKeyRequiredFor, setApiKeyRequiredFor] = useState<string | null>(null);

  const aiGateway = aiGatewayAccessOf(security, securityError);
  // The test-key routes refuse an AI gateway endpoint, so none of the minting below applies to it.
  const mintable = canCreateKey && !aiGateway;
  const switchable = canSwitch && !aiGateway;
  const mode = security?.mode ?? null;
  const apiKey = minted?.refKey === refKey ? minted.key : null;
  const needsKey = !aiGateway && (mode === 'api-key' || mode === 'jwt');
  const keyError = !canCreateKey && needsKey ? MINT_REFUSED : failure?.refKey === refKey ? failure.message : null;

  const { mutateAsync: createKeyFor } = createTestKey;
  const mintFor = useCallback(
    async (target: EndpointRef): Promise<string | null> => {
      if (!canCreateKey) return null;
      const targetKey = keyOf(target);
      setFailure(null);
      try {
        const key = (await createKeyFor(target))?.apiKey ?? null;
        setMinted({ refKey: targetKey, key });
        if (!key) setFailure({ refKey: targetKey, message: MINT_FAILED });
        return key;
      } catch (err) {
        if (isApiKeyAuthRequired(err)) setApiKeyRequiredFor(targetKey);
        else if (!isPermissionError(err)) setFailure({ refKey: targetKey, message: friendlyApiError(err, MINT_FAILED) });
        return null;
      }
    },
    [canCreateKey, createKeyFor],
  );
  const mintKey = useCallback(async () => (endpoint && mintable ? mintFor(endpoint) : null), [endpoint, mintable, mintFor]);

  // Auto-mint for an api-key-secured endpoint only: for another mode the test-key route answers 409.
  const mintingFor = useRef<string | null>(null);
  useEffect(() => {
    if (!enabled || !mintable || mode !== 'api-key') return;
    // Holding a key already is enough: this effect re-runs whenever the endpoint's queries
    // refetch, and minting again there would reap the key the surfaces are using.
    if (minted?.refKey === refKey && minted.key) return;
    // The held key only appears once the request lands, so an in-flight mint needs its own guard.
    if (mintingFor.current === refKey) return;
    mintingFor.current = refKey;
    void mintKey().finally(() => {
      if (mintingFor.current === refKey) mintingFor.current = null;
    });
  }, [enabled, mintable, mode, mintKey, minted, refKey]);

  // One re-mint per endpoint: a fresh key 401s the same way when the cause is not the key,
  // so retrying per credential would mint without end.
  const retriedFor = useRef<string | null>(null);
  const retryUnauthorized = useCallback(() => {
    // An open endpoint's 401 is not a stale key, and minting would switch it to api-key auth.
    if (!mintable || mode !== 'api-key') return;
    if (retriedFor.current === refKey) return;
    retriedFor.current = refKey;
    void mintKey();
  }, [mintable, mode, refKey, mintKey]);

  const { mutateAsync: enableApiKeyAuthFor } = enableApiKeyAuth;
  const switchToApiKey = useCallback(async (): Promise<string | null> => {
    if (!endpoint || !switchable) return null;
    const target = endpoint;
    const targetKey = keyOf(target);
    setFailure(null);
    // This mints itself; the auto-mint must not mint a second key when the mode refetches as api-key.
    mintingFor.current = targetKey;
    try {
      await enableApiKeyAuthFor(target);
      setApiKeyRequiredFor((current) => (current === targetKey ? null : current));
      return await mintFor(target);
    } catch (err) {
      if (!isPermissionError(err)) setFailure({ refKey: targetKey, message: friendlyApiError(err, 'Could not switch the endpoint to API key.') });
      return null;
    } finally {
      if (mintingFor.current === targetKey) mintingFor.current = null;
    }
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
    // An open (mode `none`) endpoint needs no credential; anything else does.
    isAuthorized: mode === 'none' || !!apiKey,
    isMinting: createTestKey.isPending && keyOf(createTestKey.variables) === refKey,
    canCreateKey,
    keyError,
    needsApiKeyAuth: mintable && ((mode === 'jwt' && !apiKey) || apiKeyRequiredFor === refKey),
    canSwitch: switchable,
    isSwitching: enableApiKeyAuth.isPending && keyOf(enableApiKeyAuth.variables) === refKey,
    switchToApiKey,
    // A disabled/incomplete ref leaves both terms false, so an idle hook never
    // reports unavailable — only a real answer does.
    // AI gateway deployment states report through `aiGateway`; a resolved mode with no
    // URL is still terminal, including a deployed open binding whose URL is absent.
    isUnavailable: (!aiGateway && isSecurityError) || (mode !== null && !mcpUrl),
    securityError,
    mintKey,
    retryUnauthorized,
  };
}
