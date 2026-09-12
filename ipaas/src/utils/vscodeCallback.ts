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

/**
 * Returning a GitHub OAuth result to an editor.
 *
 * A GitHub App has one registered callback URL, so an editor cannot receive the
 * redirect itself. It instead puts its own URI inside the OAuth `state`, and
 * this page forwards the result there. The console's own popup flow needs no
 * such hop — it is same-origin and uses a BroadcastChannel — so a `state` that
 * names no callback leaves that path untouched.
 */

/** Schemes an editor callback may use. Anything else is not an editor and is not followed. */
const EDITOR_SCHEMES = ["vscode:", "vscode-insiders:", "vscodium:", "code-oss:", "https:", "http:"];

/** The callback URI an editor asked to be returned to, or null when `state` names none. */
export function editorCallbackUri(state: string | null): string | null {
  if (!state) {
    return null;
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(atob(state));
  } catch {
    // Not an editor state. The console's own flows send opaque values here.
    return null;
  }
  const callbackUri = (decoded as { callbackUri?: unknown } | null)?.callbackUri;
  if (typeof callbackUri !== "string" || !callbackUri) {
    return null;
  }
  // Only ever navigate somewhere whose scheme is one an editor registers.
  // `state` reaches us by way of GitHub having been handed it, so it is not
  // trusted input, and an unchecked value here would redirect anywhere.
  try {
    if (!EDITOR_SCHEMES.includes(new URL(callbackUri).protocol)) {
      return null;
    }
  } catch {
    return null;
  }
  return callbackUri;
}

/**
 * The editor callback with the OAuth result appended, preserving any query the
 * editor already put on it.
 */
export function buildEditorCallbackUrl(callbackUri: string, params: Record<string, string | null>): string {
  const separator = callbackUri.includes("?") ? "&" : "?";
  const query = Object.entries(params)
    .filter(([, value]) => value !== null && value !== "")
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join("&");
  return query ? `${callbackUri}${separator}${query}` : callbackUri;
}

/** The org id the editor put in `state`, so the callback can carry it back. */
export function editorStateOrgId(state: string | null): string | null {
  if (!state) {
    return null;
  }
  try {
    const decoded = JSON.parse(atob(state)) as { orgId?: unknown };
    return typeof decoded?.orgId === "string" && decoded.orgId ? decoded.orgId : null;
  } catch {
    return null;
  }
}
