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

/** Reads a JWT's claims. Never verifies: the gateway does, and the SDK fetched the token over TLS. */
export function decodeJwtPayload(token: string): Record<string, unknown> {
  // base64url without padding; restore '+'/'/' and pad so atob accepts it.
  const normalized = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  // atob yields one character per byte; the claims are UTF-8, so decode the bytes as such.
  const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
}

/** A string claim, or undefined when it is missing, empty or not a string. */
export function stringClaim(claims: Record<string, unknown>, name: string): string | undefined {
  const value = claims[name];
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/** Whether the token's `exp` has passed. A token without one is treated as expired. */
export function isExpired(token: string): boolean {
  try {
    const exp = decodeJwtPayload(token).exp;
    return typeof exp !== 'number' || exp * 1000 <= Date.now();
  } catch {
    return true;
  }
}
