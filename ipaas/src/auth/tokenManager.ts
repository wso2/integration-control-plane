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

const ACCESS_TOKEN_KEY = 'icp_auth_token';
const REFRESH_TOKEN_KEY = 'icp_refresh_token';
const TOKEN_EXPIRES_AT_KEY = 'icp_token_expires_at';
const REFRESH_TOKEN_EXPIRES_AT_KEY = 'icp_refresh_token_expires_at';
const OIDC_AUTH_MODE_KEY = 'icp_auth_mode';
const OIDC_ORG_HANDLE_KEY = 'icp_org_handle';

const EXPIRY_BUFFER_MS = 30_000;

interface TokenData {
  token: string;
  expiresIn: number;
  refreshToken: string;
  refreshTokenExpiresIn: number;
}

const ASGARDEO_TOKEN_EXPIRY_BUFFER_MS = 60_000;

let refreshPromise: Promise<void> | null = null;
let asgardeoRefreshPromise: Promise<AsgardeoTokenData | null> | null = null;
let onAuthFailure: (() => void) | null = null;
let asgardeoTokenMemory: { token: string; expiresAt: number } | null = null;

type AsgardeoTokenData = { access_token: string; refresh_token?: string; expires_in?: number };

export function setOnAuthFailure(callback: () => void): void {
  onAuthFailure = callback;
}

export function saveTokens(data: TokenData): void {
  const now = Date.now();
  localStorage.setItem(ACCESS_TOKEN_KEY, data.token);
  localStorage.setItem(REFRESH_TOKEN_KEY, data.refreshToken);
  localStorage.setItem(TOKEN_EXPIRES_AT_KEY, String(now + data.expiresIn * 1000));
  localStorage.setItem(REFRESH_TOKEN_EXPIRES_AT_KEY, String(now + data.refreshTokenExpiresIn * 1000));
}

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function saveAsgardeoToken(token: string, expiresIn?: number): void {
  asgardeoTokenMemory = { token, expiresAt: Date.now() + (expiresIn ?? 3600) * 1000 };
}

export function getAsgardeoToken(): string | null {
  if (!asgardeoTokenMemory) return null;
  if (Date.now() >= asgardeoTokenMemory.expiresAt - ASGARDEO_TOKEN_EXPIRY_BUFFER_MS) {
    asgardeoTokenMemory = null;
    return null;
  }
  return asgardeoTokenMemory.token;
}

export function clearAsgardeoToken(): void {
  asgardeoTokenMemory = null;
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function clearTokens(): void {
  asgardeoTokenMemory = null;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(TOKEN_EXPIRES_AT_KEY);
  localStorage.removeItem(REFRESH_TOKEN_EXPIRES_AT_KEY);
}

// Shared single-flight WSO2 Identity Platform token refresh — ensures refreshOidcAccessToken and
// getOrRefreshAsgardeoToken never race on the same refresh token.
async function doAsgardeoRefresh(): Promise<AsgardeoTokenData | null> {
  const cached = getAsgardeoToken();
  if (cached) return { access_token: cached };

  if (asgardeoRefreshPromise) return asgardeoRefreshPromise;

  const refreshToken = getRefreshToken();
  const { asgardeoClientId, asgardeoTokenEndpoint } = window.API_CONFIG;
  if (!refreshToken || !asgardeoClientId || !asgardeoTokenEndpoint) return null;

  asgardeoRefreshPromise = (async () => {
    try {
      const res = await fetch(asgardeoTokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: asgardeoClientId,
        }).toString(),
      });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          throw new Error(`Asgardeo refresh auth failure: ${res.status}`);
        }
        console.warn('[tokenManager] WSO2 Identity Platform token refresh transient error:', res.status);
        return null;
      }
      const data: AsgardeoTokenData = await res.json();
      saveAsgardeoToken(data.access_token, data.expires_in);
      if (data.refresh_token) {
        localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh_token);
      }
      return data;
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('Asgardeo refresh auth failure')) throw err;
      console.warn('[tokenManager] WSO2 Identity Platform token refresh error:', err);
      return null;
    }
  })().finally(() => {
    asgardeoRefreshPromise = null;
  });

  return asgardeoRefreshPromise;
}

// Returns the raw WSO2 Identity Platform token (needed for APIs that don't accept STS tokens).
// Falls back to a fresh WSO2 Identity Platform token via doAsgardeoRefresh if nothing is cached.
export async function getOrRefreshAsgardeoToken(): Promise<string | null> {
  try {
    const data = await doAsgardeoRefresh();
    return data?.access_token ?? null;
  } catch {
    return null;
  }
}

function isAccessTokenExpired(): boolean {
  const expiresAt = localStorage.getItem(TOKEN_EXPIRES_AT_KEY);
  if (!expiresAt) return true;
  return Date.now() >= Number(expiresAt) - EXPIRY_BUFFER_MS;
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

async function refreshOidcAccessToken(refreshToken: string): Promise<void> {
  const { stsTokenEndpoint, stsClientId, stsScope, choreoOrgApiUrl } = window.API_CONFIG;

  // Step 1: Refresh WSO2 Identity Platform access token (serialized with getOrRefreshAsgardeoToken)
  let tokenData: AsgardeoTokenData | null;
  try {
    tokenData = await doAsgardeoRefresh();
  } catch {
    // Definitive auth failure (401/403 from WSO2 Identity Platform)
    clearTokens();
    onAuthFailure?.();
    return;
  }
  if (!tokenData) {
    // Transient failure — don't kill the session
    return;
  }

  const newRefreshToken = tokenData.refresh_token ?? refreshToken;

  if (!stsTokenEndpoint || !stsClientId) {
    saveTokens({ token: tokenData.access_token, expiresIn: tokenData.expires_in ?? 3600, refreshToken: newRefreshToken, refreshTokenExpiresIn: 86400 });
    return;
  }

  // Step 2: STS exchange with orgHandle for org-scoped token.
  // If orgHandle is missing (e.g. old session predating the fix), look it up from the orgs API.
  try {
    let orgHandle: string | null = localStorage.getItem(OIDC_ORG_HANDLE_KEY);
    if (!orgHandle && choreoOrgApiUrl) {
      try {
        const baseStsRes = await fetch(stsTokenEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
            client_id: stsClientId,
            subject_token: tokenData.access_token,
            subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
            requested_token_type: 'urn:ietf:params:oauth:token-type:jwt',
            ...(stsScope ? { scope: stsScope } : {}),
          }).toString(),
        });
        if (baseStsRes.ok) {
          const { access_token: baseStsToken } = (await baseStsRes.json()) as { access_token: string };
          const orgsRes = await fetch(`${choreoOrgApiUrl}/orgs`, { headers: { Authorization: `Bearer ${baseStsToken}` } });
          if (orgsRes.ok) {
            const orgsData = await orgsRes.json();
            const orgs: Array<{ handle?: string; orgHandle?: string; org_handle?: string }> = orgsData.list ?? orgsData.organizations ?? (Array.isArray(orgsData) ? orgsData : []);
            for (const org of orgs) {
              const h = org.handle ?? org.orgHandle ?? org.org_handle;
              if (h) {
                orgHandle = h;
                localStorage.setItem(OIDC_ORG_HANDLE_KEY, h);
                break;
              }
            }
          }
        }
      } catch {
        // fall through — STS exchange will proceed without orgHandle
      }
    }

    const stsParams: Record<string, string> = {
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      client_id: stsClientId,
      subject_token: tokenData.access_token,
      subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
      requested_token_type: 'urn:ietf:params:oauth:token-type:jwt',
      ...(stsScope ? { scope: stsScope } : {}),
      ...(orgHandle ? { orgHandle } : {}),
    };

    const stsRes = await fetch(stsTokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(stsParams).toString(),
    });

    if (!stsRes.ok) {
      if (stsRes.status === 401 || stsRes.status === 403) {
        clearTokens();
        onAuthFailure?.();
      }
      return;
    }

    const stsData: { access_token: string; expires_in?: number } = await stsRes.json();
    saveTokens({ token: stsData.access_token, expiresIn: stsData.expires_in ?? 3600, refreshToken: newRefreshToken, refreshTokenExpiresIn: 86400 });
  } catch {
    // Network/transient STS error — don't kill the session
  }
}

export async function refreshAccessToken(): Promise<void> {
  if (refreshPromise) {
    await refreshPromise;
    return;
  }

  refreshPromise = (async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) {
      clearTokens();
      onAuthFailure?.();
      return;
    }

    // Check if this is an OIDC user — skip local backend entirely to prevent
    // clearTokens() being called when the backend correctly rejects the WSO2 Identity Platform token.
    let isOidcSession = false;
    try {
      const stored = localStorage.getItem('icp_user');
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
          const userInfo = localStorage.getItem('icp_user');
          if (userInfo) {
            try {
              const existing = JSON.parse(userInfo);
              localStorage.setItem('icp_user', JSON.stringify({ ...existing, username: data.username, displayName: data.displayName, permissions: data.permissions }));
            } catch {
              localStorage.removeItem('icp_user');
            }
          }
          return;
        }
        // Only clear session for explicit auth failures; treat transient errors as non-fatal
        if (res.status === 401 || res.status === 403) {
          clearTokens();
          onAuthFailure?.();
          return;
        }
        // 5xx / 429 / etc. — transient; fall through to OIDC refresh
        throw new Error(`Transient refresh error: ${res.status}`);
      } catch {
        // Network error — internal backend not reachable, fall through to OIDC refresh
      }
    }

    // OIDC refresh path
    await refreshOidcAccessToken(refreshToken);
  })().finally(() => {
    refreshPromise = null;
  });

  await refreshPromise;
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

export async function switchOrgToken(orgHandle: string): Promise<void> {
  const currentToken = getAccessToken();
  const { stsTokenEndpoint, stsClientId, stsScope } = window.API_CONFIG;
  if (!currentToken || !stsTokenEndpoint || !stsClientId) return;

  const res = await fetch(stsTokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      client_id: stsClientId,
      subject_token: currentToken,
      subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
      requested_token_type: 'urn:ietf:params:oauth:token-type:jwt',
      ...(stsScope ? { scope: stsScope } : {}),
      orgHandle,
    }).toString(),
  });

  if (!res.ok) throw new Error(`Org token exchange failed (${res.status})`);

  const data: { access_token: string; expires_in?: number } = await res.json();
  localStorage.setItem('icp_org_handle', orgHandle);
  saveTokens({
    token: data.access_token,
    expiresIn: data.expires_in ?? 3600,
    refreshToken: getRefreshToken() ?? '',
    refreshTokenExpiresIn: 86400,
  });
}

export async function revokeToken(): Promise<void> {
  try {
    const token = getAccessToken();
    const refreshToken = getRefreshToken();
    if (!token) return;

    // OIDC sessions don't use the local backend — skip to avoid ERR_CONNECTION_REFUSED
    let isOidcSession = false;
    try {
      const stored = localStorage.getItem('icp_user');
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

// ---------------------------------------------------------------------------
// PKCE helpers
// ---------------------------------------------------------------------------

const CODE_VERIFIER_KEY = 'icp_pkce_verifier';

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
