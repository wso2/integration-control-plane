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

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import i18n from '../i18n';
import {
  CALLBACK_PATH,
  checkScopes,
  claimsOf,
  completeSignIn,
  currentTokens,
  onSignedOut,
  onTokens,
  rejoin,
  resumeSession,
  signIn,
  signOut,
  type Tokens,
} from './tokens';

export interface User {
  id: string;
  displayName: string;
  email?: string;
  initials: string;
  picture?: string;
  roles: string[];
}

interface AuthValue {
  status: 'loading' | 'ready' | 'signedOut' | 'error';
  error: Error | null;
  user: User;
  hasScope: (scope: string) => boolean;
  retry: () => void;
  refreshAccess: () => void;
  signIn: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

function initialsOf(name: string): string {
  const parts = name.replace(/@.*$/, '').split(/[\s._-]+/).filter(Boolean);
  const letters = parts.length > 1 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : (parts[0] ?? '?').slice(0, 2);
  return letters.toUpperCase();
}

function imageUrlOf(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function listClaim(claims: Record<string, unknown>, name: string): string[] {
  const value = claims[name];
  const items = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  return items
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item !== '');
}

function scopesOf(tokens: Tokens | null): Set<string> {
  const scopes = new Set((tokens?.scope ?? '').split(/\s+/).filter(Boolean));
  const claim = claimsOf(tokens?.accessToken).scope;
  if (typeof claim === 'string') claim.split(/\s+/).filter(Boolean).forEach((s) => scopes.add(s));
  return scopes;
}

/** Finishes a sign-in on the callback, or picks up this tab's tokens; with none, the token store joins the WIdP-DP's session. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useRef(useNavigate());
  const [tokens, setTokens] = useState<Tokens | null>(currentTokens());
  const [status, setStatus] = useState<AuthValue['status']>('loading');
  const [error, setError] = useState<Error | null>(null);

  const start = useCallback(() => {
    setStatus('loading');
    setError(null);
    const begin =
      window.location.pathname === CALLBACK_PATH
        ? completeSignIn().then((returnTo) => navigate.current(returnTo, { replace: true }))
        : resumeSession();
    begin
      .then(() => setStatus('ready'))
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason : new Error(i18n.t('errors.signIn.couldNotStartSession')));
        setStatus('error');
      });
  }, []);

  useEffect(() => onTokens(setTokens), []);
  useEffect(() => onSignedOut(() => setStatus('signedOut')), []);
  useEffect(() => {
    start();
  }, [start]);

  // Published scopes change while the page is open: look again on load and whenever the window gets focus.
  useEffect(() => {
    if (status !== 'ready') return;
    const check = () => void checkScopes().catch(() => undefined);
    check();
    window.addEventListener('focus', check);
    return () => window.removeEventListener('focus', check);
  }, [status]);

  const value = useMemo<AuthValue>(() => {
    const id = claimsOf(tokens?.idToken);
    const text = (key: string) => (typeof id[key] === 'string' && id[key] ? (id[key] as string) : undefined);
    // IdPs that leave out `name` often still send its parts; only then fall back to the username or email.
    const fullName = [text('given_name'), text('family_name')].filter(Boolean).join(' ');
    const displayName = text('name') || fullName || text('preferred_username') || text('email') || i18n.t('common.unnamedUser');
    const scopes = scopesOf(tokens);
    return {
      status: status === 'ready' && !tokens ? 'loading' : status,
      error,
      user: { id: text('sub') ?? '', displayName, email: text('email'), initials: initialsOf(displayName), picture: imageUrlOf(text('picture')), roles: listClaim(id, 'roles') },
      hasScope: (scope) => scopes.has(scope),
      retry: start,
      refreshAccess: () => void rejoin().catch((reason: unknown) => {
        setError(reason instanceof Error ? reason : new Error(i18n.t('errors.signIn.couldNotStartSignIn')));
        setStatus('error');
      }),
      signIn: () => void signIn().catch((reason: unknown) => {
        setError(reason instanceof Error ? reason : new Error(i18n.t('errors.signIn.couldNotStartSignIn')));
        setStatus('error');
      }),
      signOut,
    };
  }, [status, error, tokens, start]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
