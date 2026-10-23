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

import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_API_KEY_HEADER } from '../constants/apiConsumption';
import { useCreateEndpointTestKey, useEndpointSecurity } from './useConsumers';
import type { EndpointRef, SecurityMode } from '../types/consumers';
import { friendlyApiError } from '../utils/apiSecurity';

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
  /** Minting failed, as a message the user can act on. */
  keyError: string | null;
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

/** Identity of the endpoint a minted key belongs to, so a key can never leak across endpoints. */
const keyOf = (ref: EndpointRef | null | undefined): string => `${ref?.projectName ?? ''}|${ref?.componentName ?? ''}|${ref?.environmentName ?? ''}|${ref?.endpointName ?? ''}`;

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
 * the auto-expose default, so it is policy-neutral. For a `jwt`-secured endpoint
 * the caller must call `mintKey()` explicitly, because the BFF's test-key route
 * switches the endpoint to api-key auth as a side effect.
 */
export function useEndpointTestAccess(ref: EndpointRef | null | undefined, enabled = true): EndpointTestAccess {
  const { data: security, isError: isSecurityError, error: securityError } = useEndpointSecurity(ref, enabled);
  const createTestKey = useCreateEndpointTestKey(ref);

  // The minted key and any failure are stored against the endpoint they belong
  // to, so a response that lands after the selection moved on is ignored by
  // construction — no cancellation bookkeeping needed.
  const refKey = keyOf(ref);
  const [minted, setMinted] = useState<{ refKey: string; key: string | null } | null>(null);
  const [failure, setFailure] = useState<{ refKey: string; message: string } | null>(null);

  const mode = security?.mode ?? null;
  const apiKey = minted?.refKey === refKey ? minted.key : null;
  const keyError = failure?.refKey === refKey ? failure.message : null;

  const mintKey = useCallback(
    async (): Promise<string | null> => {
      if (!ref) return null;
      setFailure(null);
      try {
        const key = (await createTestKey.mutateAsync())?.apiKey ?? null;
        setMinted({ refKey, key });
        if (!key) setFailure({ refKey, message: MINT_FAILED });
        return key;
      } catch (err) {
        setFailure({ refKey, message: friendlyApiError(err, MINT_FAILED) });
        return null;
      }
    },
    // createTestKey is a stable mutation object; the endpoint identity drives it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [refKey],
  );

  // Auto-mint for an api-key-secured endpoint. `jwt` is deliberately excluded:
  // minting would silently flip the endpoint's enforcement to api-key auth.
  const mintingFor = useRef<string | null>(null);
  useEffect(() => {
    if (!enabled || mode !== 'api-key') return;
    // Holding a key already is enough: this effect re-runs whenever the endpoint's queries
    // refetch, and minting again there would reap the key the surfaces are using.
    if (minted?.refKey === refKey && minted.key) return;
    // The held key only appears once the request lands, so an in-flight mint needs its own guard.
    if (mintingFor.current === refKey) return;
    mintingFor.current = refKey;
    void mintKey().finally(() => {
      if (mintingFor.current === refKey) mintingFor.current = null;
    });
  }, [enabled, mode, mintKey, minted, refKey]);

  // One re-mint per endpoint: a fresh key 401s the same way when the cause is not the key,
  // so retrying per credential would mint without end.
  const retriedFor = useRef<string | null>(null);
  const retryUnauthorized = useCallback(() => {
    // An open endpoint's 401 is not a stale key, and minting would switch it to api-key auth.
    if (mode !== 'api-key') return;
    if (retriedFor.current === refKey) return;
    retriedFor.current = refKey;
    void mintKey();
  }, [mode, refKey, mintKey]);

  const gatewayUrl = security?.publicUrl ?? '';

  return {
    gatewayUrl,
    mode,
    authHeader: security?.apiKey?.header || DEFAULT_API_KEY_HEADER,
    apiKey,
    // An open (mode `none`) endpoint needs no credential; anything else does.
    isAuthorized: mode === 'none' || !!apiKey,
    isMinting: createTestKey.isPending,
    keyError,
    // A disabled/incomplete ref leaves both terms false, so an idle hook never
    // reports unavailable — only a real answer does.
    isUnavailable: isSecurityError || (mode !== null && !gatewayUrl),
    securityError,
    mintKey,
    retryUnauthorized,
  };
}
