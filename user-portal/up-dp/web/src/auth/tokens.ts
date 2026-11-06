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

import { request } from '../api/http';
import i18n from '../i18n';
import type { AuthConfig, ScopeList } from '../types/portal';

export interface Tokens {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  tokenType: string;
  /** What the WIdP-DP granted. */
  scope: string;
  /** What this tab asked for, so a change in the published scopes can be told from a scope the user's roles don't grant. */
  requestedScope?: string;
  /** Epoch milliseconds. */
  expiresAt: number;
  /** When to renew: a minute before expiry, or halfway through a shorter lifetime. */
  renewAt: number;
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
  scope?: string;
  refresh_token?: string;
  id_token?: string;
}

/** One sign-in in flight, kept across the redirect. It holds no token. */
interface SignInTransaction {
  state: string;
  nonce: string;
  verifier: string;
  returnTo: string;
  silent: boolean;
  scope: string;
}

/** The parts of the WIdP-DP's discovery document the SPA signs in with. */
interface Endpoints {
  authorization: string;
  token: string;
  revocation?: string;
  endSession?: string;
}

interface DiscoveryDocument {
  issuer?: string;
  authorization_endpoint?: string;
  token_endpoint?: string;
  revocation_endpoint?: string;
  end_session_endpoint?: string;
}

export const CALLBACK_PATH = '/auth/callback';

const TOKENS_KEY = 'up-dp:tokens';
const SIGN_IN_KEY = 'up-dp:sign-in';
const CHANNEL_NAME = 'up-dp:auth';
const SIGNED_OUT = 'signed-out';

const RENEW_LEAD_MS = 60 * 1000;

/** What the hidden frame's callback page posts to the page that opened it. */
const FRAME_ANSWER = 'up-dp:frame-sign-in';
/** How long the hidden frame may take before the tab goes to the WIdP-DP itself, as the cloud console waits. */
const FRAME_TIMEOUT_MS = 3000;

const SCOPES_PATH = '/api/v1/auth/scopes';

/** prompt=none answers that only mean the user has to be asked. */
const INTERACTION_REQUIRED = new Set(['login_required', 'interaction_required', 'consent_required', 'account_selection_required']);

const MESSAGES: Record<string, 'accessDenied' | 'unavailable' | 'unreachable' | 'stateMismatch'> = {
  access_denied: 'accessDenied',
  unavailable: 'unavailable',
  unreachable: 'unreachable',
  state_mismatch: 'stateMismatch',
};

/** A sign-in or renewal the WIdP-DP refused, or one this tab could not finish. */
export class SignInError extends Error {
  readonly reason: string;
  /** The WIdP-DP did not answer; the tokens may still be good. */
  readonly retryable: boolean;

  constructor(reason: string, description?: string | null, retryable = false) {
    super(MESSAGES[reason] ? i18n.t(`errors.signIn.${MESSAGES[reason]}`) : (description ?? i18n.t('errors.signIn.generic')));
    this.name = 'SignInError';
    this.reason = reason;
    this.retryable = retryable;
  }
}

let config: AuthConfig | null = null;
let discovery: Promise<Endpoints> | null = null;
let current: Tokens | null = readTokens();
let inflight: Promise<Tokens> | null = null;
let completion: Promise<string> | null = null;
let framing: Promise<Tokens | null> | null = null;
let renewTimer: number | undefined;
let leaving = false;
// Bumped by every sign-out, so a renewal or frame sign-in that began before it can't keep tokens after it.
let generation = 0;
const listeners = new Set<(tokens: Tokens | null) => void>();
const signedOutListeners = new Set<() => void>();
const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL_NAME);

// Signing out in one tab signs every tab out: each revokes its own refresh token, which the
// WIdP-DP would not revoke for it.
channel?.addEventListener('message', (event: MessageEvent) => {
  if (event.data !== SIGNED_OUT) return;
  generation++;
  if (!current) return;
  void revoke(current);
  store(null);
  signedOutListeners.forEach((listener) => listener());
});

export function configureAuth(next: AuthConfig) {
  config = next;
}

function settings(): AuthConfig {
  if (!config?.issuer || !config.clientId || !config.resource) throw new SignInError('unavailable');
  return config;
}

function redirectUri(): string {
  return `${window.location.origin}${CALLBACK_PATH}`;
}

function postLogoutRedirectUri(): string {
  return `${window.location.origin}/`;
}

/** The WIdP-DP's endpoints, from its discovery document. A failed read is not kept, so the next call tries again. */
async function endpoints(): Promise<Endpoints> {
  discovery ??= discover(settings().issuer).catch((error: unknown) => {
    discovery = null;
    throw error;
  });
  return discovery;
}

async function discover(issuer: string): Promise<Endpoints> {
  let metadata: DiscoveryDocument;
  try {
    // OIDC Discovery 1.0 §4: drop the issuer's terminating "/" before appending the well-known path.
    const response = await fetch(`${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`, { headers: { Accept: 'application/json' }, credentials: 'omit' });
    if (!response.ok) throw new Error(`discovery answered ${response.status}`);
    metadata = (await response.json()) as DiscoveryDocument;
  } catch {
    throw new SignInError('unavailable', null, true);
  }
  // Byte for byte: the callback's iss check compares against the configured issuer, not the document's.
  if (metadata.issuer !== issuer || !metadata.authorization_endpoint || !metadata.token_endpoint) throw new SignInError('unavailable', null, true);
  return {
    authorization: metadata.authorization_endpoint,
    token: metadata.token_endpoint,
    revocation: metadata.revocation_endpoint,
    endSession: metadata.end_session_endpoint,
  };
}

function readTokens(): Tokens | null {
  try {
    const raw = sessionStorage.getItem(TOKENS_KEY);
    return raw ? (JSON.parse(raw) as Tokens) : null;
  } catch {
    return null;
  }
}

function store(tokens: Tokens | null) {
  current = tokens;
  window.clearTimeout(renewTimer);
  try {
    if (tokens) sessionStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
    else sessionStorage.removeItem(TOKENS_KEY);
  } catch {
    // Storage blocked: the tokens live as long as this page.
  }
  if (tokens) schedule(tokens);
  listeners.forEach((listener) => listener(tokens));
}

/** Stores tokens fetched since gen, unless this tab signed out in between: then it revokes them instead. */
function keep(tokens: Tokens, gen: number): Tokens {
  if (gen !== generation) {
    void revoke(tokens);
    throw new SignInError('signed_out');
  }
  store(tokens);
  return tokens;
}

function schedule(tokens: Tokens) {
  window.clearTimeout(renewTimer);
  renewTimer = window.setTimeout(() => void renew().catch(() => undefined), Math.max(tokens.renewAt - Date.now(), 0));
}

function fromResponse(body: TokenResponse, previous?: Tokens | null, requestedScope?: string): Tokens {
  const now = Date.now();
  const lifetime = Math.max(body.expires_in ?? 0, 0) * 1000;
  return {
    accessToken: body.access_token,
    // A WIdP-DP that does not rotate answers a refresh without a new refresh token.
    refreshToken: body.refresh_token ?? previous?.refreshToken,
    idToken: body.id_token ?? previous?.idToken,
    tokenType: body.token_type,
    scope: body.scope ?? previous?.scope ?? '',
    requestedScope: requestedScope ?? previous?.requestedScope,
    expiresAt: now + lifetime,
    renewAt: now + lifetime - Math.min(RENEW_LEAD_MS, lifetime / 2),
  };
}

async function postForm(endpoint: string, params: Record<string, string>): Promise<Response> {
  try {
    return await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams(params),
      credentials: 'omit',
    });
  } catch {
    throw new SignInError('unreachable', null, true);
  }
}

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const { clientId, resource } = settings();
  const { token } = await endpoints();
  const response = await postForm(token, { ...params, client_id: clientId, resource });
  const body = (await response.json().catch(() => ({}))) as Partial<TokenResponse> & { error?: string; error_description?: string };
  if (!response.ok || !body.access_token) {
    throw new SignInError(body.error ?? `http_${response.status}`, body.error_description, response.status >= 500);
  }
  return body as TokenResponse;
}

async function revoke(tokens: Tokens | null) {
  if (!config?.clientId || !tokens?.refreshToken) return;
  const endpoint = (await endpoints().catch(() => null))?.revocation;
  if (!endpoint) return;
  await postForm(endpoint, { token: tokens.refreshToken, token_type_hint: 'refresh_token', client_id: config.clientId }).catch(() => undefined);
}

function randomString(): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(32)));
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function pkceChallenge(verifier: string): Promise<string> {
  return base64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
}

/** A path on this origin to come back to, never the callback itself. */
function safeReturnTo(path: string): string {
  if (!path.startsWith('/') || path.startsWith('//') || path.startsWith('/\\') || path.startsWith(CALLBACK_PATH)) return '/';
  return path;
}

function takeTransaction(): SignInTransaction | null {
  try {
    const raw = sessionStorage.getItem(SIGN_IN_KEY);
    sessionStorage.removeItem(SIGN_IN_KEY);
    return raw ? (JSON.parse(raw) as SignInTransaction) : null;
  } catch {
    return null;
  }
}

/** The scopes UP-DP says to ask for, space separated. Without an answer, the ones this tab last asked for. */
async function requestedScopes(): Promise<string> {
  try {
    const { scopes } = await request<ScopeList>(SCOPES_PATH);
    return scopes.join(' ');
  } catch {
    if (current?.requestedScope) return current.requestedScope;
    throw new SignInError('unavailable', null, true);
  }
}

function sameScopes(a: string, b: string): boolean {
  const left = new Set(a.split(/\s+/).filter(Boolean));
  const right = new Set(b.split(/\s+/).filter(Boolean));
  return left.size === right.size && [...left].every((scope) => right.has(scope));
}

/**
 * Signs in again without a page when the scopes UP-DP lists are not the ones this tab asked
 * for. It compares requested scopes, not granted ones, so a scope the user's roles don't grant
 * can't send the tab round in a loop. A failed read is left for the next check.
 */
export async function checkScopes(): Promise<void> {
  if (!current || leaving) return;
  let scopes: string[];
  try {
    ({ scopes } = await request<ScopeList>(SCOPES_PATH));
  } catch {
    return;
  }
  if (current && !sameScopes(scopes.join(' '), current.requestedScope ?? '')) await rejoin();
}

/** The WIdP-DP's authorization request for one sign-in. Silent asks with prompt=none. */
async function authorizationUrl(tx: SignInTransaction): Promise<string> {
  const { clientId, resource } = settings();
  const { authorization } = await endpoints();
  const url = new URL(authorization);
  const query: Record<string, string> = {
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri(),
    scope: tx.scope,
    resource,
    state: tx.state,
    nonce: tx.nonce,
    code_challenge: await pkceChallenge(tx.verifier),
    code_challenge_method: 'S256',
  };
  if (tx.silent) query.prompt = 'none';
  Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, value));
  return url.toString();
}

/**
 * Sends the browser to the WIdP-DP, and back to where it was afterwards. Silent asks with
 * prompt=none, so a live WIdP-DP session signs the user in without a page. Never settles.
 */
export async function signIn({ silent = false, returnTo }: { silent?: boolean; returnTo?: string } = {}): Promise<never> {
  settings();
  await endpoints();
  const scope = await requestedScopes();
  if (!leaving) {
    leaving = true;
    const tx: SignInTransaction = {
      state: randomString(),
      nonce: randomString(),
      verifier: randomString(),
      returnTo: safeReturnTo(returnTo ?? `${window.location.pathname}${window.location.search}`),
      silent,
      scope,
    };
    sessionStorage.setItem(SIGN_IN_KEY, JSON.stringify(tx));
    window.location.assign(await authorizationUrl(tx));
  }
  return new Promise<never>(() => undefined);
}

/**
 * Tries the WIdP-DP's session in a hidden prompt=none frame
 */
function signInInFrame(): Promise<Tokens | null> {
  framing ??= joinInFrame().finally(() => {
    framing = null;
  });
  return framing;
}

async function joinInFrame(): Promise<Tokens | null> {
  if (leaving) return null;
  const gen = generation;
  const tx: SignInTransaction = { state: randomString(), nonce: randomString(), verifier: randomString(), returnTo: '/', silent: true, scope: await requestedScopes() };
  const url = await authorizationUrl(tx);

  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  frame.style.display = 'none';
  const answer = new Promise<URLSearchParams | null>((resolve) => {
    const finish = (query: URLSearchParams | null) => {
      window.clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      frame.remove();
      resolve(query);
    };
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: unknown; search?: unknown } | null;
      if (event.origin !== window.location.origin || event.source !== frame.contentWindow) return;
      if (data?.type === FRAME_ANSWER && typeof data.search === 'string') finish(new URLSearchParams(data.search));
    };
    const timer = window.setTimeout(() => finish(null), FRAME_TIMEOUT_MS);
    window.addEventListener('message', onMessage);
  });
  frame.src = url;
  document.body.appendChild(frame);

  const query = await answer;
  if (!query || query.get('error')) return null;
  try {
    return keep(await exchange(query, tx), gen);
  } catch {
    return null;
  }
}

/**
 * In the hidden frame, hands the WIdP-DP's answer to the page that opened it, which redeems it.
 * True when this page is that frame, and so renders nothing.
 */
export function answerFrameSignIn(): boolean {
  if (window.parent === window || window.location.pathname !== CALLBACK_PATH) return false;
  window.parent.postMessage({ type: FRAME_ANSWER, search: window.location.search }, window.location.origin);
  return true;
}

/** Joins the WIdP-DP's session again: in the hidden frame when it can, otherwise by sending the tab there with prompt=none. */
export async function rejoin(): Promise<Tokens> {
  return (await signInInFrame()) ?? signIn({ silent: true });
}

/** Finishes the sign-in the WIdP-DP sent back to the callback, and answers where to go next. */
export function completeSignIn(): Promise<string> {
  completion ??= redeem();
  return completion;
}

async function redeem(): Promise<string> {
  const query = new URLSearchParams(window.location.search);
  const tx = takeTransaction();
  // The state is the callback's CSRF defence: only a sign-in this tab started may finish here.
  if (!tx || query.get('state') !== tx.state) throw new SignInError('state_mismatch');
  if (tx.silent && INTERACTION_REQUIRED.has(query.get('error') ?? '')) return signIn({ returnTo: tx.returnTo });
  store(await exchange(query, tx));
  return tx.returnTo;
}

/** Checks the WIdP-DP's answer to a sign-in and redeems its code for tokens. */
async function exchange(query: URLSearchParams, tx: SignInTransaction): Promise<Tokens> {
  if (query.get('state') !== tx.state) throw new SignInError('state_mismatch');
  const error = query.get('error');
  if (error) throw new SignInError(error, query.get('error_description'));

  const { issuer } = settings();
  // RFC 9207: the answer came from the WIdP-DP this sign-in went to.
  const responseIssuer = query.get('iss');
  if (responseIssuer && responseIssuer !== issuer) throw new SignInError('issuer_mismatch');

  const code = query.get('code');
  if (!code) throw new SignInError('invalid_request');

  const body = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri(), code_verifier: tx.verifier });
  // The ID token comes straight from the token endpoint over TLS, so only its nonce is checked.
  if (claimsOf(body.id_token).nonce !== tx.nonce) throw new SignInError('nonce_mismatch');
  return fromResponse(body, null, tx.scope);
}

/**
 * Picks up this tab's stored tokens, or joins the WIdP-DP's session for new ones: in the hidden
 * frame, and failing that by signing in, which shows the WIdP-DP's page only when it has to.
 */
export async function resumeSession(): Promise<Tokens> {
  if (!current) return (await signInInFrame()) ?? signIn();
  if (Date.now() >= current.renewAt) return renew();
  schedule(current);
  return current;
}

/** Renews with the refresh token, shared by every caller waiting at the time. */
export function renew(): Promise<Tokens> {
  inflight ??= refresh().finally(() => {
    inflight = null;
  });
  return inflight;
}

async function refresh(): Promise<Tokens> {
  const refreshToken = current?.refreshToken;
  if (!refreshToken) return rejoin();
  const gen = generation;
  try {
    return keep(fromResponse(await tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken }), current), gen);
  } catch (error) {
    if (gen !== generation || !(error instanceof SignInError) || error.retryable) throw error;
    // The refresh token is spent; the WIdP-DP's own session may still sign this tab back in.
    const tokens = await signInInFrame();
    if (tokens) return tokens;
    if (gen !== generation) throw new SignInError('signed_out');
    store(null);
    return signIn({ silent: true });
  }
}

export async function accessToken(): Promise<string> {
  if (current && Date.now() < current.renewAt) return current.accessToken;
  return (await renew()).accessToken;
}

export function currentTokens(): Tokens | null {
  return current;
}

export function onTokens(listener: (tokens: Tokens | null) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Called when this tab is signed out but stays on the page, as when another tab signs out. */
export function onSignedOut(listener: () => void): () => void {
  signedOutListeners.add(listener);
  return () => signedOutListeners.delete(listener);
}

/** Signs every tab out, then ends the WIdP-DP's session, which would otherwise sign them back in. */
export async function signOut(): Promise<void> {
  generation++;
  window.clearTimeout(renewTimer);
  channel?.postMessage(SIGNED_OUT);
  const tokens = current;
  await revoke(tokens);
  store(null);

  // Without an end-session endpoint the WIdP-DP's session outlives this one, so this tab stays put.
  const endSession = config?.clientId ? (await endpoints().catch(() => null))?.endSession : undefined;
  if (!config || !endSession) {
    signedOutListeners.forEach((listener) => listener());
    return;
  }
  leaving = true;
  const url = new URL(endSession);
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('post_logout_redirect_uri', postLogoutRedirectUri());
  if (tokens?.idToken) url.searchParams.set('id_token_hint', tokens.idToken);
  window.location.assign(url.toString());
}

/** Reads a JWT's payload without verifying it: only for what the UI shows or hides. */
export function claimsOf(token: string | undefined): Record<string, unknown> {
  const payload = token?.split('.')[1];
  if (!payload) return {};
  try {
    const bytes = Uint8Array.from(atob(payload.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
  } catch {
    return {};
  }
}
