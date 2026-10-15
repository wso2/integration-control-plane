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

/** The hidden iframe the SDK loads its prompt=none authorize request in. */
const PROMPT_NONE_IFRAME = 'promptNoneIFrame';

type SilentSignInMessage = { type: 'check_session_signed_in'; data: { code: string; sessionState: string; state: string | null } } | { type: 'check_session_signed_out' };

/** Whether this page is the SDK's prompt=none iframe, landed back on the console with Thunder's answer. */
export function isSilentSignInFrame(): boolean {
  try {
    return window.self !== window.top && window.frameElement?.id === PROMPT_NONE_IFRAME;
  } catch {
    // A cross-origin parent: not the SDK's frame.
    return false;
  }
}

/** What the SDK, listening in the console's own window, expects for Thunder's prompt=none answer. */
export function silentSignInMessage(params: URLSearchParams): SilentSignInMessage {
  const code = params.get('code');
  // login_required and the like: no Thunder session, so the console signs in interactively.
  if (!code) return { type: 'check_session_signed_out' };
  return { type: 'check_session_signed_in', data: { code, sessionState: params.get('session_state') ?? '', state: params.get('state') } };
}

/**
 * Hands Thunder's prompt=none answer from the SDK's iframe to the console, which exchanges the
 * code with the PKCE verifier it holds. The SDK would relay it itself, but only for its
 * `sign-in-silently` state, which a named instance's `instance_0_request_N` state never matches.
 * Returns whether this page was that iframe, which must then render nothing of the app.
 */
export function relaySilentSignIn(): boolean {
  if (!isSilentSignInFrame()) return false;
  window.top?.postMessage(silentSignInMessage(new URLSearchParams(window.location.search)), window.location.origin);
  return true;
}
