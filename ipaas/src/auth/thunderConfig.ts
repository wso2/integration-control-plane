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

import type { ThunderIDProviderProps } from '@thunderid/react';

/** The SDK instance the console uses. Its `state` on the authorize request is prefixed with this. */
export const THUNDER_INSTANCE_ID = 0;

/**
 * Thunder SDK options from the runtime config. Reuses the ASGARDEO_* keys the
 * cloud deployment already sets until it gets keys of its own.
 */
export function thunderConfig(): ThunderIDProviderProps {
  const { authBaseUrl, asgardeoClientId, asgardeoScope, asgardeoSignInRedirectUrl } = window.API_CONFIG;
  return {
    instanceId: THUNDER_INSTANCE_ID,
    baseUrl: authBaseUrl,
    clientId: asgardeoClientId,
    scopes: asgardeoScope,
    afterSignInUrl: asgardeoSignInRedirectUrl,
    // The only post-logout URI the client registers: the bare origin.
    afterSignOutUrl: window.location.origin,
    // Per tab, and gone when the tab closes (the cloud team's call). A reload keeps it; a new
    // tab signs in again through Thunder, whose own session usually makes that a redirect.
    // Each tab also refreshes its own tokens, so tabs never race on Thunder's rotating refresh token.
    storage: 'sessionStorage',
    tokenLifecycle: { refreshToken: { autoRefresh: true } },
    // A working prompt=none answer takes about a second. The SDK would wait 10s for an iframe that
    // never answers (framing blocked), so give up sooner and sign in interactively.
    session: { silentSignIn: { timeout: 3_000 } },
    // The SDK checks ID token signatures only with RSA/PS/ML-DSA algorithms, and
    // Thunder also signs with ES256. The ID token comes straight from the token
    // endpoint over TLS (OIDC Core 3.1.3.7), is only read for the profile, and
    // the gateway verifies every access token.
    tokenValidation: { idToken: { validate: false } },
    preferences: {
      // The console renders no SDK sign-in UI, so it needs no flow metadata.
      resolveFromMeta: false,
      // The ID token carries the profile; /users/me would only repeat it.
      user: { fetchUserProfile: false },
      // Otherwise the SDK writes a language cookie for the whole parent domain.
      i18n: { storageStrategy: 'none' },
    },
  };
}

/**
 * Extra authorize-request parameters. `resource` must reach /oauth2/authorize,
 * where Thunder decides which permission scopes to grant — and only there: the
 * token endpoint rejects an empty `resource=` with invalid_target.
 */
export function signInParams(fidp?: string): Record<string, string> {
  const { asgardeoResource } = window.API_CONFIG;
  return {
    ...(asgardeoResource ? { resource: asgardeoResource } : {}),
    ...(fidp ? { fidp } : {}),
  };
}
