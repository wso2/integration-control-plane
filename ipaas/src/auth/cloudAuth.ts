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

import { endSession, getRefreshToken, isInvalidGrant, postRefreshGrant, saveTokens } from './tokenManager';

type IdpTokenData = { access_token: string; refresh_token?: string; expires_in?: number };

// Gets a new access token from Thunder using the refresh token, and saves both.
// Ends the session if the refresh token is rejected; keeps it on network or server errors.
export async function refreshOidcSession(refreshToken: string): Promise<void> {
  const { asgardeoClientId: clientId, asgardeoTokenEndpoint: tokenEndpoint } = window.API_CONFIG;
  if (!clientId || !tokenEndpoint) return;

  let res: Response;
  try {
    res = await postRefreshGrant(tokenEndpoint, clientId, refreshToken);
  } catch (err) {
    // Network error, don't kill the session
    console.warn('[tokenManager] IdP token refresh error:', err);
    return;
  }
  if (!res.ok) {
    // Definitive auth failure (401/403/invalid_grant from the IdP)
    if (res.status === 401 || res.status === 403 || (res.status === 400 && (await isInvalidGrant(res)))) {
      endSession();
      return;
    }
    console.warn('[tokenManager] IdP token refresh transient error:', res.status);
    return;
  }

  let data: IdpTokenData;
  try {
    data = await res.json();
  } catch (err) {
    console.warn('[tokenManager] IdP token refresh error:', err);
    return;
  }
  // Without a rotated token, keep what storage holds now: another tab may have stored a newer one.
  saveTokens({ token: data.access_token, expiresIn: data.expires_in ?? 3600, refreshToken: data.refresh_token ?? getRefreshToken() ?? refreshToken });
}

// Thunder scopes the token to the user's org at sign-in and there is no STS to exchange it with.
export async function switchOrgToken(_orgHandle: string, _signal?: AbortSignal): Promise<void> {
  throw new Error('Org token exchange unavailable');
}
