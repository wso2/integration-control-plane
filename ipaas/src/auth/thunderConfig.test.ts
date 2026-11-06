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
import { bffSignInUrl, signInParams, thunderConfig, THUNDER_INSTANCE_ID } from './thunderConfig';

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

describe('thunderConfig on the gateway (BFF)', () => {
  beforeEach(() => {
    window.API_CONFIG.authBffContext = '/_auth/integration';
  });

  it('points the SDK at the gateway’s session endpoints and API root', () => {
    expect(thunderConfig()).toMatchObject({
      instanceId: THUNDER_INSTANCE_ID,
      baseUrl: window.location.origin,
      afterSignInUrl: 'https://console.example/signin',
      endpoints: {
        backend: {
          signIn: '/_auth/integration/signin',
          session: '/_auth/integration/userinfo',
          checkSession: '/_auth/integration/checksession',
          refresh: '/_auth/integration/refresh',
          signOut: '/_auth/integration/logout',
          proxy: '/_api',
          token: '/_auth/integration/token',
        },
      },
    });
  });

  it('starts sign-in where AUTH_BFF_SIGN_IN_URL says, under the configured API root', () => {
    window.API_CONFIG.authBffSignInUrl = '/_auth/cloud/login?returnTo=%2F_auth%2Fintegration%2Fsignin';
    window.API_CONFIG.authBffProxyContext = '/gw/_api';
    const backend = thunderConfig().endpoints?.backend as { signIn: string; proxy: string };
    expect(backend.signIn).toBe('/_auth/cloud/login?returnTo=%2F_auth%2Fintegration%2Fsignin');
    expect(backend.proxy).toBe('/gw/_api');
  });

  it('reaches nothing at the IdP: no discovery, flow metadata, profile fetch or client', () => {
    const config = thunderConfig();
    expect(config.discovery?.wellKnown?.enabled).toBe(false);
    expect(config.preferences?.resolveFromMeta).toBe(false);
    expect(config.preferences?.user?.fetchUserProfile).toBe(false);
    expect(config.clientId).toBeUndefined();
    expect(config.session?.silentSignIn).toBeUndefined();
  });

  it('starts sign-in at the context’s signin, returning to the page', () => {
    const url = new URL(bffSignInUrl('/projects?a=1&b=2'), window.location.origin);
    expect(url.pathname).toBe('/_auth/integration/signin');
    expect(url.searchParams.get('returnTo')).toBe('/projects?a=1&b=2');
  });

  it('nests the page inside AUTH_BFF_SIGN_IN_URL’s returnTo, so its query survives both hops', () => {
    window.API_CONFIG.authBffSignInUrl = '/_auth/cloud/login?returnTo=%2F_auth%2Fintegration%2Fsignin';
    const outer = new URL(bffSignInUrl('/projects?a=1&b=2'), window.location.origin);
    expect(outer.pathname).toBe('/_auth/cloud/login');
    expect([...outer.searchParams.keys()]).toEqual(['returnTo']);
    const inner = new URL(outer.searchParams.get('returnTo') ?? '', window.location.origin);
    expect(inner.pathname).toBe('/_auth/integration/signin');
    expect(inner.searchParams.get('returnTo')).toBe('/projects?a=1&b=2');
  });
});
