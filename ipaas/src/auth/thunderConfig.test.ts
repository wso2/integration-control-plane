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
import { signInParams, thunderConfig, THUNDER_INSTANCE_ID } from './thunderConfig';

beforeEach(() => {
  window.API_CONFIG = {
    authBaseUrl: 'https://idp.example',
    asgardeoClientId: 'IPAAS_CONSOLE',
    asgardeoScope: 'openid profile email',
    asgardeoSignInRedirectUrl: 'https://console.example/signin',
    asgardeoResource: 'urn:wso2:amp',
  } as unknown as typeof window.API_CONFIG;
});

describe('thunderConfig', () => {
  it('maps the runtime config onto the SDK options', () => {
    const config = thunderConfig();
    expect(config).toMatchObject({
      instanceId: THUNDER_INSTANCE_ID,
      baseUrl: 'https://idp.example',
      clientId: 'IPAAS_CONSOLE',
      scopes: 'openid profile email',
      afterSignInUrl: 'https://console.example/signin',
      afterSignOutUrl: window.location.origin,
    });
  });

  it('keeps tokens per tab, for as long as the tab is open, and refreshes them itself', () => {
    const config = thunderConfig();
    expect(config.storage).toBe('sessionStorage');
    expect(config.tokenLifecycle?.refreshToken?.autoRefresh).toBe(true);
  });

  it('gives up on a silent sign-in after 3s, not the SDK default 10s', () => {
    expect(thunderConfig().session?.silentSignIn).toEqual({ timeout: 3_000 });
  });

  it('turns off what the console does not use', () => {
    const { preferences } = thunderConfig();
    expect(preferences?.resolveFromMeta).toBe(false);
    expect(preferences?.user?.fetchUserProfile).toBe(false);
    expect(preferences?.i18n?.storageStrategy).toBe('none');
  });

  // An empty resource= on the token request is rejected with invalid_target.
  it('puts no resource on the token request', () => {
    expect(thunderConfig().tokenRequest).toBeUndefined();
  });
});

describe('signInParams', () => {
  it('sends the resource indicator on the authorize request', () => {
    expect(signInParams()).toEqual({ resource: 'urn:wso2:amp' });
  });

  it('adds fidp when one is chosen', () => {
    expect(signInParams('github')).toEqual({ resource: 'urn:wso2:amp', fidp: 'github' });
  });

  it('sends no resource when none is configured', () => {
    window.API_CONFIG.asgardeoResource = undefined;
    expect(signInParams()).toEqual({});
  });
});
