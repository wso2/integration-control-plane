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

import { request as httpRequest } from 'http';
import { request as httpsRequest } from 'https';
import { readSecret } from './secrets.js';
import { PARKED_SESSION_KEY, type StorageEntry } from './session-storage.js';

/** Claims the console needs to reconstruct a signed-in session. */
export interface TokenClaims {
  sub: string;
  email: string;
  name?: string;
  ouHandle: string;
  ouId: string;
  /** The OAuth client the token was issued to; the SDK keys its session on it. */
  clientId: string;
  iat: number;
  exp: number;
}

/**
 * Where the Thunder SDK keeps a signed-in session: the session record in sessionStorage (the
 * console's configured storage), the active flag in localStorage. This is the SDK's own,
 * internal format — read off a real sign-in with the SDK at these versions, and not a public
 * API. token.test.ts fails when package.json pins other versions, so an upgrade re-checks these
 * keys instead of finding out from a run that never signs in.
 */
export const SDK_STORAGE_VERSIONS: Record<string, string> = { '@thunderid/browser': '1.2.2', '@thunderid/react': '1.3.3' };
export const SDK_SESSION_ACTIVE_KEY = 'thunderid-session-active';

/** Instance 0 is the only SDK instance the console creates. */
export function sdkSessionKey(clientId: string): string {
  return `session_data-instance_0-${clientId}`;
}

/** The SDK's session record for an access token alone — no ID or refresh token. */
export function sdkSession(token: string, claims: TokenClaims): string {
  return JSON.stringify({
    access_token: token,
    token_type: 'Bearer',
    created_at: claims.iat * 1000,
    expires_in: claims.exp - claims.iat,
  });
}

/**
 * Covers the longest stretch that runs without a reseed — a build-wait chunk is 4 minutes and
 * the import form allows 3 — with margin, rather than the whole 16-minute journey.
 *
 * A journey-length floor was tried and rejected: the provider serves a cached token until it
 * nears expiry, so requiring 20 minutes refused to start a run with 14 minutes left, which is
 * plenty when the session is topped up as it goes. Long waits and every group entry call
 * reseedSessionToken, because the provider hands out no refresh token for the console itself.
 */
export const MIN_TOKEN_LIFETIME_MS = 10 * 60_000;

export interface StorageState {
  cookies: never[];
  origins: Array<{ origin: string; localStorage: StorageEntry[] }>;
}

/**
 * A 200 with nothing in it means the provider answered but had nothing to give, which
 * would otherwise surface much later as an unreadable JWT.
 */
export function parseTokenBody(raw: string, source: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error(`Token provider at ${source} returned an empty body.`);
  return trimmed;
}

export function decodeTokenClaims(token: string): TokenClaims {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Token is not a JWT (expected three dot-separated segments).');

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as Record<string, unknown>;
  } catch {
    throw new Error('Token payload is not valid JSON.');
  }

  // The console derives the org from ouHandle and keys terms-of-use acceptance on sub, and the
  // SDK keys its session on client_id, so a token missing any of them cannot sign in.
  for (const claim of ['sub', 'ouHandle', 'ouId', 'client_id', 'iat', 'exp'] as const) {
    if (!payload[claim]) throw new Error(`Token has no '${claim}' claim.`);
  }

  // The session's dates and the lifetime check are computed from these; a value that is not a
  // number would turn into null dates and a lifetime check that always passes.
  for (const claim of ['iat', 'exp'] as const) {
    if (typeof payload[claim] !== 'number' || !Number.isFinite(payload[claim])) {
      throw new Error(`Token has a non-numeric '${claim}' claim.`);
    }
  }

  return {
    sub: String(payload.sub),
    email: String(payload.email ?? ''),
    name: payload.name ? String(payload.name) : undefined,
    ouHandle: String(payload.ouHandle),
    ouId: String(payload.ouId),
    clientId: String(payload.client_id),
    iat: Number(payload.iat),
    exp: Number(payload.exp),
  };
}

/**
 * The token's subject, or undefined when it cannot be read. Lenient on purpose: for callers that
 * only need the user id from whatever session the console holds, including one from a real
 * sign-in, without the token-mode setup's full claim checks (decodeTokenClaims).
 */
export function tokenSubject(token: string): string | undefined {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')) as { sub?: unknown };
    return typeof payload.sub === 'string' && payload.sub ? payload.sub : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The seeded session is keyed on the token's client, while the console's SDK (and
 * readSessionToken) look it up under the client the console is configured with. When the two
 * differ, the console finds no session and the run fails much later with nothing naming why.
 */
export function assertClientMatchesConsole(claims: TokenClaims, consoleClientId: string): void {
  if (claims.clientId !== consoleClientId) {
    throw new Error(
      `Token was issued to client '${claims.clientId}', but the console is configured for '${consoleClientId}' (ASGARDEO_CLIENT_ID), ` + 'so the console will not find the seeded session. Request a token for the console client from the provider.',
    );
  }
}

export function assertUsableLifetime(claims: TokenClaims, nowMs: number): void {
  const remainingMs = claims.exp * 1000 - nowMs;
  if (remainingMs < MIN_TOKEN_LIFETIME_MS) {
    const remaining = Math.round(remainingMs / 1000);
    throw new Error(`Token has ${remaining}s of life left, less than the ${MIN_TOKEN_LIFETIME_MS / 60_000} minutes a run needs. ` + 'Fetch a fresh one; if the provider keeps serving short-lived tokens, its refresh is failing.');
  }
}

/**
 * The storage a completed sign-in leaves behind, rebuilt from the token alone. The session record
 * belongs in sessionStorage, which storageState cannot carry, so it is parked for
 * restoreSessionStorage to put back (session-storage.ts). The provider hands out no refresh
 * token, so the SDK never refreshes this session; reseedSessionToken tops it up instead. The SDK
 * writes its config and discovery keys itself when the console loads.
 */
export function buildStorageState(token: string, claims: TokenClaims, origin: string): StorageState {
  return {
    cookies: [],
    origins: [
      {
        origin,
        localStorage: [
          { name: PARKED_SESSION_KEY, value: JSON.stringify([{ name: sdkSessionKey(claims.clientId), value: sdkSession(token, claims) }]) },
          { name: SDK_SESSION_ACTIVE_KEY, value: 'true' },
          // Acceptance is per user and org; without it ProjectsRedirect blocks on its dialog.
          { name: `icp:tos_accepted:${claims.sub}:${claims.ouHandle}`, value: 'true' },
        ],
      },
    ],
  };
}

/**
 * The internal gateway serves an in-cluster service name that no certificate matches, so
 * E2E_TOKEN_TLS_INSECURE turns verification off for this hop — which Node's global fetch
 * cannot express per request, hence the direct call.
 */
function get(url: string, headers: Record<string, string>): Promise<{ status: number; body: string }> {
  const secure = new URL(url).protocol === 'https:';

  return new Promise((resolve, reject) => {
    const req = (secure ? httpsRequest : httpRequest)(
      url,
      {
        headers,
        ...(secure && readSecret('E2E_TOKEN_TLS_INSECURE') ? { rejectUnauthorized: false } : {}),
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
      },
    );
    req.on('error', reject);
    req.end();
  });
}

/**
 * 503 means the provider is up but holds no live token, which its own refresh loop recovers
 * from; a transport error means the pod is restarting. Both clear on their own, so they are
 * retried. A 401 is a wrong secret and will never come good, so it is not.
 */
export function isRetryableTokenFailure(status: number): boolean {
  return status === 0 || status === 503 || status === 502 || status === 504;
}

export const TOKEN_FETCH_ATTEMPTS = 5;
export const TOKEN_RETRY_BASE_MS = 2_000;

/** Doubling backoff, so five attempts span roughly half a minute rather than hammering. */
export function tokenRetryDelayMs(attempt: number): number {
  return TOKEN_RETRY_BASE_MS * 2 ** (attempt - 1);
}

async function fetchFromProvider(url: string, authToken: string | undefined): Promise<string> {
  let last = '';

  for (let attempt = 1; attempt <= TOKEN_FETCH_ATTEMPTS; attempt++) {
    // status 0 is this module's marker for a transport failure — connection refused while the
    // provider's pod restarts, most often.
    const { status, body } = await get(url, authToken ? { 'X-Auth-Token': authToken } : {}).catch((error: Error) => ({
      status: 0,
      body: error.message,
    }));

    if (status === 401) {
      throw new Error(`Token provider at ${url} rejected the request (401). Check E2E_TOKEN_AUTH.`);
    }
    if (status >= 200 && status < 300) {
      return parseTokenBody(body, url);
    }

    last = status === 0 ? `transport error: ${body}` : `HTTP ${status}`;
    if (!isRetryableTokenFailure(status)) throw new Error(`Token provider at ${url} returned ${status}.`);

    if (attempt < TOKEN_FETCH_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, tokenRetryDelayMs(attempt)));
    }
  }

  // The hint is chosen from what actually failed. An unconditional "a 503 means..." note sent a
  // real debugging session after the provider when the tunnel was simply down.
  const hint = last.startsWith('transport error') ? 'Nothing accepted the connection: for a local run, check the port-forward to the internal gateway is still up.' : 'A 503 means it holds no live token — its browser login or refresh has failed.';
  throw new Error(`Token provider at ${url} did not return a token after ${TOKEN_FETCH_ATTEMPTS} attempts (last: ${last}). ${hint}`);
}

export async function resolveToken(): Promise<string> {
  const url = readSecret('E2E_TOKEN_URL');
  if (!url) throw new Error('E2E_TOKEN_MODE is set but E2E_TOKEN_URL is not configured.');

  return fetchFromProvider(url, readSecret('E2E_TOKEN_AUTH'));
}
