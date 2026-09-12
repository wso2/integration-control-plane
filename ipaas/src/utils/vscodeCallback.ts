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

/** Hosts that resolve to the machine running the browser, never to the network. */
const LOOPBACK_HOSTS = ["localhost", "127.0.0.1", "[::1]", "::1"];

/** Whether `host` is the domain itself or a subdomain of it. */
function isSubdomainOf(host: string, domain: string): boolean {
  const h = host.toLowerCase();
  const d = domain.toLowerCase();
  // The leading dot is what makes this a subdomain test rather than a suffix
  // test: without it "evilcloud.wso2.com" would match "cloud.wso2.com".
  return h === d || h.endsWith(`.${d}`);
}

/** Options naming where an editor's OAuth result may be sent. Empty allows only private schemes. */
export interface EditorCallbackPolicy {
  /** Exact https origins, for editors at a known address. */
  origins?: readonly string[];
  /** Parent domains whose https subdomains are editors. Editors get one subdomain each. */
  domains?: readonly string[];
}

/**
 * The callback URI an editor asked to be returned to, or null when `state`
 * names none or names one that must not be followed.
 *
 * `state` is echoed back by GitHub exactly as it was handed over, so anyone who
 * can start an authorization can choose its contents. The OAuth code travels to
 * whatever this returns, so a URI is followed only when it cannot be pointed at
 * a host of the caller's choosing:
 *
 *   - a private editor scheme, which resolves to an installed application;
 *   - https at an allowlisted origin, or a subdomain of an allowlisted domain,
 *     for browser-based editors, which have no private scheme to use;
 *   - http at an allowlisted loopback origin, which is how a native app
 *     receives a redirect (RFC 8252) and never leaves the machine the browser
 *     is running on.
 *
 * Any other http is refused: a code delivered in plaintext across a network is
 * a code disclosed, whoever receives it.
 */
export function editorCallbackUri(state: string | null, policy: EditorCallbackPolicy = {}): string | null {
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

  // Matched on the parsed URL, never on the string: comparing text would let
  // "https://trusted.example" be a prefix of "https://trusted.example.evil.com",
  // and credentials could disguise the real host.
  if (parsed.username || parsed.password) {
    return null;
  }

  const origins = policy.origins ?? [];
  const domains = policy.domains ?? [];

  if (parsed.protocol === "https:") {
    if (origins.includes(parsed.origin)) {
      return callbackUri;
    }
    return domains.some((domain) => isSubdomainOf(parsed.hostname, domain)) ? callbackUri : null;
  }

  // Loopback is the machine the browser is already on, so http there exposes
  // the code to nothing the browser's own user does not already reach. It still
  // has to be named, so no deployment accepts it without being configured to.
  if (parsed.protocol === "http:" && LOOPBACK_HOSTS.includes(parsed.hostname)) {
    return origins.includes(parsed.origin) ? callbackUri : null;
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
