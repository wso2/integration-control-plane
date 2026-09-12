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

/**
 * Private URI schemes an editor registers with the operating system. These
 * resolve to a locally installed application, so naming one cannot direct the
 * result at a host of the caller's choosing.
 */
const EDITOR_URI_SCHEMES = ["vscode:", "vscode-insiders:", "vscodium:", "code-oss:", "cursor:", "windsurf:"];

/**
 * The callback URI an editor asked to be returned to, or null when `state`
 * names none or names one that must not be followed.
 *
 * `state` is echoed back by GitHub exactly as it was handed over, so anyone who
 * can start an authorization can choose its contents. The OAuth code travels to
 * whatever this returns, so a URI is followed only when it cannot be pointed at
 * an arbitrary host:
 *
 *   - a private editor scheme, which resolves to an installed application;
 *   - an https origin named in `allowedOrigins`, for browser-based editors,
 *     which have no private scheme to use.
 *
 * Everything else is refused, http included: a code delivered in plaintext is
 * a code disclosed, whoever receives it.
 */
export function editorCallbackUri(state: string | null, allowedOrigins: readonly string[] = []): string | null {
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

  let parsed: URL;
  try {
    parsed = new URL(callbackUri);
  } catch {
    return null;
  }

  if (EDITOR_URI_SCHEMES.includes(parsed.protocol)) {
    return callbackUri;
  }
  // Matched on the parsed origin, not on the string: comparing text would let
  // "https://trusted.example" be a prefix of "https://trusted.example.evil.com",
  // and credentials or a port could disguise the real host.
  if (parsed.protocol === "https:" && allowedOrigins.includes(parsed.origin)) {
    return callbackUri;
  }
  return null;
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
