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
 * What the console kept in browser storage before cloud moved to the Thunder SDK. The SDK keeps
 * its own session, so nothing reads these again, but an upgraded browser would otherwise hold
 * the old refresh token — usable for up to a day — and the user's profile indefinitely.
 *
 * Not listed, because the cloud console still uses them: `org_handle`, `redirect_url`,
 * `tos_accepted:*`, and the SDK's own keys.
 */
const LEGACY_LOCAL_KEYS = ['auth_token', 'refresh_token', 'id_token', 'token_expires_at', 'refresh_token_expires_at', 'auth_mode', 'oidc_state', 'user'];
const LEGACY_SESSION_KEYS = ['pkce_verifier'];

export function clearLegacySession(): void {
  try {
    LEGACY_LOCAL_KEYS.forEach((key) => localStorage.removeItem(key));
    LEGACY_SESSION_KEYS.forEach((key) => sessionStorage.removeItem(key));
  } catch {
    // Storage blocked (private mode, site data disabled): there is nothing left behind to clear.
  }
}
