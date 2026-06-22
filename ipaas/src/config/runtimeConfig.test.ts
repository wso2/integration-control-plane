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

import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { loadConfig, getDevPortalBaseUrl, getDevPortalApiUrl, type ApiConfig } from './runtimeConfig';

// window.location.origin is pinned to this in vitest.config.ts so the
// origin-derived defaults (asgardeoSignInRedirectUrl, githubAppAuthRedirectUrl)
// are deterministic.
const ORIGIN = 'https://app.test';

// runtimeConfig.ts computes this once, at module load, from import.meta.env.DEV.
// Derive it the same way here instead of hardcoding either branch, so this
// test doesn't depend on which mode vitest happens to run under.
const DEFAULT_SUBSCRIPTIONS_API_URL = import.meta.env.DEV ? '/subscriptions-proxy' : 'https://subscriptions.dv.wso2.com';

function mockFetch(json: unknown, ok = true, status = 200): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok,
      status,
      json: () => Promise.resolve(json),
    }),
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('loadConfig', () => {
  it('maps every config.json field to its ApiConfig field, trimming/deriving where the source does', async () => {
    mockFetch({
      VITE_GRAPHQL_URL: 'https://graphql.example.com/graphql',
      VITE_AUTH_BASE_URL: 'https://auth.example.com/auth/',
      VITE_OBSERVABILITY_URL: 'https://obs.example.com/',
      VITE_ALERTING_URL: 'https://alert.example.com/',
      SYSTEM_APIS_BASE_URL: 'https://sysapis.example.com',
      BILLING_API_BASE_URL: 'https://billing.example.com/',
      ASGARDEO_CLIENT_ID: 'client-123',
      ASGARDEO_AUTHORIZE_ENDPOINT: 'https://idp.example.com/authorize',
      ASGARDEO_TOKEN_ENDPOINT: 'https://idp.example.com/token',
      ASGARDEO_SIGN_IN_REDIRECT_URL: 'https://app.example.com/signin',
      ASGARDEO_SCOPE: 'openid email',
      STS_TOKEN_ENDPOINT: 'https://sts.example.com/token',
      STS_CLIENT_ID: 'sts-client-1',
      STS_SCOPE: 'scope-a scope-b',
      CHOREO_BASE_API_URL: 'https://choreo.example.com/',
      APIM_BASE_URL: 'https://apim.example.com/',
      INSIGHTS_BASE_URL: 'https://insights.example.com/',
      ASGARDEO_ORG_NUMERIC_ID: '42',
      SYS_API_PREFIX: 'prefix-xyz',
      GITHUB_APP_CLIENT_ID: 'gh-client-1',
      GITHUB_APP_AUTH_REDIRECTION_URL: 'https://app.example.com/ghapp',
      SUBSCRIPTIONS_API_URL: 'https://subs.example.com',
      SAMPLES_URL: 'https://samples.example.com',
      PREBUILT_INTEGRATIONS_URL: 'https://prebuilt.example.com',
      ASGARDEO_SIGNUP_URL: 'https://idp.example.com/signup',
      AI_COPILOT_URL_SUFFIX: '/copilot-suffix',
      AI_COPILOT_DATACOLLECTOR_BASE_URL: 'https://copilot-dc.example.com/',
    });

    await loadConfig();

    expect(window.API_CONFIG).toEqual<ApiConfig>({
      graphqlUrl: 'https://graphql.example.com/graphql',
      authBaseUrl: 'https://auth.example.com/auth',
      observabilityUrl: 'https://obs.example.com',
      alertingUrl: 'https://alert.example.com',
      asgardeoClientId: 'client-123',
      asgardeoAuthorizeEndpoint: 'https://idp.example.com/authorize',
      asgardeoTokenEndpoint: 'https://idp.example.com/token',
      asgardeoSignInRedirectUrl: 'https://app.example.com/signin',
      asgardeoScope: 'openid email',
      stsTokenEndpoint: 'https://sts.example.com/token',
      stsClientId: 'sts-client-1',
      stsScope: 'scope-a scope-b',
      choreoBaseApiUrl: 'https://choreo.example.com',
      choreoOrgApiUrl: 'https://choreo.example.com/orgs/1.0.0',
      apimBaseUrl: 'https://apim.example.com',
      insightsBaseUrl: 'https://insights.example.com',
      systemApisBaseUrl: 'https://sysapis.example.com',
      asgardeoOrgNumericId: 42,
      sysApiPrefix: 'prefix-xyz',
      githubAppClientId: 'gh-client-1',
      githubAppAuthRedirectUrl: 'https://app.example.com/ghapp',
      subscriptionsApiUrl: 'https://subs.example.com',
      billingApiBaseUrl: 'https://billing.example.com',
      samplesUrl: 'https://samples.example.com',
      prebuiltIntegrationsUrl: 'https://prebuilt.example.com',
      asgardeoSignupUrl: 'https://idp.example.com/signup',
      aiCopilotUrlSuffix: '/copilot-suffix',
      aiCopilotDatacollectorBaseUrl: 'https://copilot-dc.example.com',
    });
  });

  it('falls back to hardcoded defaults for fields config.json omits', async () => {
    mockFetch({});

    await loadConfig();

    expect(window.API_CONFIG.graphqlUrl).toBe('https://apis.preview-dv.choreo.dev/projects/1.0.0/graphql');
    expect(window.API_CONFIG.authBaseUrl).toBe('https://localhost:9445/auth');
    expect(window.API_CONFIG.choreoBaseApiUrl).toBe('https://apis.preview-dv.choreo.dev');
    expect(window.API_CONFIG.choreoOrgApiUrl).toBe('https://apis.preview-dv.choreo.dev/orgs/1.0.0');
    expect(window.API_CONFIG.alertingUrl).toBe('https://localhost:9448/icp/alerting');
    expect(window.API_CONFIG.asgardeoSignInRedirectUrl).toBe(`${ORIGIN}/signin`);
    expect(window.API_CONFIG.githubAppAuthRedirectUrl).toBe(`${ORIGIN}/ghapp`);
    expect(window.API_CONFIG.systemApisBaseUrl).toBe('');
    expect(window.API_CONFIG.asgardeoOrgNumericId).toBeUndefined();
  });

  it('trims exactly one trailing slash from URL fields, but not graphqlUrl or the sign-in redirect URL', async () => {
    mockFetch({
      VITE_AUTH_BASE_URL: 'https://auth.example.com//',
      VITE_OBSERVABILITY_URL: 'https://obs.example.com/',
      APIM_BASE_URL: 'https://apim.example.com/',
      INSIGHTS_BASE_URL: 'https://insights.example.com/',
      CHOREO_BASE_API_URL: 'https://choreo.example.com/',
    });

    await loadConfig();

    // The trim regex (/\/$/) strips a single trailing slash, leaving one behind
    // if the input had two — this pins that exact (possibly surprising) behavior.
    expect(window.API_CONFIG.authBaseUrl).toBe('https://auth.example.com/');
    expect(window.API_CONFIG.observabilityUrl).toBe('https://obs.example.com');
    expect(window.API_CONFIG.apimBaseUrl).toBe('https://apim.example.com');
    expect(window.API_CONFIG.insightsBaseUrl).toBe('https://insights.example.com');
    expect(window.API_CONFIG.choreoBaseApiUrl).toBe('https://choreo.example.com');
  });

  describe('alertingUrl precedence', () => {
    it('an explicit VITE_ALERTING_URL wins even when SYSTEM_APIS_BASE_URL is also set', async () => {
      mockFetch({ VITE_ALERTING_URL: 'https://explicit-alert.example.com/', SYSTEM_APIS_BASE_URL: 'https://sysapis.example.com' });
      await loadConfig();
      expect(window.API_CONFIG.alertingUrl).toBe('https://explicit-alert.example.com');
    });

    it('derives from SYSTEM_APIS_BASE_URL when no explicit alerting URL is given', async () => {
      mockFetch({ SYSTEM_APIS_BASE_URL: 'https://sysapis.example.com/' });
      await loadConfig();
      expect(window.API_CONFIG.alertingUrl).toBe('https://sysapis.example.com/systemapis/choreo-alerting-api/v1.0');
    });

    it('falls back to the hardcoded default when neither is given', async () => {
      mockFetch({});
      await loadConfig();
      expect(window.API_CONFIG.alertingUrl).toBe('https://localhost:9448/icp/alerting');
    });
  });

  describe('asgardeoOrgNumericId', () => {
    it('parses ASGARDEO_ORG_NUMERIC_ID from config.json when present', async () => {
      mockFetch({ ASGARDEO_ORG_NUMERIC_ID: '7' });
      await loadConfig();
      expect(window.API_CONFIG.asgardeoOrgNumericId).toBe(7);
    });

    it('falls back to localStorage when config.json omits it', async () => {
      localStorage.setItem('icp_org_numeric_id', '99');
      mockFetch({});
      await loadConfig();
      expect(window.API_CONFIG.asgardeoOrgNumericId).toBe(99);
    });

    it('is undefined when neither config.json nor localStorage has it', async () => {
      mockFetch({});
      await loadConfig();
      expect(window.API_CONFIG.asgardeoOrgNumericId).toBeUndefined();
    });
  });

  it('falls back wholesale to defaults when the response is not ok, and warns', async () => {
    mockFetch({ VITE_GRAPHQL_URL: 'https://should-be-ignored.example.com' }, false, 500);

    await loadConfig();

    expect(window.API_CONFIG).toEqual<ApiConfig>({
      graphqlUrl: 'https://apis.preview-dv.choreo.dev/projects/1.0.0/graphql',
      authBaseUrl: 'https://localhost:9445/auth',
      observabilityUrl: 'https://localhost:9448/icp/observability',
      alertingUrl: 'https://localhost:9448/icp/alerting',
      asgardeoClientId: '',
      asgardeoAuthorizeEndpoint: 'https://dev.api.asgardeo.io/t/a/oauth2/authorize',
      asgardeoTokenEndpoint: 'https://dev.api.asgardeo.io/t/a/oauth2/token',
      asgardeoSignInRedirectUrl: `${ORIGIN}/signin`,
      asgardeoScope: 'openid profile email groups',
      stsTokenEndpoint: '',
      stsClientId: '',
      stsScope: '',
      choreoBaseApiUrl: 'https://apis.preview-dv.choreo.dev',
      choreoOrgApiUrl: 'https://apis.preview-dv.choreo.dev/orgs/1.0.0',
      apimBaseUrl: 'https://sts.preview-dv.choreo.dev',
      insightsBaseUrl: 'https://choreocontrolplane.preview-dv.choreo.dev',
      systemApisBaseUrl: '',
      sysApiPrefix: '783c6c4d-8b9b-4190-b70a-e717ab1ee739-systemapis',
      githubAppClientId: '',
      githubAppAuthRedirectUrl: `${ORIGIN}/ghapp`,
      subscriptionsApiUrl: DEFAULT_SUBSCRIPTIONS_API_URL,
      billingApiBaseUrl: '',
      asgardeoSignupUrl: 'https://dev.asgardeo.io/signup',
      aiCopilotUrlSuffix: '',
      aiCopilotDatacollectorBaseUrl: '',
    });
    expect(console.warn).toHaveBeenCalledOnce();
  });

  it('falls back wholesale to defaults when fetch itself rejects, and warns', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('network down')),
    );

    await loadConfig();

    expect(window.API_CONFIG.graphqlUrl).toBe('https://apis.preview-dv.choreo.dev/projects/1.0.0/graphql');
    expect(window.API_CONFIG.subscriptionsApiUrl).toBe(DEFAULT_SUBSCRIPTIONS_API_URL);
    expect(console.warn).toHaveBeenCalledOnce();
  });
});

describe('getDevPortalBaseUrl / getDevPortalApiUrl', () => {
  it('substitutes the devportal label for the choreoOrgApiUrl hostname', async () => {
    mockFetch({ CHOREO_BASE_API_URL: 'https://apis.something.choreo.dev' });
    await loadConfig();

    expect(getDevPortalBaseUrl()).toBe('https://devportal.something.choreo.dev');
    expect(getDevPortalApiUrl('myorg', 'My API', 'v1')).toBe('https://devportal.something.choreo.dev/myorg/views/default/api/My%20API-v1');
  });

  it('returns null when choreoOrgApiUrl cannot be parsed as a URL', () => {
    // Deliberately minimal fixture — only the field these two functions read.
    window.API_CONFIG = { choreoOrgApiUrl: '' } as unknown as ApiConfig;

    expect(getDevPortalBaseUrl()).toBeNull();
    expect(getDevPortalApiUrl('myorg', 'My API', 'v1')).toBeNull();
  });
});
