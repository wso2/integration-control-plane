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

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthContextValue } from './types';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface FakeSdk {
  isInitialized: boolean;
  isLoading: boolean;
  isSignedIn: boolean;
  getAccessToken: ReturnType<typeof vi.fn>;
  getDecodedIdToken: ReturnType<typeof vi.fn>;
  clearSession: ReturnType<typeof vi.fn>;
  signIn: ReturnType<typeof vi.fn>;
  signInSilently: ReturnType<typeof vi.fn>;
  signOut: ReturnType<typeof vi.fn>;
}

// A stand-in for the SDK's context whose flags a test moves on, the way the provider's would.
const sdk = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  let state = {} as FakeSdk;
  return {
    mounts: 0,
    get: () => state,
    set(patch: Partial<FakeSdk>) {
      state = { ...state, ...patch };
      listeners.forEach((l) => l());
    },
    reset(next: FakeSdk) {
      state = next;
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
});

vi.mock('@thunderid/react', async () => {
  const { useSyncExternalStore } = await import('react');
  return {
    ThunderIDProvider: ({ children }: { children: unknown }) => {
      sdk.mounts++;
      return children;
    },
    useThunderID: () => useSyncExternalStore(sdk.subscribe, sdk.get),
  };
});

vi.mock('../components/PageLoader', () => ({
  default: ({ label }: { label?: string }) => <div data-testid="loader">{label ?? 'loading'}</div>,
}));

const { AuthProvider, useAuth } = await import('./AuthProvider');
const { authenticatedFetch, getOrgUuidFromToken } = await import('./session');

const NOW = 1_800_000_000_000;
const b64url = (value: unknown): string => btoa(JSON.stringify(value)).replace(/=+$/, '');
const jwt = (claims: Record<string, unknown>): string => `${b64url({ alg: 'none' })}.${b64url(claims)}.sig`;
const accessToken = (claims: Record<string, unknown> = {}): string => jwt({ sub: 'u1', ouHandle: 'acme', ouId: 'org-uuid', email: 'ada@example.com', name: 'Ada (access)', exp: NOW / 1000 + 3600, ...claims });
const ID_CLAIMS = { sub: 'u1', name: 'Ada Lovelace', email: 'ada@example.com', picture: 'https://img.example/ada.png' };

let root: Root;
let container: HTMLDivElement;
let auth: AuthContextValue | null;

function Probe() {
  auth = useAuth();
  return <div data-testid="app">{auth.isAuthenticated ? 'signed-in' : 'signed-out'}</div>;
}

function sdkWith(patch: Partial<FakeSdk> = {}): void {
  sdk.reset({
    isInitialized: true,
    isLoading: false,
    isSignedIn: false,
    getAccessToken: vi.fn(async () => ''),
    getDecodedIdToken: vi.fn(async () => ID_CLAIMS),
    clearSession: vi.fn(),
    signIn: vi.fn(async () => undefined),
    signInSilently: vi.fn(async () => false),
    signOut: vi.fn(async () => ''),
    ...patch,
  });
}

function signedInSdk(token = accessToken()): void {
  sdkWith({ isSignedIn: true, getAccessToken: vi.fn(async () => token) });
}

async function render(): Promise<void> {
  await act(async () => {
    root.render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
  });
  await settle();
}

// Lets the provider's async settle run to completion.
async function settle(ms = 0): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

const screen = (): string => container.textContent ?? '';

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState({}, '', '/organizations/acme/home');
  window.API_CONFIG = {
    authBaseUrl: 'https://idp.example',
    asgardeoClientId: 'IPAAS_CONSOLE',
    asgardeoScope: 'openid',
    asgardeoSignInRedirectUrl: `${window.location.origin}/signin`,
    asgardeoResource: 'urn:wso2:amp',
    editorCallbackOrigins: [],
    editorCallbackDomains: [],
  } as unknown as typeof window.API_CONFIG;
  sdk.mounts = 0;
  auth = null;
  container = document.createElement('div');
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('cloud AuthProvider — upgrading from the pre-SDK console', () => {
  it('clears the old session from storage when it mounts', async () => {
    localStorage.setItem('auth_token', 'old-token');
    localStorage.setItem('refresh_token', 'old-refresh');
    localStorage.setItem('user', '{"userId":"u1"}');
    localStorage.setItem('org_handle', 'acme');
    sdkWith();
    await render();

    expect(localStorage.getItem('auth_token')).toBeNull();
    expect(localStorage.getItem('refresh_token')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
    expect(localStorage.getItem('org_handle')).toBe('acme');
  });
});

describe('cloud AuthProvider — editor sign-in', () => {
  it('forwards an editor’s sign-in result without mounting the SDK', async () => {
    const state = btoa(JSON.stringify({ callbackUri: 'vscode://wso2.wso2-integrator/signin' }));
    window.history.replaceState({}, '', `/signin?code=abc&state=${encodeURIComponent(state)}`);
    sdkWith();
    await render();

    expect(sdk.mounts).toBe(0);
    expect(screen()).toBe('Completing sign in…');
  });
});

describe('cloud AuthProvider — settling the session', () => {
  it('renders nothing of the app until the SDK has initialised', async () => {
    sdkWith({ isInitialized: false });
    await render();
    expect(screen()).toBe('loading');

    act(() => sdk.set({ isInitialized: true }));
    await settle();
    expect(screen()).toBe('signed-out');
  });

  it('is signed out when the SDK holds no token', async () => {
    sdkWith();
    await render();
    expect(auth?.isAuthenticated).toBe(false);
    expect(auth?.userId).toBe('');
    expect(getOrgUuidFromToken()).toBeNull();
  });

  it('signs in from the SDK session: org from the access token, profile from the ID token', async () => {
    signedInSdk();
    await render();

    expect(auth).toMatchObject({ isAuthenticated: true, userId: 'u1', username: 'ada@example.com', displayName: 'Ada Lovelace', pictureUrl: 'https://img.example/ada.png', orgHandle: 'acme' });
    expect(localStorage.getItem('icp:org_handle')).toBe('acme');
    expect(getOrgUuidFromToken()).toBe('org-uuid');
  });

  it('connects the token for requests made outside React', async () => {
    const token = accessToken();
    signedInSdk(token);
    await render();

    const fetchMock = vi.fn(async () => new Response('ok'));
    vi.stubGlobal('fetch', fetchMock);
    await authenticatedFetch('https://api.example/x');
    expect(new Headers((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].headers).get('Authorization')).toBe(`Bearer ${token}`);
  });

  // E2E token mode seeds an access token alone; the SDK throws for the missing ID token.
  it('takes the profile from the access token when the session has no ID token', async () => {
    signedInSdk();
    sdk.set({ getDecodedIdToken: vi.fn(async () => Promise.reject(new Error('no id token'))) });
    await render();
    expect(auth).toMatchObject({ isAuthenticated: true, userId: 'u1', displayName: 'Ada (access)' });
  });

  it('refuses a token without org claims and says why on /signin', async () => {
    signedInSdk(accessToken({ ouHandle: undefined }));
    await render();

    expect(auth?.isAuthenticated).toBe(false);
    expect(sdk.get().clearSession).toHaveBeenCalled();
    await expect(auth?.completeSignIn(new URLSearchParams())).rejects.toThrow('Missing organization context after sign-in. Please try logging in again.');
  });

  it('refuses a token whose org is the placeholder default handle', async () => {
    signedInSdk(accessToken({ ouHandle: 'default' }));
    await render();

    expect(auth?.isAuthenticated).toBe(false);
    expect(sdk.get().clearSession).toHaveBeenCalled();
    await expect(auth?.completeSignIn(new URLSearchParams())).rejects.toThrow('Missing organization context after sign-in. Please try logging in again.');
  });

  it('waits while the SDK exchanges a code it asked for', async () => {
    window.history.replaceState({}, '', '/signin?code=abc&state=instance_0_request_0');
    sdkWith({ isLoading: true });
    await render();
    expect(screen()).toBe('Completing sign in…');

    const token = accessToken();
    act(() => sdk.set({ isLoading: false, isSignedIn: true, getAccessToken: vi.fn(async () => token) }));
    await settle();
    expect(auth?.isAuthenticated).toBe(true);
  });

  it('does not wait on a code the SDK did not ask for', async () => {
    window.history.replaceState({}, '', '/signin?code=abc&state=someone-else');
    sdkWith({ isLoading: true });
    await render();
    expect(screen()).toBe('signed-out');
  });

  it('waits for the SDK to confirm a stored session', async () => {
    sdkWith({ getAccessToken: vi.fn(async () => accessToken()) });
    await render();
    expect(screen()).toBe('loading');

    act(() => sdk.set({ isSignedIn: true }));
    await settle();
    expect(screen()).toBe('signed-in');
  });

  it('keeps a session whose expired token the SDK refreshes on startup', async () => {
    let token = accessToken({ exp: NOW / 1000 - 60 });
    signedInSdk();
    sdk.set({ getAccessToken: vi.fn(async () => token) });
    await render();
    expect(screen()).toBe('loading');

    token = accessToken();
    await settle(1_000);
    expect(screen()).toBe('signed-in');
    expect(sdk.get().clearSession).not.toHaveBeenCalled();
  });

  // The SDK's isSignedIn stays false for an expired token, so waiting on it alone never ends.
  it('ends a stored session whose token expired and never refreshes, instead of loading forever', async () => {
    sdkWith({ getAccessToken: vi.fn(async () => accessToken({ exp: NOW / 1000 - 60 })) });
    await render();
    expect(screen()).toBe('loading');

    await settle(4_000);
    expect(screen()).toBe('loading');
    await settle(1_500);
    expect(screen()).toBe('signed-out');
    expect(sdk.get().clearSession).toHaveBeenCalledTimes(1);
  });

  it('ends the session when an API rejects the token after it expired', async () => {
    signedInSdk(accessToken({ exp: NOW / 1000 + 60 }));
    await render();
    expect(screen()).toBe('signed-in');

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 401 })),
    );
    vi.setSystemTime(NOW + 120_000);
    await act(async () => {
      await authenticatedFetch('https://api.example/x');
    });
    expect(screen()).toBe('signed-out');
    expect(sdk.get().clearSession).toHaveBeenCalled();
    expect(getOrgUuidFromToken()).toBeNull();
  });
});

describe('cloud AuthProvider — joining a Thunder session', () => {
  it('asks Thunder once, without its sign-in page, before settling signed out', async () => {
    sdkWith();
    await render();
    expect(sdk.get().signInSilently).toHaveBeenCalledTimes(1);
    expect(sdk.get().signInSilently).toHaveBeenCalledWith({ resource: 'urn:wso2:amp' });
    expect(screen()).toBe('signed-out');
  });

  it('signs in from the session Thunder already holds', async () => {
    const token = accessToken();
    sdkWith({
      signInSilently: vi.fn(async () => {
        sdk.set({ getAccessToken: vi.fn(async () => token) });
        return true;
      }),
    });
    await render();
    expect(screen()).toBe('loading');

    // The SDK confirms the session on a later poll.
    act(() => sdk.set({ isSignedIn: true }));
    await settle();
    expect(screen()).toBe('signed-in');
    expect(sdk.get().signIn).not.toHaveBeenCalled();
  });

  it('settles signed out when the silent attempt fails, and logs why', async () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const error = new Error('iframe gone');
    sdkWith({ signInSilently: vi.fn(async () => Promise.reject(error)) });
    await render();
    expect(screen()).toBe('signed-out');
    expect(sdk.get().signInSilently).toHaveBeenCalledTimes(1);
    expect(debug).toHaveBeenCalledWith(expect.any(String), error);
  });

  it('does not ask on the load right after a sign-out, and asks again on the next', async () => {
    signedInSdk();
    await render();
    void auth?.logout();
    await settle();
    act(() => root.unmount());

    sdkWith();
    root = createRoot(container);
    await render();
    expect(sdk.get().signInSilently).not.toHaveBeenCalled();
    expect(screen()).toBe('signed-out');
    act(() => root.unmount());

    root = createRoot(container);
    await render();
    expect(sdk.get().signInSilently).toHaveBeenCalledTimes(1);
  });

  it('renders nothing of the app inside the SDK’s silent sign-in iframe', async () => {
    vi.spyOn(window, 'parent', 'get').mockReturnValue({} as Window);
    window.history.replaceState({}, '', '/signin?code=abc&state=instance_0_sign-in-silently_request_0');
    sdkWith();
    await render();
    expect(sdk.mounts).toBeGreaterThan(0);
    expect(screen()).toBe('');
    expect(sdk.get().signInSilently).not.toHaveBeenCalled();
  });

  it('renders the app for a silent state outside an iframe or off /signin', async () => {
    window.history.replaceState({}, '', '/signin?code=abc&state=instance_0_sign-in-silently_request_0');
    sdkWith();
    await render();
    expect(screen()).not.toBe('');
    act(() => root.unmount());

    vi.spyOn(window, 'parent', 'get').mockReturnValue({} as Window);
    window.history.replaceState({}, '', '/organizations/acme/home?state=instance_0_sign-in-silently_request_0');
    root = createRoot(container);
    await render();
    expect(screen()).not.toBe('');
  });

  it('does not ask on a sign-in landing, which carries Thunder’s answer', async () => {
    window.history.replaceState({}, '', '/signin?code=abc&state=instance_0_request_0');
    sdkWith();
    await render();
    expect(sdk.get().signInSilently).not.toHaveBeenCalled();
  });

  it('does not ask on a sign-in landing that carries an error, not a code', async () => {
    window.history.replaceState({}, '', '/signin?error=access_denied&state=instance_0_request_0');
    sdkWith();
    await render();
    expect(sdk.get().signInSilently).not.toHaveBeenCalled();
  });

  it('does not ask when a stored session is restored', async () => {
    signedInSdk();
    await render();
    expect(sdk.get().signInSilently).not.toHaveBeenCalled();
  });
});

describe('cloud AuthProvider — actions', () => {
  it('completeSignIn returns the signed-in user', async () => {
    signedInSdk();
    await render();
    await expect(auth?.completeSignIn(new URLSearchParams())).resolves.toEqual({ userId: 'u1', orgHandle: 'acme' });
  });

  it('completeSignIn reports an error the IdP returned', async () => {
    sdkWith();
    await render();
    await expect(auth?.completeSignIn(new URLSearchParams({ error: 'access_denied', error_description: 'User cancelled' }))).rejects.toThrow('Authentication failed: User cancelled');
  });

  it('completeSignIn reports a sign-in that did not complete', async () => {
    sdkWith();
    await render();
    await expect(auth?.completeSignIn(new URLSearchParams())).rejects.toThrow('Sign-in did not complete. Please try logging in again.');
  });

  it('loginWithOIDC signs in through the SDK with the resource and chosen IdP', async () => {
    sdkWith();
    await render();
    await act(async () => {
      await auth?.loginWithOIDC('github');
    });
    expect(sdk.get().signIn).toHaveBeenCalledWith({ resource: 'urn:wso2:amp', fidp: 'github' });
  });

  it('logout drops the org and the connection, then signs out through the SDK', async () => {
    signedInSdk();
    await render();
    void auth?.logout();
    await settle();

    expect(sdk.get().signOut).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('org_handle')).toBeNull();
    expect(getOrgUuidFromToken()).toBeNull();
  });
});
