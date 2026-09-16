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

/** Claims the console needs to reconstruct a signed-in session. */
export interface TokenClaims {
  sub: string;
  email: string;
  name?: string;
  ouHandle: string;
  ouId: string;
  exp: number;
}

/**
 * Enough for a read-only run. A floor covering the 20-minute build waits would reject tokens
 * that serve the rest of the suite perfectly well, so those specs call reseedSessionToken
 * between polls instead — the provider hands out no refresh token for the console to use.
 */
export const MIN_TOKEN_LIFETIME_MS = 5 * 60_000;

interface StorageEntry {
  name: string;
  value: string;
}

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

  // The console derives the org from ouHandle and keys terms-of-use acceptance on sub,
  // so a token missing either cannot produce a usable session.
  for (const claim of ['sub', 'ouHandle', 'ouId', 'exp'] as const) {
    if (!payload[claim]) throw new Error(`Token has no '${claim}' claim.`);
  }

  return {
    sub: String(payload.sub),
    email: String(payload.email ?? ''),
    name: payload.name ? String(payload.name) : undefined,
    ouHandle: String(payload.ouHandle),
    ouId: String(payload.ouId),
    exp: Number(payload.exp),
  };
}

export function assertUsableLifetime(claims: TokenClaims, nowMs: number): void {
  const remainingMs = claims.exp * 1000 - nowMs;
  if (remainingMs < MIN_TOKEN_LIFETIME_MS) {
    const remaining = Math.round(remainingMs / 1000);
    throw new Error(`Token has ${remaining}s of life left, less than the ${MIN_TOKEN_LIFETIME_MS / 60_000} minutes a run needs. ` + 'Fetch a fresh one; if the provider keeps serving short-lived tokens, its refresh is failing.');
  }
}

/** The localStorage a completed OIDC sign-in leaves behind, rebuilt from the token alone. */
export function buildStorageState(token: string, claims: TokenClaims, origin: string): StorageState {
  const expiresAt = String(claims.exp * 1000);
  return {
    cookies: [],
    origins: [
      {
        origin,
        localStorage: [
          { name: 'auth_token', value: token },
          // No refresh token to hand over: the provider keeps its own and never
          // exposes it. tokenManager treats the empty value as "cannot refresh".
          { name: 'refresh_token', value: '' },
          { name: 'token_expires_at', value: expiresAt },
          { name: 'refresh_token_expires_at', value: expiresAt },
          { name: 'auth_mode', value: 'oidc' },
          { name: 'org_handle', value: claims.ouHandle },
          {
            name: 'user',
            value: JSON.stringify({
              userId: claims.sub,
              username: claims.email,
              displayName: claims.name ?? claims.email,
              isOidcUser: true,
              requirePasswordChange: false,
            }),
          },
          // Acceptance is per user and org; without it ProjectsRedirect blocks on its dialog.
          { name: `tos_accepted:${claims.sub}:${claims.ouHandle}`, value: 'true' },
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

  throw new Error(`Token provider at ${url} did not return a token after ${TOKEN_FETCH_ATTEMPTS} attempts (last: ${last}). A 503 means it holds no live token — its browser login or refresh has failed.`);
}

export async function resolveToken(): Promise<string> {
  const url = readSecret('E2E_TOKEN_URL');
  if (!url) throw new Error('E2E_TOKEN_MODE is set but E2E_TOKEN_URL is not configured.');

  return fetchFromProvider(url, readSecret('E2E_TOKEN_AUTH'));
}
