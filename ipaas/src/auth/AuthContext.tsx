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

import { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import type { JSX, ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { loginApiUrl } from '../config/runtimeConfig';
import { loginUrl } from '../paths';
import { IS_CLOUD } from '../features';
import {
  saveTokens,
  clearTokens,
  getAccessToken,
  getRefreshToken,
  revokeToken,
  setOnAuthFailure,
  generatePKCE,
  saveCodeVerifier,
  getAndClearCodeVerifier,
  saveAsgardeoToken,
  getAsgardeoToken,
  getOrRefreshAsgardeoToken,
  saveOidcAuthMetadata,
  clearOidcAuthMetadata,
} from './tokenManager';
import { generateAndSaveOIDCState } from './oauthState';

const USER_KEY = 'icp_user';

interface UserInfo {
  userId: string;
  username: string;
  displayName: string;
  pictureUrl?: string;
  isOidcUser: boolean;
  requirePasswordChange: boolean;
}

interface AuthContextValue {
  isAuthenticated: boolean;
  userId: string;
  username: string;
  displayName: string;
  pictureUrl?: string;
  isOidcUser: boolean;
  requirePasswordChange: boolean;
  clearRequirePasswordChange: () => void;
  login: (username: string, password: string) => Promise<void>;
  loginWithOIDC: (fidp?: string) => Promise<void>;
  handleOIDCCallback: (code: string, state: string | null) => Promise<{ isNewUser: boolean }>;
  completeOrgRegistration: (orgHandle: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function loadUserInfo(): UserInfo | null {
  const stored = localStorage.getItem(USER_KEY);
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch {
    localStorage.removeItem(USER_KEY);
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [isAuthenticated, setIsAuthenticated] = useState(() => !!getAccessToken());
  const [userInfo, setUserInfo] = useState<UserInfo | null>(() => loadUserInfo());

  useEffect(() => {
    setOnAuthFailure(() => {
      localStorage.removeItem(USER_KEY);
      setUserInfo(null);
      setIsAuthenticated(false);
      queryClient.clear();
      navigate(loginUrl());
    });
  }, [navigate, queryClient]);

  // Bootstrap the WSO2 Identity Platform token for existing sessions that pre-date saveAsgardeoToken.
  // Runs once on mount; no-ops if already cached or if not an OIDC session.
  useEffect(() => {
    if (isAuthenticated && !getAsgardeoToken()) {
      getOrRefreshAsgardeoToken().catch(() => {
        /* best-effort */
      });
    }
  }, [isAuthenticated]);

  const login = useCallback(async (username: string, password: string) => {
    const res = await fetch(loginApiUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      const body = await res.text();
      const err: Error & { status?: number; retryAfterSeconds?: number } = new Error(body || `Login failed (${res.status})`);
      err.status = res.status;
      if (res.status === 429) {
        try {
          err.retryAfterSeconds = JSON.parse(body).retryAfterSeconds;
        } catch {
          /* ignore */
        }
      }
      throw err;
    }
    const data: { userId: string; token: string; expiresIn: number; refreshToken: string; refreshTokenExpiresIn: number; username: string; displayName: string; permissions: string[]; isOidcUser: boolean; requirePasswordChange?: boolean } = await res.json();
    saveTokens({ token: data.token, expiresIn: data.expiresIn, refreshToken: data.refreshToken, refreshTokenExpiresIn: data.refreshTokenExpiresIn });

    const user: UserInfo = { userId: data.userId, username: data.username, displayName: data.displayName, isOidcUser: data.isOidcUser, requirePasswordChange: data.requirePasswordChange ?? false };
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    setUserInfo(user);
    setIsAuthenticated(true);
  }, []);

  const loginWithOIDC = useCallback(async (fidp?: string) => {
    const { asgardeoClientId, asgardeoAuthorizeEndpoint, asgardeoSignInRedirectUrl, asgardeoScope } = window.API_CONFIG;
    const state = generateAndSaveOIDCState();
    const { verifier, challenge } = await generatePKCE();
    saveCodeVerifier(verifier);
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: asgardeoClientId,
      redirect_uri: asgardeoSignInRedirectUrl,
      scope: asgardeoScope,
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });
    if (fidp) params.set('fidp', fidp);
    window.location.href = `${asgardeoAuthorizeEndpoint}?${params}`;
  }, []);

  const handleOIDCCallback = useCallback(async (code: string, _state: string | null): Promise<{ isNewUser: boolean }> => {
    const { asgardeoClientId, asgardeoTokenEndpoint, asgardeoSignInRedirectUrl, stsTokenEndpoint, stsClientId, stsScope, choreoOrgApiUrl } = window.API_CONFIG;

    const codeVerifier = getAndClearCodeVerifier();
    if (!codeVerifier) throw new Error('Missing PKCE code verifier. Please try logging in again.');

    // Step 1: Exchange auth code for WSO2 Identity Platform tokens
    const tokenRes = await fetch(asgardeoTokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: asgardeoSignInRedirectUrl,
        client_id: asgardeoClientId,
        code_verifier: codeVerifier,
      }).toString(),
    });
    if (!tokenRes.ok) {
      const body = await tokenRes.text();
      throw new Error(`Token exchange failed (${tokenRes.status}): ${body}`);
    }
    const tokenData: { access_token: string; id_token?: string; refresh_token?: string; expires_in?: number } = await tokenRes.json();

    const asgardeoToken = tokenData.access_token;
    saveAsgardeoToken(asgardeoToken);
    let finalToken = asgardeoToken;
    let finalExpiresIn = tokenData.expires_in ?? 3600;

    // Decode ID token early — needed for both new-user and existing-user paths
    let userId = crypto.randomUUID();
    let username = '';
    let displayName = '';
    let pictureUrl: string | undefined;
    if (tokenData.id_token) {
      try {
        const payload = JSON.parse(atob(tokenData.id_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        userId = payload.sub ?? userId;
        username = payload.username ?? payload.preferred_username ?? payload.email ?? payload.sub ?? '';
        displayName = payload.name ?? payload.given_name ?? username;
        pictureUrl = payload.picture ?? undefined;
      } catch {
        /* use defaults */
      }
    }

    // Cloud variant short-circuit: Thunder is the IdP and the access token
    // already carries the org context. There is no /user-mgt/1.0.0/validate/user
    // and no STS exchange to perform — read the org handle from the JWT
    // (root-level ouHandle, or nested organization.handle) and persist it.
    if (IS_CLOUD) {
      // cloud: post-login routing keys off icp_org_handle. Drop any stale org
      // state up front so a failed/incomplete sign-in can't reuse it, and require
      // a fresh handle from this token before completing the callback.
      localStorage.removeItem('icp_org_handle');
      localStorage.removeItem('icp_org_numeric_id');
      let cloudOrgHandle: string | undefined;
      try {
        // base64url → base64 with padding restored so atob accepts the segment.
        const normalized = asgardeoToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
        const payload = JSON.parse(atob(padded)) as Record<string, unknown>;
        const org = (payload.organization as Record<string, unknown> | undefined) ?? {};
        cloudOrgHandle = (org.handle as string | undefined) ?? (payload.ouHandle as string | undefined);
      } catch {
        /* ignore */
      }
      if (!cloudOrgHandle) {
        throw new Error('Missing organization context after sign-in. Please try logging in again.');
      }
      localStorage.setItem('icp_org_handle', cloudOrgHandle);
      saveTokens({ token: asgardeoToken, expiresIn: tokenData.expires_in ?? 3600, refreshToken: tokenData.refresh_token ?? '', refreshTokenExpiresIn: 86400 });
      saveOidcAuthMetadata(cloudOrgHandle);
      const user: UserInfo = { userId, username, displayName, pictureUrl, isOidcUser: true, requirePasswordChange: false };
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      setUserInfo(user);
      setIsAuthenticated(true);
      return { isNewUser: false };
    }

    // WSO2 Identity Platform's super-tenant — not a real ICP org, always skip.
    const ASGARDEO_SUPER_TENANT = 'carbon.super';

    // Step 2: Call validate/user (accepts raw WSO2 Identity Platform token) to get the org handle.
    // This is the primary org-discovery method. Falls back to STS-based lookup if unavailable.
    const userMgtBaseUrl = choreoOrgApiUrl?.replace('/orgs/1.0.0', '/user-mgt/1.0.0');
    let orgHandle: string | undefined;
    let validateUserSucceeded = false;

    if (userMgtBaseUrl) {
      try {
        const validateRes = await fetch(`${userMgtBaseUrl}/validate/user?origin_cloud=devant`, {
          headers: { Authorization: `Bearer ${asgardeoToken}` },
        });
        if (validateRes.ok) {
          validateUserSucceeded = true;
          const validateData: { organizations?: Array<{ id?: string; handle?: string }>; isNewUserSignup?: boolean } = await validateRes.json();
          const org = (validateData.organizations ?? []).find((o) => o.handle && o.handle !== ASGARDEO_SUPER_TENANT);
          if (org?.handle) {
            orgHandle = org.handle;
            localStorage.setItem('icp_org_handle', orgHandle);
            if (org.id) {
              const numId = parseInt(org.id, 10);
              if (!isNaN(numId)) {
                window.API_CONFIG.asgardeoOrgNumericId = numId;
                localStorage.setItem('icp_org_numeric_id', String(numId));
              }
            }
          }
          // For new signups, clear onboarding state so ToS / persona / region dialogs always show
          if (validateData.isNewUserSignup) {
            localStorage.removeItem('icp_tos_accepted');
            localStorage.removeItem('icp_persona');
            localStorage.removeItem('icp_region');
          }
          // org === undefined means new user (empty organizations list)
        }
      } catch {
        // validate/user unavailable; fall through to STS-based org lookup
      }
    }

    // New user confirmed: validate/user succeeded but returned no organizations yet.
    if (validateUserSucceeded && !orgHandle) {
      // Best-effort: try to get a base STS token for the registration page.
      let registrationToken = asgardeoToken;
      if (stsTokenEndpoint && stsClientId) {
        try {
          const baseStsRes = await fetch(stsTokenEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
              client_id: stsClientId,
              subject_token: asgardeoToken,
              subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
              requested_token_type: 'urn:ietf:params:oauth:token-type:jwt',
              ...(stsScope ? { scope: stsScope } : {}),
            }).toString(),
          });
          if (baseStsRes.ok) {
            registrationToken = ((await baseStsRes.json()) as { access_token: string }).access_token;
          }
        } catch {
          /* use WSO2 Identity Platform token */
        }
      }
      saveTokens({ token: registrationToken, expiresIn: 3600, refreshToken: tokenData.refresh_token ?? '', refreshTokenExpiresIn: 86400 });
      saveOidcAuthMetadata(undefined);
      const newUser: UserInfo = { userId, username, displayName, pictureUrl, isOidcUser: true, requirePasswordChange: false };
      localStorage.setItem(USER_KEY, JSON.stringify(newUser));
      setUserInfo(newUser);
      setIsAuthenticated(true);
      return { isNewUser: true };
    }

    if (stsTokenEndpoint && stsClientId) {
      const stsBaseParams = {
        grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
        client_id: stsClientId,
        subject_token: asgardeoToken,
        subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
        requested_token_type: 'urn:ietf:params:oauth:token-type:jwt',
        ...(stsScope ? { scope: stsScope } : {}),
      };

      if (!orgHandle) {
        // validate/user was unavailable — fall back to STS-based org discovery.

        // Helper: fetch org handle from the orgs API with any bearer token.
        const fetchOrgHandle = async (bearerToken: string): Promise<{ handle: string; numericId?: number } | 'empty' | null> => {
          if (!choreoOrgApiUrl) return null;
          try {
            const orgsRes = await fetch(`${choreoOrgApiUrl}/orgs`, {
              headers: { Authorization: `Bearer ${bearerToken}` },
            });
            if (!orgsRes.ok) return null;
            const orgsData = await orgsRes.json();
            const orgs: Array<{ handle?: string; orgHandle?: string; org_handle?: string; id?: number; orgId?: number }> = orgsData.list ?? orgsData.organizations ?? (Array.isArray(orgsData) ? orgsData : []);
            for (const org of orgs) {
              const h = org.handle ?? org.orgHandle ?? org.org_handle;
              if (h && h !== ASGARDEO_SUPER_TENANT) {
                const numericId = org.id ?? org.orgId;
                return { handle: h, numericId: typeof numericId === 'string' ? parseInt(numericId, 10) : numericId };
              }
            }
            return 'empty';
          } catch {
            return null;
          }
        };

        // Base STS exchange (no orgHandle) to get a token accepted by the orgs API.
        let baseStsToken: string | null = null;
        try {
          const baseStsRes = await fetch(stsTokenEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams(stsBaseParams).toString(),
          });
          if (baseStsRes.ok) {
            baseStsToken = ((await baseStsRes.json()) as { access_token: string }).access_token;
          } else if (baseStsRes.status >= 500) {
            console.warn(`[auth] STS unavailable (${baseStsRes.status}), skipping org-scoped token exchange`);
          } else {
            throw new Error(`Initial STS exchange failed (${baseStsRes.status}): ${await baseStsRes.text()}`);
          }
        } catch (err) {
          if (err instanceof Error && err.message.startsWith('Initial STS exchange failed')) throw err;
          console.warn('[auth] STS exchange network error, skipping:', err);
        }

        if (baseStsToken) {
          const orgResult = await fetchOrgHandle(baseStsToken);
          if (orgResult === null && choreoOrgApiUrl) {
            throw new Error('Failed to fetch org handle: orgs API returned an unexpected response');
          }
          if (orgResult && orgResult !== 'empty') {
            orgHandle = orgResult.handle;
            localStorage.setItem('icp_org_handle', orgHandle);
            if (orgResult.numericId) {
              window.API_CONFIG.asgardeoOrgNumericId = orgResult.numericId;
              localStorage.setItem('icp_org_numeric_id', String(orgResult.numericId));
            }
          }
          if (!orgHandle) {
            // New user (empty org list)
            saveTokens({ token: baseStsToken, expiresIn: 3600, refreshToken: tokenData.refresh_token ?? '', refreshTokenExpiresIn: 86400 });
            saveOidcAuthMetadata(undefined);
            const newUser: UserInfo = { userId, username, displayName, pictureUrl, isOidcUser: true, requirePasswordChange: false };
            localStorage.setItem(USER_KEY, JSON.stringify(newUser));
            setUserInfo(newUser);
            setIsAuthenticated(true);
            return { isNewUser: true };
          }
        } else {
          // STS unavailable — try orgs API with WSO2 Identity Platform token directly (best-effort).
          const orgResult = await fetchOrgHandle(asgardeoToken);
          if (orgResult && orgResult !== 'empty') {
            orgHandle = orgResult.handle;
            localStorage.setItem('icp_org_handle', orgHandle);
            if (orgResult.numericId) {
              window.API_CONFIG.asgardeoOrgNumericId = orgResult.numericId;
              localStorage.setItem('icp_org_numeric_id', String(orgResult.numericId));
            }
          } else if (orgResult === 'empty') {
            saveTokens({ token: asgardeoToken, expiresIn: finalExpiresIn, refreshToken: tokenData.refresh_token ?? '', refreshTokenExpiresIn: 86400 });
            saveOidcAuthMetadata(undefined);
            const newUser: UserInfo = { userId, username, displayName, pictureUrl, isOidcUser: true, requirePasswordChange: false };
            localStorage.setItem(USER_KEY, JSON.stringify(newUser));
            setUserInfo(newUser);
            setIsAuthenticated(true);
            return { isNewUser: true };
          }
          // If still null: fall through with no orgHandle — OIDCCallback will redirect to registerOrgUrl().
        }
      }

      // Org-scoped STS exchange WITH orgHandle — gets full Choreo API access.
      if (orgHandle) {
        try {
          const orgStsRes = await fetch(stsTokenEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ ...stsBaseParams, orgHandle }).toString(),
          });
          if (orgStsRes.ok) {
            const orgStsData: { access_token: string; expires_in?: number } = await orgStsRes.json();
            finalToken = orgStsData.access_token;
            finalExpiresIn = orgStsData.expires_in ?? 3600;
          } else if (orgStsRes.status < 500) {
            throw new Error(`Org-scoped STS exchange failed (${orgStsRes.status}): ${await orgStsRes.text()}`);
          } else {
            console.warn(`[auth] Org-scoped STS unavailable (${orgStsRes.status}), using WSO2 Identity Platform token`);
          }
        } catch (err) {
          if (err instanceof Error && err.message.startsWith('Org-scoped STS exchange failed')) throw err;
          console.warn('[auth] Org-scoped STS exchange network error:', err);
        }
      }
    }

    saveTokens({ token: finalToken, expiresIn: finalExpiresIn, refreshToken: tokenData.refresh_token ?? '', refreshTokenExpiresIn: 86400 });
    saveOidcAuthMetadata(orgHandle);
    const user: UserInfo = { userId, username, displayName, pictureUrl, isOidcUser: true, requirePasswordChange: false };
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    setUserInfo(user);
    setIsAuthenticated(true);
    return { isNewUser: false };
  }, []);

  // After the user creates their first org, exchange for an org-scoped STS token
  // and persist the org handle so normal authenticated requests work.
  const completeOrgRegistration = useCallback(async (orgHandle: string) => {
    const { stsTokenEndpoint, stsClientId, stsScope } = window.API_CONFIG;
    const asgardeoToken = getAsgardeoToken();
    if (!asgardeoToken) throw new Error('Session expired. Please sign in again.');

    let finalToken = asgardeoToken;
    let finalExpiresIn = 3600;

    if (stsTokenEndpoint && stsClientId) {
      const orgStsRes = await fetch(stsTokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
          client_id: stsClientId,
          subject_token: asgardeoToken,
          subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
          requested_token_type: 'urn:ietf:params:oauth:token-type:jwt',
          ...(stsScope ? { scope: stsScope } : {}),
          orgHandle,
        }).toString(),
      });
      if (!orgStsRes.ok) {
        throw new Error(`Org-scoped STS exchange failed (${orgStsRes.status}): ${await orgStsRes.text()}`);
      }
      const orgStsData: { access_token: string; expires_in?: number } = await orgStsRes.json();
      finalToken = orgStsData.access_token;
      finalExpiresIn = orgStsData.expires_in ?? 3600;
    }

    const existingRefreshToken = getRefreshToken() ?? '';
    saveTokens({ token: finalToken, expiresIn: finalExpiresIn, refreshToken: existingRefreshToken, refreshTokenExpiresIn: 86400 });
    localStorage.setItem('icp_org_handle', orgHandle);
    saveOidcAuthMetadata(orgHandle);
  }, []);

  const clearRequirePasswordChange = useCallback(() => {
    setUserInfo((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, requirePasswordChange: false };
      localStorage.setItem(USER_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const logout = useCallback(async () => {
    await revokeToken();
    clearTokens();
    clearOidcAuthMetadata();
    localStorage.removeItem(USER_KEY);
    setUserInfo(null);
    setIsAuthenticated(false);
    queryClient.clear();
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({
      isAuthenticated,
      userId: userInfo?.userId ?? '',
      username: userInfo?.username ?? '',
      displayName: userInfo?.displayName ?? '',
      pictureUrl: userInfo?.pictureUrl,
      isOidcUser: userInfo?.isOidcUser ?? false,
      requirePasswordChange: userInfo?.requirePasswordChange ?? false,
      clearRequirePasswordChange,
      login,
      loginWithOIDC,
      handleOIDCCallback,
      completeOrgRegistration,
      logout,
    }),
    [isAuthenticated, userInfo, clearRequirePasswordChange, login, loginWithOIDC, handleOIDCCallback, completeOrgRegistration, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
