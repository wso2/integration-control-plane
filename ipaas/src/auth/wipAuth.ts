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

// Token handling for the non-cloud builds: WSO2 Identity Platform (Asgardeo) sign-in,
// then an STS token exchange for the org-scoped token API calls use. Both tokens live in
// memory: the Asgardeo token here, the STS token as tokenManager's access token.
// Reached only through tokenManager, which picks this module or cloudAuth by IS_CLOUD.

import { OIDC_ORG_HANDLE_KEY, endSession, getAccessToken, getRefreshToken, isInvalidGrant, postRefreshGrant, saveRefreshToken, saveTokens } from './tokenManager';

const ASGARDEO_TOKEN_EXPIRY_BUFFER_MS = 60_000;

let asgardeoRefreshPromise: Promise<AsgardeoTokenData | null> | null = null;
let asgardeoTokenMemory: { token: string; expiresAt: number } | null = null;

type AsgardeoTokenData = { access_token: string; refresh_token?: string; expires_in?: number };

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

// Gets the Asgardeo token for the STS exchange: the cached one if still valid, else a new one from
// Asgardeo using the refresh token. Throws if the refresh token is rejected; null on other errors.
async function doAsgardeoRefresh(): Promise<AsgardeoTokenData | null> {
  const cached = getAsgardeoToken();
  if (cached) return { access_token: cached };

  if (asgardeoRefreshPromise) return asgardeoRefreshPromise;

  const refreshToken = getRefreshToken();
  const { asgardeoClientId, asgardeoTokenEndpoint } = window.API_CONFIG;
  if (!refreshToken || !asgardeoClientId || !asgardeoTokenEndpoint) return null;

  asgardeoRefreshPromise = (async () => {
    try {
      const res = await postRefreshGrant(asgardeoTokenEndpoint, asgardeoClientId, refreshToken);
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          throw new Error(`Asgardeo refresh auth failure: ${res.status}`);
        }
        if (res.status === 400 && (await isInvalidGrant(res))) {
          throw new Error(`Asgardeo refresh auth failure: 400 invalid_grant`);
        }
        console.warn('[tokenManager] WSO2 Identity Platform token refresh transient error:', res.status);
        return null;
      }
      const data: AsgardeoTokenData = await res.json();
      saveAsgardeoToken(data.access_token, data.expires_in);
      if (data.refresh_token) {
        saveRefreshToken(data.refresh_token);
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

// Gets a new access token: refreshes the Asgardeo token, then exchanges it at STS for an org-scoped
// token (or uses it as is when STS isn't configured). Ends the session if either rejects it.
export async function refreshOidcSession(refreshToken: string): Promise<void> {
  const { stsTokenEndpoint, stsClientId, stsScope, choreoOrgApiUrl } = window.API_CONFIG;

  // Step 1: Refresh WSO2 Identity Platform access token
  let tokenData: AsgardeoTokenData | null;
  try {
    tokenData = await doAsgardeoRefresh();
  } catch {
    // Definitive auth failure (401/403 from WSO2 Identity Platform)
    endSession();
    return;
  }
  if (!tokenData) {
    // Transient failure — don't kill the session
    return;
  }

  // Save the refresh token in storage at save time: this refresh's rotated one, or a newer one
  // another tab stored meanwhile — never the older one this refresh started with.
  const latestRefreshToken = (): string => getRefreshToken() ?? refreshToken;

  if (!stsTokenEndpoint || !stsClientId) {
    saveTokens({ token: tokenData.access_token, expiresIn: tokenData.expires_in ?? 3600, refreshToken: latestRefreshToken() });
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
      if (stsRes.status === 401 || stsRes.status === 403 || (stsRes.status === 400 && (await isInvalidGrant(stsRes)))) {
        endSession();
      }
      return;
    }

    const stsData: { access_token: string; expires_in?: number } = await stsRes.json();
    saveTokens({ token: stsData.access_token, expiresIn: stsData.expires_in ?? 3600, refreshToken: latestRefreshToken() });
  } catch {
    // Network/transient STS error — don't kill the session
  }
}

export async function switchOrgToken(orgHandle: string, signal?: AbortSignal): Promise<void> {
  const currentToken = getAccessToken();
  const { stsTokenEndpoint, stsClientId, stsScope } = window.API_CONFIG;
  // Callers treat a resolved promise as "the token is now scoped to `orgHandle`" — silently
  // resolving here (as this used to) would make that true when nothing was actually persisted.
  if (!currentToken || !stsTokenEndpoint || !stsClientId) {
    throw new Error('Org token exchange unavailable: missing auth token or STS configuration');
  }

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
    // Lets a caller cancel this exchange if it's been superseded by a newer one before it
    // resolves — otherwise, whichever request resolves last wins and persists its (possibly
    // stale) token/org_handle regardless of request order.
    signal,
  });

  if (!res.ok) throw new Error(`Org token exchange failed (${res.status})`);

  const data: { access_token: string; expires_in?: number } = await res.json();
  localStorage.setItem(OIDC_ORG_HANDLE_KEY, orgHandle);
  saveTokens({
    token: data.access_token,
    expiresIn: data.expires_in ?? 3600,
    refreshToken: getRefreshToken() ?? '',
  });
}
