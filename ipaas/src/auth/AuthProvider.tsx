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

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { JSX, ReactNode } from 'react';
import { ThunderIDProvider, useThunderID } from '@thunderid/react';
import { SILENT_SIGN_IN_STATE, hasAuthParamsInUrl, hasCalledForThisInstanceInUrl } from '@thunderid/browser';
import PageLoader from '../components/PageLoader';
import { oidcCallbackUrl } from '../paths';
import { editorSignInForwardUrl } from '../utils/vscodeCallback';
import type { AuthContextValue } from './types';
import { decodeJwtPayload, isExpired, stringClaim } from './jwt';
import { clearLegacySession } from './legacySession';
import { connect, disconnect, type CloudSession, type CloudUser } from './session';
import { THUNDER_INSTANCE_ID, signInParams, thunderConfig } from './thunderConfig';
import { stripBase } from '../utils/basePath';
import { local, session as browserSession } from '../utils/storage';

const ORG_HANDLE_KEY = 'org_handle';
const MISSING_ORG = 'Missing organization context after sign-in. Please try logging in again.';
const SIGNED_OUT_USER: CloudUser = { userId: '', username: '', displayName: '' };
// How long a stored session may take to restore, including the SDK's startup refresh of an expired token.
const REFRESH_WAIT_MS = 5_000;
const RECHECK_MS = 250;
// Set by logout() for the load it returns to. A Thunder session that outlives the sign-out (its
// end-session failed, or the user came back to a cached page) must not sign the user straight back in.
const SKIP_SILENT_KEY = 'skip-silent-sign-in';
// The slot this flag used before storage keys were namespaced. A sign-out that started on a build
// without the prefix finishes on this one, so that load still has to see it. Remove once no
// unprefixed build is deployed.
const LEGACY_SKIP_SILENT_KEY = 'ipaas:skip-silent-sign-in';

// Before giving up on a session, one prompt=none attempt joins a Thunder session from another console.
type Silent = 'idle' | 'trying' | 'done';
type Status = { kind: 'pending' } | { kind: 'signedIn'; session: CloudSession } | { kind: 'signedOut'; error: string | null };

const AuthContext = createContext<AuthContextValue | null>(null);

// Either slot counts: this load may be the one returning from a sign-out the previous build began.
function skipSilentRequested(): boolean {
  return browserSession.get(SKIP_SILENT_KEY) !== null || sessionStorage.getItem(LEGACY_SKIP_SILENT_KEY) !== null;
}

function isSignInLanding(): boolean {
  return stripBase(window.location.pathname) === oidcCallbackUrl();
}

/**
 * Whether this page is the SDK's silent sign-in iframe, landed back on /signin with Thunder's answer.
 * The SDK provider relays that answer to the console around it; nothing of the app renders here,
 * or its protected routes would start a sign-in inside the iframe.
 */
function isSilentSignInFrame(): boolean {
  return window.self !== window.parent && isSignInLanding() && (new URLSearchParams(window.location.search).get('state')?.includes(SILENT_SIGN_IN_STATE) ?? false);
}

/** The editor to forward this load's sign-in result to, before the SDK can act on the code. */
function editorForwardUrl(): string | null {
  if (!isSignInLanding()) return null;
  return editorSignInForwardUrl(new URLSearchParams(window.location.search), {
    origins: window.API_CONFIG?.editorCallbackOrigins ?? [],
    domains: window.API_CONFIG?.editorCallbackDomains ?? [],
  });
}

/** Whether the SDK will exchange a code on this load: one it asked for, returned to /signin. */
function sdkHasCode(): boolean {
  const { search } = window.location;
  return isSignInLanding() && hasAuthParamsInUrl(search) && hasCalledForThisInstanceInUrl(THUNDER_INSTANCE_ID, search);
}

/**
 * The org comes from the access token, which the backend reads too. The profile prefers the ID
 * token and falls back to the access token, which carries the same name and email claims — a
 * session seeded from an access token alone, as E2E token mode does, has no ID token.
 */
function toSession(accessToken: string, idClaims: Record<string, unknown> | null): CloudSession | null {
  const access = decodeJwtPayload(accessToken);
  const claim = (name: string): string | undefined => (idClaims ? stringClaim(idClaims, name) : undefined) ?? stringClaim(access, name);
  const orgHandle = stringClaim(access, 'ouHandle');
  const orgUuid = stringClaim(access, 'ouId');
  const userId = claim('sub');
  // 'default' is the placeholder the routes treat as "no org" (ScopeResolver), never a real handle.
  if (!orgHandle || orgHandle === 'default' || !orgUuid || !userId) return null;

  const username = claim('username') ?? claim('preferred_username') ?? claim('email') ?? userId;
  return {
    user: {
      userId,
      username,
      displayName: claim('name') ?? claim('given_name') ?? username,
      pictureUrl: claim('picture'),
    },
    orgHandle,
    orgUuid,
  };
}

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [editorUrl] = useState(editorForwardUrl);
  const [config] = useState(thunderConfig);

  useEffect(() => {
    clearLegacySession();
  }, []);

  useEffect(() => {
    if (editorUrl) window.location.href = editorUrl;
  }, [editorUrl]);

  // The SDK never mounts for an editor's sign-in, so its code is forwarded untouched.
  if (editorUrl) return <PageLoader viewport label="Completing sign in…" />;

  return <ThunderIDProvider {...config}>{isSilentSignInFrame() ? null : <CloudSessionProvider>{children}</CloudSessionProvider>}</ThunderIDProvider>;
}

function CloudSessionProvider({ children }: { children: ReactNode }): JSX.Element {
  const { isInitialized, isLoading, isSignedIn, getAccessToken, getDecodedIdToken, clearSession, signIn, signInSilently, signOut } = useThunderID();
  const [hasCode] = useState(sdkHasCode);
  const [status, setStatus] = useState<Status>({ kind: 'pending' });
  // A sign-in landing already carries Thunder's answer, a code or an error; a load right after a
  // sign-out must not rejoin the session it left.
  const [silent, setSilent] = useState<Silent>(() => (isSignInLanding() || skipSilentRequested() ? 'done' : 'idle'));
  const silentStarted = useRef(false);
  const [waitFrom, setWaitFrom] = useState(Date.now);
  const [recheck, setRecheck] = useState(0);

  const endSession = useCallback(
    (error: string | null) => {
      disconnect();
      clearSession();
      setStatus({ kind: 'signedOut', error });
    },
    [clearSession],
  );

  // Settles once, from the SDK's state. `isLoading` alone can't say signed out:
  // it drops between initialising and restoring a stored session.
  useEffect(() => {
    if (status.kind !== 'pending' || !isInitialized) return;
    // Still exchanging the code it was handed.
    if (hasCode && isLoading && !isSignedIn) return;
    if (silent === 'trying') return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const settle = async (): Promise<void> => {
      const accessToken = await getAccessToken();
      if (cancelled) return;
      if (!accessToken) return silent === 'idle' ? setSilent('trying') : setStatus({ kind: 'signedOut', error: null });
      // The SDK's isSignedIn means "holds an unexpired token", so a stored session it has not
      // confirmed is one it is still restoring — or refreshing, if the token expired. Neither
      // outlasts the wait: a refresh that has not landed by then (the refresh token expired too,
      // or there never was one) leaves nothing to restore.
      if (!isSignedIn || isExpired(accessToken)) {
        if (Date.now() - waitFrom < REFRESH_WAIT_MS) {
          timer = setTimeout(() => setRecheck((n) => n + 1), RECHECK_MS);
          return;
        }
        return endSession(null);
      }

      // The SDK throws rather than return nothing when the session holds no ID token.
      const idClaims = await getDecodedIdToken().then(
        (claims) => claims as Record<string, unknown>,
        () => null,
      );
      const session = toSession(accessToken, idClaims);
      if (cancelled) return;
      if (!session) return endSession(MISSING_ORG);

      connect({ session, getAccessToken, onExpired: () => endSession(null) });
      // Read by AppLayout and the post-login routing to know the active org.
      local.set(ORG_HANDLE_KEY, session.orgHandle);
      setStatus({ kind: 'signedIn', session });
    };
    settle().catch(() => {
      if (!cancelled) endSession(null);
    });
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [status.kind, hasCode, silent, isInitialized, isLoading, isSignedIn, recheck, waitFrom, getAccessToken, getDecodedIdToken, endSession]);

  // Read once in the initialiser above; cleared here, not there, so StrictMode's second call agrees.
  useEffect(() => {
    browserSession.remove(SKIP_SILENT_KEY);
    sessionStorage.removeItem(LEGACY_SKIP_SILENT_KEY);
  }, []);

  // Thunder answers prompt=none without its sign-in page: a code when it holds a session, else
  // login_required. Either way it is tried once, within the SDK's silentSignIn timeout; with no
  // session, /login signs in interactively.
  useEffect(() => {
    if (silent !== 'trying' || silentStarted.current) return;
    silentStarted.current = true;
    signInSilently(signInParams())
      .catch((error: unknown) => {
        // Framing blocked, the IdP unreachable: the interactive sign-in still works.
        console.debug('Silent sign-in failed; signing in interactively.', error);
      })
      .finally(() => {
        // The token is stored by now, but the SDK's isSignedIn catches up only on its next poll;
        // give it the usual wait from here.
        setWaitFrom(Date.now());
        setSilent('done');
      });
  }, [silent, signInSilently]);

  const loginWithOIDC = useCallback(
    async (fidp?: string) => {
      await signIn(signInParams(fidp));
    },
    [signIn],
  );

  const completeSignIn = useCallback(
    async (params: URLSearchParams) => {
      const oidcError = params.get('error');
      if (oidcError) throw new Error(`Authentication failed: ${params.get('error_description') || oidcError}`);
      if (status.kind !== 'signedIn') throw new Error(status.kind === 'signedOut' && status.error ? status.error : 'Sign-in did not complete. Please try logging in again.');
      return { userId: status.session.user.userId, orgHandle: status.session.orgHandle };
    },
    [status],
  );

  const logout = useCallback(async () => {
    disconnect();
    local.remove(ORG_HANDLE_KEY);
    browserSession.set(SKIP_SILENT_KEY, '1');
    // Clears the local session, then leaves for Thunder's end-session endpoint.
    await signOut();
    // Callers don't navigate over the redirect.
    return new Promise<void>(() => {});
  }, [signOut]);

  const value = useMemo<AuthContextValue>(() => {
    const user = status.kind === 'signedIn' ? status.session.user : SIGNED_OUT_USER;
    return {
      isAuthenticated: status.kind === 'signedIn',
      userId: user.userId,
      username: user.username,
      displayName: user.displayName,
      pictureUrl: user.pictureUrl,
      orgHandle: status.kind === 'signedIn' ? status.session.orgHandle : '',
      loginWithOIDC,
      completeSignIn,
      logout,
    };
  }, [status, loginWithOIDC, completeSignIn, logout]);

  if (status.kind === 'pending') return <PageLoader viewport label={hasCode ? 'Completing sign in…' : undefined} />;

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
