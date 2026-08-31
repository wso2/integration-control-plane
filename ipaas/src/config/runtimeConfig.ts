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

interface RuntimeConfig {
  VITE_GRAPHQL_URL?: string;
  VITE_AUTH_BASE_URL?: string;
  VITE_OBSERVABILITY_URL?: string;
  VITE_ALERTING_URL?: string;
  SYSTEM_APIS_BASE_URL?: string;
  BILLING_API_BASE_URL?: string;
  BILLING_CONSOLE_URL?: string;
  CHOREO_SAAS_OFFER_URL?: string;
  ENABLE_BILLING_FEATURE?: string | boolean;
  ASGARDEO_CLIENT_ID?: string;
  ASGARDEO_AUTHORIZE_ENDPOINT?: string;
  ASGARDEO_TOKEN_ENDPOINT?: string;
  ASGARDEO_SIGN_IN_REDIRECT_URL?: string;
  ASGARDEO_SCOPE?: string;
  STS_TOKEN_ENDPOINT?: string;
  STS_CLIENT_ID?: string;
  STS_SCOPE?: string;
  CHOREO_BASE_API_URL?: string;
  APIM_BASE_URL?: string;
  INSIGHTS_BASE_URL?: string;
  ASGARDEO_ORG_NUMERIC_ID?: string;
  SYS_API_PREFIX?: string;
  GITHUB_APP_CLIENT_ID?: string;
  GITHUB_APP_AUTH_REDIRECTION_URL?: string;
  GITHUB_APP_SLUG?: string;
  SUBSCRIPTIONS_API_URL?: string;
  SAMPLES_URL?: string;
  PREBUILT_INTEGRATIONS_URL?: string;
  ASGARDEO_SIGNUP_URL?: string;
  AI_COPILOT_URL_SUFFIX?: string;
  AI_COPILOT_DATACOLLECTOR_BASE_URL?: string;
  PLATFORM_SERVICES_API_BASE_URL?: string;
  ENABLE_PLATFORM_SERVICES_FEATURE?: string | boolean;
  /** Comma-separated list of "REGION::https://domain" entries, e.g. "US::https://console.us.devant.dev,EU::https://console.eu.devant.dev". When set, a region selector is shown on login/signup. */
  AVAILABLE_LOGIN_REGIONS?: string;
  CHOREO_URL_MANAGER_URL?: string;
  ENABLE_CUSTOM_URL_MAPPINGS_FEATURE?: string | boolean;
  RAG_INGESTION_IMAGE?: string;
  ENABLE_RAG_INGESTION_FEATURE?: string | boolean;
  RAG_INGESTION_BACKEND?: string;
  INTEGRATION_BUILDER_COPILOT_BASE_URL?: string;
  INTEGRATION_BUILDER_LLM_MODEL?: string;
  INTEGRATION_BUILDER_MAX_TOKENS?: string;
  INTEGRATION_BUILDER_CENTRAL_GRAPHQL_URL?: string;
  /** Which of the WIP tracking codes (GTM container, CookiePro domain script) to load — 'dev' | 'stage' | 'prod'. Unset/unrecognized defaults to 'dev'. */
  TRACKING_ENV?: string;
  MOESIF_APP_API_KEY?: string;
}

export interface ApiConfig {
  graphqlUrl: string;
  authBaseUrl: string;
  observabilityUrl: string;
  alertingUrl: string;
  asgardeoClientId: string;
  asgardeoAuthorizeEndpoint: string;
  asgardeoTokenEndpoint: string;
  asgardeoSignInRedirectUrl: string;
  asgardeoScope: string;
  stsTokenEndpoint: string;
  stsClientId: string;
  stsScope: string;
  choreoBaseApiUrl: string;
  choreoOrgApiUrl: string;
  apimBaseUrl: string;
  insightsBaseUrl: string;
  asgardeoOrgNumericId?: number;
  systemApisBaseUrl?: string;
  sysApiPrefix: string;
  githubAppClientId?: string;
  githubAppAuthRedirectUrl?: string;
  /** GitHub App slug — powers https://github.com/apps/{slug}/installations/new when the App is authorized but not yet installed on any account. */
  githubAppSlug?: string;
  subscriptionsApiUrl: string;
  billingApiBaseUrl: string;
  /** External billing console base — the Upgrade button links to `${billingConsoleUrl}/cloud/devant/upgrade`. */
  billingConsoleUrl?: string;
  /** Azure marketplace SaaS offer — shows the "Upgrade via Azure marketplace" split-button option when set. */
  choreoSaasOfferUrl?: string;
  /** Gates the free-tier Upgrade button (mirrors Devant's ENABLE_BILLING_FEATURE). */
  enableBillingFeature?: boolean;
  samplesUrl?: string;
  prebuiltIntegrationsUrl?: string;
  asgardeoSignupUrl: string;
  aiCopilotUrlSuffix: string;
  aiCopilotDatacollectorBaseUrl: string;
  /** Comma-separated "REGION::https://domain" entries. Present only when multi-region is configured. */
  availableLoginRegions?: string;
  /** Choreo URL-manager service base (custom domains + URL mappings). Optional — when unset, the URL Settings section stays hidden. */
  urlManagerUrl?: string;
  /** Feature flag mirroring Devant's ENABLE_CUSTOM_URL_MAPPINGS_FEATURE. */
  enableCustomUrlMappings?: boolean;
  /** Platform-services (managed databases) base URL. When unset, the admin Databases page stays disabled. */
  platformServicesApiBaseUrl?: string;
  /** Gates the admin Databases feature (mirrors Devant's ENABLE_PLATFORM_SERVICES_FEATURE). */
  enablePlatformServicesFeature?: boolean;
  /** Container image deployed by the RAG Ingestion wizard. Falls back to {@link RAG_INGESTION_DEFAULT_IMAGE} when unset. */
  ragIngestionImage?: string;
  /** Gates the RAG Ingestion (Scheduled Ingestion) feature. */
  enableRagIngestionFeature?: boolean;
  /** RAG backend base URL — powers the Retrieval query endpoint. When unset, Retrieval's query action is disabled. */
  ragBackendUrl?: string;
  /** Internal Marketplace API base — derived from choreoBaseApiUrl. Used to read/write service descriptions (Overview). */
  internalMarketplaceUrl: string;
  /** AI Integration Builder copilot base URL. */
  integrationBuilderCopilotBaseUrl: string;
  /** AI Integration Builder LLM model name. */
  integrationBuilderLlmModel: string;
  /** AI Integration Builder max tokens for LLM. */
  integrationBuilderMaxTokens: number;
  /** AI Integration Builder central GraphQL URL for connectors. */
  integrationBuilderCentralGraphqlUrl: string;
  /** Which of the WIP tracking codes (GTM container, CookiePro domain script) to load. */
  trackingEnv: 'dev' | 'stage' | 'prod';
  /** Moesif application-tracking app key (WIP product analytics, not the customer-facing API-traffic Moesif key under Settings). */
  moesifAppApiKey?: string;
}

// Extend window interface
declare global {
  interface Window {
    API_CONFIG: ApiConfig;
  }
}

// Accepts a value only when it parses to a positive finite integer; else falls back.
function parsePositiveInt(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

// Default configuration (used as fallback if config.json fails to load)
const DEFAULT_CONFIG: ApiConfig = {
  graphqlUrl: 'https://apis.preview-dv.choreo.dev/projects/1.0.0/graphql',
  authBaseUrl: 'https://localhost:9445/auth',
  observabilityUrl: 'https://localhost:9448/icp/observability',
  alertingUrl: 'https://localhost:9448/icp/alerting',
  asgardeoClientId: '',
  asgardeoAuthorizeEndpoint: 'https://dev.api.asgardeo.io/t/a/oauth2/authorize',
  asgardeoTokenEndpoint: 'https://dev.api.asgardeo.io/t/a/oauth2/token',
  asgardeoSignInRedirectUrl: `${window.location.origin}/signin`,
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
  githubAppAuthRedirectUrl: `${window.location.origin}/ghapp`,
  githubAppSlug: '',
  subscriptionsApiUrl: import.meta.env.DEV ? '/subscriptions-proxy' : 'https://subscriptions.dv.wso2.com',
  billingApiBaseUrl: '',
  asgardeoSignupUrl: 'https://dev.asgardeo.io/signup',
  aiCopilotUrlSuffix: '',
  aiCopilotDatacollectorBaseUrl: '',
  availableLoginRegions: undefined,
  integrationBuilderCopilotBaseUrl: 'https://apis.preview-dv.devant.dev/copilot',
  integrationBuilderLlmModel: 'claude-sonnet-4-6',
  integrationBuilderMaxTokens: 1024,
  integrationBuilderCentralGraphqlUrl: 'https://api.dev-central.ballerina.io/2.0/graphql',
  internalMarketplaceUrl: 'https://apis.preview-dv.choreo.dev/marketplace/0.1.0',
  trackingEnv: 'dev',
  moesifAppApiKey: 'eyJhcHAiOiIzOTE6Njg4IiwidmVyIjoiMi4xIiwib3JnIjoiMjYyOjgxMCIsImlhdCI6MTc4MDI3MjAwMH0.PkVCaZxNZNsZluB9t4W0cItGgez1khyaOS3Z-O_XTZg',
};

// Accepts only the recognized tracking-env values; anything else (including unset) falls back to 'dev'.
function parseTrackingEnv(value: unknown): ApiConfig['trackingEnv'] {
  return value === 'stage' || value === 'prod' ? value : 'dev';
}

/**
 * Load configuration from /config.json.
 * This allows modifying URLs after build without rebuilding the app.
 */
export async function loadConfig(): Promise<void> {
  try {
    const response = await fetch('/config.json');
    if (!response.ok) {
      throw new Error(`Failed to load config.json: ${response.status}`);
    }

    const config: RuntimeConfig = await response.json();
    const trim = (url: string): string => url.replace(/\/$/, '');
    const choreoBase = trim(config.CHOREO_BASE_API_URL || DEFAULT_CONFIG.choreoBaseApiUrl);
    const systemApisBase = trim(config.SYSTEM_APIS_BASE_URL || DEFAULT_CONFIG.systemApisBaseUrl || '');

    window.API_CONFIG = {
      graphqlUrl: config.VITE_GRAPHQL_URL || DEFAULT_CONFIG.graphqlUrl,
      authBaseUrl: trim(config.VITE_AUTH_BASE_URL || DEFAULT_CONFIG.authBaseUrl),
      observabilityUrl: trim(config.VITE_OBSERVABILITY_URL || DEFAULT_CONFIG.observabilityUrl),
      alertingUrl: config.VITE_ALERTING_URL ? trim(config.VITE_ALERTING_URL) : systemApisBase ? `${systemApisBase}/systemapis/choreo-alerting-api/v1.0` : DEFAULT_CONFIG.alertingUrl,
      asgardeoClientId: config.ASGARDEO_CLIENT_ID || DEFAULT_CONFIG.asgardeoClientId,
      asgardeoAuthorizeEndpoint: config.ASGARDEO_AUTHORIZE_ENDPOINT || DEFAULT_CONFIG.asgardeoAuthorizeEndpoint,
      asgardeoTokenEndpoint: config.ASGARDEO_TOKEN_ENDPOINT || DEFAULT_CONFIG.asgardeoTokenEndpoint,
      asgardeoSignInRedirectUrl: config.ASGARDEO_SIGN_IN_REDIRECT_URL || DEFAULT_CONFIG.asgardeoSignInRedirectUrl,
      asgardeoScope: config.ASGARDEO_SCOPE || DEFAULT_CONFIG.asgardeoScope,
      stsTokenEndpoint: config.STS_TOKEN_ENDPOINT || DEFAULT_CONFIG.stsTokenEndpoint,
      stsClientId: config.STS_CLIENT_ID || DEFAULT_CONFIG.stsClientId,
      stsScope: config.STS_SCOPE || '',
      choreoBaseApiUrl: choreoBase,
      choreoOrgApiUrl: `${choreoBase}/orgs/1.0.0`,
      apimBaseUrl: trim(config.APIM_BASE_URL || DEFAULT_CONFIG.apimBaseUrl),
      insightsBaseUrl: trim(config.INSIGHTS_BASE_URL || DEFAULT_CONFIG.insightsBaseUrl),
      systemApisBaseUrl: systemApisBase || DEFAULT_CONFIG.systemApisBaseUrl,
      asgardeoOrgNumericId: (() => {
        if (config.ASGARDEO_ORG_NUMERIC_ID) return parseInt(config.ASGARDEO_ORG_NUMERIC_ID, 10);
        const stored = localStorage.getItem('org_numeric_id');
        return stored ? parseInt(stored, 10) : undefined;
      })(),
      sysApiPrefix: config.SYS_API_PREFIX || DEFAULT_CONFIG.sysApiPrefix,
      githubAppClientId: config.GITHUB_APP_CLIENT_ID || DEFAULT_CONFIG.githubAppClientId,
      githubAppAuthRedirectUrl: config.GITHUB_APP_AUTH_REDIRECTION_URL || DEFAULT_CONFIG.githubAppAuthRedirectUrl,
      githubAppSlug: config.GITHUB_APP_SLUG || DEFAULT_CONFIG.githubAppSlug,
      subscriptionsApiUrl: config.SUBSCRIPTIONS_API_URL || DEFAULT_CONFIG.subscriptionsApiUrl,
      billingApiBaseUrl: trim(config.BILLING_API_BASE_URL || DEFAULT_CONFIG.billingApiBaseUrl),
      samplesUrl: config.SAMPLES_URL || undefined,
      prebuiltIntegrationsUrl: config.PREBUILT_INTEGRATIONS_URL || undefined,
      asgardeoSignupUrl: config.ASGARDEO_SIGNUP_URL || DEFAULT_CONFIG.asgardeoSignupUrl,
      aiCopilotUrlSuffix: config.AI_COPILOT_URL_SUFFIX || DEFAULT_CONFIG.aiCopilotUrlSuffix,
      aiCopilotDatacollectorBaseUrl: trim(config.AI_COPILOT_DATACOLLECTOR_BASE_URL || DEFAULT_CONFIG.aiCopilotDatacollectorBaseUrl),
      urlManagerUrl: config.CHOREO_URL_MANAGER_URL ? trim(config.CHOREO_URL_MANAGER_URL) : undefined,
      enableCustomUrlMappings: config.ENABLE_CUSTOM_URL_MAPPINGS_FEATURE === 'true' || config.ENABLE_CUSTOM_URL_MAPPINGS_FEATURE === true,
      billingConsoleUrl: config.BILLING_CONSOLE_URL ? trim(config.BILLING_CONSOLE_URL) : undefined,
      choreoSaasOfferUrl: config.CHOREO_SAAS_OFFER_URL || undefined,
      enableBillingFeature: config.ENABLE_BILLING_FEATURE === 'true' || config.ENABLE_BILLING_FEATURE === true,
      platformServicesApiBaseUrl: config.PLATFORM_SERVICES_API_BASE_URL ? trim(config.PLATFORM_SERVICES_API_BASE_URL) : undefined,
      enablePlatformServicesFeature: config.ENABLE_PLATFORM_SERVICES_FEATURE === 'true' || config.ENABLE_PLATFORM_SERVICES_FEATURE === true,
      availableLoginRegions: config.AVAILABLE_LOGIN_REGIONS || undefined,
      ragIngestionImage: config.RAG_INGESTION_IMAGE ? trim(config.RAG_INGESTION_IMAGE) : undefined,
      enableRagIngestionFeature: config.ENABLE_RAG_INGESTION_FEATURE === 'true' || config.ENABLE_RAG_INGESTION_FEATURE === true,
      ragBackendUrl: config.RAG_INGESTION_BACKEND ? trim(config.RAG_INGESTION_BACKEND) : undefined,
      integrationBuilderCopilotBaseUrl: config.INTEGRATION_BUILDER_COPILOT_BASE_URL ? trim(config.INTEGRATION_BUILDER_COPILOT_BASE_URL) : 'https://apis.preview-dv.devant.dev/copilot',
      integrationBuilderLlmModel: config.INTEGRATION_BUILDER_LLM_MODEL || 'claude-sonnet-4-6',
      integrationBuilderMaxTokens: parsePositiveInt(config.INTEGRATION_BUILDER_MAX_TOKENS, DEFAULT_CONFIG.integrationBuilderMaxTokens),
      integrationBuilderCentralGraphqlUrl: config.INTEGRATION_BUILDER_CENTRAL_GRAPHQL_URL || 'https://api.dev-central.ballerina.io/2.0/graphql',
      internalMarketplaceUrl: `${choreoBase}/marketplace/0.1.0`,
      trackingEnv: parseTrackingEnv(config.TRACKING_ENV),
      moesifAppApiKey: config.MOESIF_APP_API_KEY || DEFAULT_CONFIG.moesifAppApiKey,
    };

    console.info('✓ Runtime configuration loaded from config.json');
  } catch (error) {
    console.warn('Failed to load runtime config, using defaults:', error);
    window.API_CONFIG = DEFAULT_CONFIG;
  }
}

// URL helpers — only for values that require computation (path concatenation or runtime parameters).
// Simple field reads (e.g. window.API_CONFIG.apimBaseUrl) are done directly at call sites.

export const loginApiUrl = (): string => `${window.API_CONFIG.authBaseUrl}/login`;
export const refreshTokenApiUrl = (): string => `${window.API_CONFIG.authBaseUrl}/refresh-token`;
export const revokeTokenApiUrl = (): string => `${window.API_CONFIG.authBaseUrl}/revoke-token`;

export const choreoAlertingApiUrl = (gatewayHost: string): string => {
  const { alertingUrl, sysApiPrefix } = window.API_CONFIG;
  if (alertingUrl) return alertingUrl;
  return `https://${sysApiPrefix}.${gatewayHost}/systemapis/choreo-alerting-api/v1.0`;
};

export const choreologgingProjectLogsApiUrl = (gatewayHost: string): string => {
  const { sysApiPrefix } = window.API_CONFIG;
  return `https://${sysApiPrefix}.${gatewayHost}/systemapis/choreologgingapi/0.2.0/logs/project/application?live=true`;
};

// Insights (Usage Insights / APIM traffic) query endpoint — served by the same
// per-org systemapis gateway as alerting/logging, not `insightsBaseUrl` (that
// default is a stale host that 404s; devant's own captured traffic — see
// devant-insights-01.har — hits `<sysApiPrefix>.<gatewayHost>/systemapis/analyticsqueryapi/0.1.0/query`).
export const choreoInsightsQueryApiUrl = (gatewayHost: string): string => {
  const { sysApiPrefix } = window.API_CONFIG;
  return `https://${sysApiPrefix}.${gatewayHost}/systemapis/analyticsqueryapi/0.1.0/query`;
};

export const choreologgingComponentLogsApiUrl = (): string => {
  const base = window.API_CONFIG.systemApisBaseUrl ?? '';
  return `${base}/systemapis/choreologgingapi/0.2.0/logs/component/application`;
};

export const choreologgingComponentGatewayLogsApiUrl = (): string => {
  const base = window.API_CONFIG.systemApisBaseUrl ?? '';
  return `${base}/systemapis/choreologgingapi/0.2.0/logs/component/gateway?live=true`;
};

export const copilotApiUrl = (externalVhost: string): string => {
  const { sysApiPrefix, aiCopilotUrlSuffix } = window.API_CONFIG;
  return `https://${sysApiPrefix}.${externalVhost}${aiCopilotUrlSuffix}`;
};

// Derive Developer Portal base URL from the choreoOrgApiUrl config.
export const getDevPortalBaseUrl = (): string | null => {
  try {
    const url = new URL(window.API_CONFIG?.choreoOrgApiUrl ?? '');
    const labels = url.hostname.split('.');
    labels[0] = 'devportal';
    return `${url.protocol}//${labels.join('.')}`;
  } catch {
    return null;
  }
};

// Path template for an API's page on the (third-party) Developer Portal.
const DEV_PORTAL_API_VIEW_PATH = 'views/default/api';

/**
 * Full Developer Portal URL for a published API. The Dev Portal is a separate
 * (third-party) portal, so its URL shape lives here, not inlined in components.
 * Returns null when the base can't be derived.
 */
export const getDevPortalApiUrl = (orgHandler: string, apiName: string, apiVersion: string): string | null => {
  const base = getDevPortalBaseUrl();
  if (!base) return null;
  return `${base}/${orgHandler}/${DEV_PORTAL_API_VIEW_PATH}/${encodeURIComponent(apiName)}-${encodeURIComponent(apiVersion)}`;
};
