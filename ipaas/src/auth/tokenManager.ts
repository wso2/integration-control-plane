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

import { refreshTokenApiUrl, revokeTokenApiUrl } from '../config/runtimeConfig';
import { IS_CLOUD } from '../features';
import * as cloudAuth from './cloudAuth';
import * as wipAuth from './wipAuth';

const REFRESH_TOKEN_KEY = 'refresh_token';
const REDIRECT_URL_KEY = 'redirect_url';
const OIDC_STATE_KEY = 'oidc_state';
const OIDC_AUTH_MODE_KEY = 'auth_mode';
export const OIDC_ORG_HANDLE_KEY = 'org_handle';

const EXPIRY_BUFFER_MS = 30_000;
const RESTORE_TIMEOUT_MS = 5_000;

interface TokenData {
  token: string;
  expiresIn: number;
  refreshToken: string;
}

let refreshPromise: Promise<void> | null = null;
let accessTokenMemory: { token: string; expiresAt: number } | null = null;
let onAuthFailure: (() => void) | null = null;

export function setOnAuthFailure(callback: () => void): void {
  onAuthFailure = callback;
}

export function endSession(): void {
  clearTokens();
  onAuthFailure?.();
}

export function saveTokens(data: TokenData): void {
  const now = Date.now();
  accessTokenMemory = { token: data.token, expiresAt: now + data.expiresIn * 1000 };
  localStorage.setItem(REFRESH_TOKEN_KEY, data.refreshToken);
}

export function getAccessToken(): string | null {
  return accessTokenMemory?.token ?? null;
}

// WIP only: the raw asgardeo token, kept in memory beside the STS access token.
export { saveAsgardeoToken, getAsgardeoToken } from './wipAuth';

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function saveRefreshToken(refreshToken: string): void {
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

// Whether this browser holds a session that a refresh can bring back
export function hasStoredSession(): boolean {
  return !!getRefreshToken();
}

export function clearTokens(): void {
  if (!IS_CLOUD) wipAuth.clearAsgardeoToken();
  accessTokenMemory = null;
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

/**
 * An expired, revoked, or already-rotated refresh token comes back as
 * `400 invalid_grant`
 */
export async function isInvalidGrant(res: Response): Promise<boolean> {
  try {
    const body = (await res.json()) as { error?: string };
    return body?.error === 'invalid_grant';
  } catch {
    // Non-JSON or empty body — can't confirm, so don't end the session on a guess.
    return false;
  }
}

// Sends a refresh_token grant to the IdP. On invalid_grant, retries once because another
// tab may have already used this refresh token and stored the newer one.
export async function postRefreshGrant(tokenEndpoint: string, clientId: string, refreshToken: string): Promise<Response> {
  const post = (token: string) =>
    fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: token,
        client_id: clientId,
      }).toString(),
    });

  const res = await post(refreshToken);
  if (res.status !== 400) return res;
  const latest = getRefreshToken();
  if (!latest || latest === refreshToken || !(await isInvalidGrant(res.clone()))) return res;
  return post(latest);
}

function isAccessTokenExpired(): boolean {
  if (!accessTokenMemory) return true;
  return Date.now() >= accessTokenMemory.expiresAt - EXPIRY_BUFFER_MS;
}

export function saveOidcAuthMetadata(orgHandle?: string): void {
  localStorage.setItem(OIDC_AUTH_MODE_KEY, 'oidc');
  if (orgHandle) {
    localStorage.setItem(OIDC_ORG_HANDLE_KEY, orgHandle);
  }
}

export function clearOidcAuthMetadata(): void {
  localStorage.removeItem(OIDC_AUTH_MODE_KEY);
  localStorage.removeItem(OIDC_ORG_HANDLE_KEY);
}

// Gets a new access token using the stored refresh token: local users via the backend, OIDC users
// via cloudAuth or wipAuth. Concurrent callers share one refresh; ends the session if it's rejected.
export async function refreshAccessToken(): Promise<void> {
  if (refreshPromise) {
    await refreshPromise;
    return;
  }

  refreshPromise = (async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) {
      endSession();
      return;
    }

    // Check if this is an OIDC user — skip local backend entirely to prevent
    // clearTokens() being called when the backend correctly rejects the WSO2 Identity Platform token.
    let isOidcSession = false;
    try {
      const stored = localStorage.getItem('user');
      if (stored) isOidcSession = JSON.parse(stored).isOidcUser === true;
    } catch {
      /* ignore */
    }

    // Try internal backend refresh (for non-OIDC users only)
    if (!isOidcSession) {
      try {
        const res = await fetch(refreshTokenApiUrl(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });

        if (res.ok) {
          const data: TokenData & { username: string; displayName: string; permissions: string[] } = await res.json();
          saveTokens(data);
          const userInfo = localStorage.getItem('user');
          if (userInfo) {
            try {
              const existing = JSON.parse(userInfo);
              localStorage.setItem('user', JSON.stringify({ ...existing, username: data.username, displayName: data.displayName, permissions: data.permissions }));
            } catch {
              localStorage.removeItem('user');
            }
          }
          return;
        }
        // Only clear session for explicit auth failures; treat transient errors as non-fatal
        if (res.status === 401 || res.status === 403) {
          endSession();
          return;
        }
        // 5xx / 429 / etc. — transient; fall through to OIDC refresh
        throw new Error(`Transient refresh error: ${res.status}`);
      } catch {
        // Network error — internal backend not reachable, fall through to OIDC refresh
      }
    }

    // OIDC refresh path
    await (IS_CLOUD ? cloudAuth.refreshOidcSession(refreshToken) : wipAuth.refreshOidcSession(refreshToken));
  })().finally(() => {
    refreshPromise = null;
  });

  await refreshPromise;
}

// Runs once before the app renders: the access token lives only in memory, so after a reload
// this gets a new one using the stored refresh token. Waits at most `timeoutMs`.
export async function restoreSession(timeoutMs = RESTORE_TIMEOUT_MS): Promise<void> {
  if (!hasStoredSession() || getAccessToken()) return;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, timeoutMs);
  });
  try {
    await Promise.race([refreshAccessToken(), timeout]);
  } catch (err) {
    console.warn('[tokenManager] session restore failed:', err);
  } finally {
    clearTimeout(timer);
  }
}

export async function authenticatedFetch(url: string, options: RequestInit = {}): Promise<Response> {
  if (isAccessTokenExpired()) {
    await refreshAccessToken();
  }

  const token = getAccessToken();
  const headers = new Headers(options.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(url, { ...options, headers });

  if (res.status === 401) {
    await refreshAccessToken();
    const retryToken = getAccessToken();
    const retryHeaders = new Headers(options.headers);
    if (retryToken) {
      retryHeaders.set('Authorization', `Bearer ${retryToken}`);
    }
    return fetch(url, { ...options, headers: retryHeaders });
  }

  return res;
}

export function switchOrgToken(orgHandle: string, signal?: AbortSignal): Promise<void> {
  return IS_CLOUD ? cloudAuth.switchOrgToken(orgHandle, signal) : wipAuth.switchOrgToken(orgHandle, signal);
}

export async function revokeToken(): Promise<void> {
  try {
    const token = getAccessToken();
    const refreshToken = getRefreshToken();
    if (!token) return;

    // OIDC sessions don't use the local backend — skip to avoid ERR_CONNECTION_REFUSED
    let isOidcSession = false;
    try {
      const stored = localStorage.getItem('user');
      if (stored) isOidcSession = JSON.parse(stored).isOidcUser === true;
    } catch {
      /* ignore */
    }
    if (isOidcSession) return;

    await fetch(revokeTokenApiUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ refreshToken }),
    });
  } catch {
    // best-effort — ignore errors
  }
}

export function saveRedirectUrl(url: string): void {
  // Never persist a redirect to the synthetic 'default' org — it isn't real and
  // would loop back there on every subsequent login.
  try {
    const pathname = new URL(url).pathname;
    if (pathname.startsWith('/organizations/default/') || pathname === '/organizations/default') return;
  } catch {
    /* ignore malformed URLs */
  }
  localStorage.setItem(REDIRECT_URL_KEY, url);
}

export function getAndClearRedirectUrl(): string | null {
  const url = localStorage.getItem(REDIRECT_URL_KEY);
  localStorage.removeItem(REDIRECT_URL_KEY);
  return url;
}

export function generateAndSaveOIDCState(): string {
  const state = crypto.randomUUID();
  localStorage.setItem(OIDC_STATE_KEY, state);
  return state;
}

export function validateAndClearOIDCState(state: string): boolean {
  const savedState = localStorage.getItem(OIDC_STATE_KEY);
  localStorage.removeItem(OIDC_STATE_KEY);
  return savedState === state;
}

// GitHub OAuth CSRF state — sessionStorage so it's scoped to the initiating tab
const GITHUB_OAUTH_STATE_KEY = 'github_oauth_state';

export function generateAndSaveGitHubState(): string {
  const state = crypto.randomUUID();
  sessionStorage.setItem(GITHUB_OAUTH_STATE_KEY, state);
  return state;
}

export function validateAndClearGitHubState(state: string): boolean {
  const saved = sessionStorage.getItem(GITHUB_OAUTH_STATE_KEY);
  sessionStorage.removeItem(GITHUB_OAUTH_STATE_KEY);
  return saved !== null && saved === state;
}

// ---------------------------------------------------------------------------
// PKCE helpers
// ---------------------------------------------------------------------------

const CODE_VERIFIER_KEY = 'pkce_verifier';

export async function generatePKCE(): Promise<{ verifier: string; challenge: string }> {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const verifier = btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const challenge = btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  return { verifier, challenge };
}

export function saveCodeVerifier(verifier: string): void {
  sessionStorage.setItem(CODE_VERIFIER_KEY, verifier);
}

export function getAndClearCodeVerifier(): string | null {
  const v = sessionStorage.getItem(CODE_VERIFIER_KEY);
  sessionStorage.removeItem(CODE_VERIFIER_KEY);
  return v;
}

export function getOrgUuidFromToken(): string | null {
  const token = getAccessToken();
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    // Choreo issues the org UUID under `organization.uuid`. Cloud's Thunder IdP
    // issues it as the `ouId` claim instead, so the cloud build falls back to it.
    const orgUuid = (payload.organization?.uuid as string) ?? null;
    return IS_CLOUD ? (orgUuid ?? (payload.ouId as string) ?? null) : orgUuid;
  } catch {
    return null;
  }
}
