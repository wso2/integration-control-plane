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

import { beforeEach, describe, expect, it } from 'vitest';
import { clearLegacySession } from './legacySession';

const LEGACY_LOCAL = ['auth_token', 'refresh_token', 'id_token', 'token_expires_at', 'refresh_token_expires_at', 'auth_mode', 'oidc_state', 'user'];

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('clearLegacySession', () => {
  it('removes what the pre-SDK cloud console stored', () => {
    LEGACY_LOCAL.forEach((key) => localStorage.setItem(key, 'old'));
    sessionStorage.setItem('pkce_verifier', 'old');

    clearLegacySession();

    LEGACY_LOCAL.forEach((key) => expect(localStorage.getItem(key)).toBeNull());
    expect(sessionStorage.getItem('pkce_verifier')).toBeNull();
  });

  it('keeps what the cloud console still uses', () => {
    const kept = {
      org_handle: 'acme',
      redirect_url: 'https://console.example/organizations/acme/home',
      'tos_accepted:u1:acme': 'true',
      'thunderid-session-active': 'true',
      'hybrid_data-instance_0-IPAAS_CONSOLE': '{}',
    };
    Object.entries(kept).forEach(([key, value]) => localStorage.setItem(key, value));
    sessionStorage.setItem('session_data-instance_0-IPAAS_CONSOLE', '{"access_token":"t"}');
    sessionStorage.setItem('github_oauth_state', 'state-1');

    clearLegacySession();

    Object.entries(kept).forEach(([key, value]) => expect(localStorage.getItem(key)).toBe(value));
    expect(sessionStorage.getItem('session_data-instance_0-IPAAS_CONSOLE')).toBe('{"access_token":"t"}');
    expect(sessionStorage.getItem('github_oauth_state')).toBe('state-1');
  });

  it('does nothing when there is nothing to clear', () => {
    expect(() => clearLegacySession()).not.toThrow();
  });
});
