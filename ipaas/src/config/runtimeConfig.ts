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

import { withBase } from '../utils/basePath';

interface RuntimeConfig {
  VITE_AUTH_BASE_URL?: string;
  VITE_OBSERVABILITY_URL?: string;
  SYSTEM_APIS_BASE_URL?: string;
  BILLING_API_BASE_URL?: string;
  BILLING_CONSOLE_URL?: string;
  CHOREO_SAAS_OFFER_URL?: string;
  ENABLE_BILLING_FEATURE?: string | boolean;
  ASGARDEO_CLIENT_ID?: string;
  ASGARDEO_SIGN_IN_REDIRECT_URL?: string;
  ASGARDEO_SCOPE?: string;
  ASGARDEO_RESOURCE?: string;
  CHOREO_BASE_API_URL?: string;
  SYS_API_PREFIX?: string;
  GITHUB_APP_CLIENT_ID?: string;
  GITHUB_APP_AUTH_REDIRECTION_URL?: string;
  GITHUB_APP_SLUG?: string;
  SAMPLES_URL?: string;
  PREBUILT_INTEGRATIONS_URL?: string;
  AI_COPILOT_URL_SUFFIX?: string;
  /** Comma-separated exact origins an editor's https callback may use, e.g. "https://a.example.dev,https://b.example.dev". Empty allows none. */
  EDITOR_CALLBACK_ORIGINS?: string;
  /** Comma-separated parent domains whose https subdomains may be editor callbacks, e.g. "cloud.wso2.com". Editors get a subdomain each, so they cannot be listed individually. */
  EDITOR_CALLBACK_DOMAINS?: string;
  CHOREO_URL_MANAGER_URL?: string;
  ENABLE_CUSTOM_URL_MAPPINGS_FEATURE?: string | boolean;
  RAG_INGESTION_IMAGE?: string;
  INTEGRATION_BUILDER_COPILOT_BASE_URL?: string;
  INTEGRATION_BUILDER_LLM_MODEL?: string;
  INTEGRATION_BUILDER_MAX_TOKENS?: string;
  INTEGRATION_BUILDER_CENTRAL_GRAPHQL_URL?: string;
  MOESIF_APP_URL?: string;
  /** Which tracking codes (GTM container, CookiePro domain script) to load: 'dev' | 'stage' | 'prod', or 'off' for none. Unset or unrecognized defaults to 'dev'. */
  TRACKING_ENV?: string;
  MOESIF_APP_API_KEY?: string;
}

export interface ApiConfig {
  authBaseUrl: string;
  observabilityUrl: string;
  asgardeoClientId: string;
  asgardeoSignInRedirectUrl: string;
  asgardeoScope: string;
  asgardeoResource?: string;
  choreoBaseApiUrl: string;
  choreoOrgApiUrl: string;
  systemApisBaseUrl?: string;
  sysApiPrefix: string;
  githubAppClientId?: string;
  githubAppAuthRedirectUrl?: string;
  /** GitHub App slug — powers https://github.com/apps/{slug}/installations/new when the App is authorized but not yet installed on any account. */
  githubAppSlug?: string;
  billingApiBaseUrl: string;
  /** External billing console base — the Upgrade button links to `${billingConsoleUrl}/cloud/devant/upgrade`. */
  billingConsoleUrl?: string;
  /** Azure marketplace SaaS offer — shows the "Upgrade via Azure marketplace" split-button option when set. */
  choreoSaasOfferUrl?: string;
  /** Gates the free-tier Upgrade button (mirrors Devant's ENABLE_BILLING_FEATURE). */
  enableBillingFeature?: boolean;
  samplesUrl?: string;
  prebuiltIntegrationsUrl?: string;
  aiCopilotUrlSuffix: string;
  /**
   * Exact origins an editor may have its GitHub OAuth result forwarded to over
   * https. Browser-based editors cannot use a custom URI scheme, so they need
   * one — but the callback arrives inside an OAuth `state` that reached us by
   * way of GitHub, so it is named here rather than trusted. Empty allows no
   * https callback at all, which is the safe default.
   *
   * A loopback origin (`http://localhost:5173`) belongs here too, and is the
   * only place plaintext http is accepted: it resolves to the machine the
   * browser is already running on, so the code reaches nothing beyond it. Leave
   * it out of any deployment reachable by someone other than its developer.
   */
  editorCallbackOrigins: string[];
  /**
   * Parent domains whose https subdomains may receive an editor's OAuth result.
   * Editors are provisioned one subdomain each, so they cannot be named
   * individually — the domain they live under is named instead. Empty allows
   * none.
   */
  editorCallbackDomains: string[];
  /** Choreo URL-manager service base (custom domains + URL mappings). Optional — when unset, the URL Settings section stays hidden. */
  urlManagerUrl?: string;
  /** Feature flag mirroring Devant's ENABLE_CUSTOM_URL_MAPPINGS_FEATURE. */
  enableCustomUrlMappings?: boolean;
  /** Container image deployed by the RAG Ingestion wizard. Falls back to {@link RAG_INGESTION_DEFAULT_IMAGE} when unset. */
  ragIngestionImage?: string;
  /** AI Integration Builder copilot base URL. */
  integrationBuilderCopilotBaseUrl: string;
  /** AI Integration Builder LLM model name. */
  integrationBuilderLlmModel: string;
  /** AI Integration Builder max tokens for LLM. */
  integrationBuilderMaxTokens: number;
  /** AI Integration Builder central GraphQL URL for connectors. */
  integrationBuilderCentralGraphqlUrl: string;
  /** Trusted Moesif embed origin; empty disables API Insights. */
  moesifAppUrl?: string;
  /** Which tracking codes (GTM container, CookiePro domain script) to load; 'off' loads none. */
  trackingEnv: 'dev' | 'stage' | 'prod' | 'off';
  /** Moesif app key for product-usage analytics. Separate from the API Insights embed above. Unset disables Moesif tracking. */
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

// Accepts only the recognized tracking-env values; anything else (including unset) falls back to 'dev'.
// A set but unrecognized value is warned about, since a typo would otherwise load dev codes silently.
function parseTrackingEnv(value: unknown): ApiConfig['trackingEnv'] {
  if (value === 'stage' || value === 'prod' || value === 'off') return value;
  if (typeof value === 'string' && value.trim() !== '' && value !== 'dev') console.warn(`Unrecognized TRACKING_ENV "${value}"; using 'dev'.`);
  return 'dev';
}

// Default configuration (used as fallback if config.json fails to load)
const DEFAULT_CONFIG: ApiConfig = {
  authBaseUrl: 'https://localhost:9445/auth',
  observabilityUrl: 'https://localhost:9448/icp/observability',
  asgardeoClientId: '',
  asgardeoSignInRedirectUrl: `${window.location.origin}${withBase('/signin')}`,
  asgardeoScope: 'openid profile email groups',
  choreoBaseApiUrl: 'https://apis.preview-dv.choreo.dev',
  choreoOrgApiUrl: 'https://apis.preview-dv.choreo.dev/orgs/1.0.0',
  systemApisBaseUrl: '',
  sysApiPrefix: '783c6c4d-8b9b-4190-b70a-e717ab1ee739-systemapis',
  githubAppClientId: '',
  githubAppAuthRedirectUrl: `${window.location.origin}${withBase('/ghapp')}`,
  githubAppSlug: '',
  billingApiBaseUrl: '',
  aiCopilotUrlSuffix: '',
  editorCallbackOrigins: [],
  editorCallbackDomains: [],
  integrationBuilderCopilotBaseUrl: 'https://apis.preview-dv.devant.dev/copilot',
  integrationBuilderLlmModel: 'claude-sonnet-4-6',
  integrationBuilderMaxTokens: 1024,
  integrationBuilderCentralGraphqlUrl: 'https://api.dev-central.ballerina.io/2.0/graphql',
  trackingEnv: 'dev',
};

/**
 * Load configuration from /config.json.
 * This allows modifying URLs after build without rebuilding the app.
 */
export async function loadConfig(): Promise<void> {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}config.json`);
    if (!response.ok) {
      throw new Error(`Failed to load config.json: ${response.status}`);
    }

    const config: RuntimeConfig = await response.json();
    const trim = (url: string): string => url.replace(/\/$/, '');
    const choreoBase = trim(config.CHOREO_BASE_API_URL || DEFAULT_CONFIG.choreoBaseApiUrl);
    const systemApisBase = trim(config.SYSTEM_APIS_BASE_URL || DEFAULT_CONFIG.systemApisBaseUrl || '');

    window.API_CONFIG = {
      authBaseUrl: trim(config.VITE_AUTH_BASE_URL || DEFAULT_CONFIG.authBaseUrl),
      observabilityUrl: trim(config.VITE_OBSERVABILITY_URL || DEFAULT_CONFIG.observabilityUrl),
      asgardeoClientId: config.ASGARDEO_CLIENT_ID || DEFAULT_CONFIG.asgardeoClientId,
      asgardeoSignInRedirectUrl: config.ASGARDEO_SIGN_IN_REDIRECT_URL || DEFAULT_CONFIG.asgardeoSignInRedirectUrl,
      asgardeoScope: config.ASGARDEO_SCOPE || DEFAULT_CONFIG.asgardeoScope,
      asgardeoResource: config.ASGARDEO_RESOURCE?.trim() || undefined,
      choreoBaseApiUrl: choreoBase,
      choreoOrgApiUrl: `${choreoBase}/orgs/1.0.0`,
      systemApisBaseUrl: systemApisBase || DEFAULT_CONFIG.systemApisBaseUrl,
      sysApiPrefix: config.SYS_API_PREFIX || DEFAULT_CONFIG.sysApiPrefix,
      githubAppClientId: config.GITHUB_APP_CLIENT_ID || DEFAULT_CONFIG.githubAppClientId,
      githubAppAuthRedirectUrl: config.GITHUB_APP_AUTH_REDIRECTION_URL || DEFAULT_CONFIG.githubAppAuthRedirectUrl,
      githubAppSlug: config.GITHUB_APP_SLUG || DEFAULT_CONFIG.githubAppSlug,
      billingApiBaseUrl: trim(config.BILLING_API_BASE_URL || DEFAULT_CONFIG.billingApiBaseUrl),
      samplesUrl: config.SAMPLES_URL || undefined,
      prebuiltIntegrationsUrl: config.PREBUILT_INTEGRATIONS_URL || undefined,
      aiCopilotUrlSuffix: config.AI_COPILOT_URL_SUFFIX || DEFAULT_CONFIG.aiCopilotUrlSuffix,
      urlManagerUrl: config.CHOREO_URL_MANAGER_URL ? trim(config.CHOREO_URL_MANAGER_URL) : undefined,
      enableCustomUrlMappings: config.ENABLE_CUSTOM_URL_MAPPINGS_FEATURE === 'true' || config.ENABLE_CUSTOM_URL_MAPPINGS_FEATURE === true,
      billingConsoleUrl: config.BILLING_CONSOLE_URL ? trim(config.BILLING_CONSOLE_URL) : undefined,
      choreoSaasOfferUrl: config.CHOREO_SAAS_OFFER_URL || undefined,
      enableBillingFeature: config.ENABLE_BILLING_FEATURE === 'true' || config.ENABLE_BILLING_FEATURE === true,
      editorCallbackOrigins: (config.EDITOR_CALLBACK_ORIGINS || '')
        .split(',')
        .map((origin) => origin.trim().toLowerCase())
        .filter(Boolean),
      editorCallbackDomains: (config.EDITOR_CALLBACK_DOMAINS || '')
        .split(',')
        .map((domain) => domain.trim().toLowerCase())
        .filter(Boolean),
      ragIngestionImage: config.RAG_INGESTION_IMAGE ? trim(config.RAG_INGESTION_IMAGE) : undefined,
      integrationBuilderCopilotBaseUrl: config.INTEGRATION_BUILDER_COPILOT_BASE_URL ? trim(config.INTEGRATION_BUILDER_COPILOT_BASE_URL) : 'https://apis.preview-dv.devant.dev/copilot',
      integrationBuilderLlmModel: config.INTEGRATION_BUILDER_LLM_MODEL || 'claude-sonnet-4-6',
      integrationBuilderMaxTokens: parsePositiveInt(config.INTEGRATION_BUILDER_MAX_TOKENS, DEFAULT_CONFIG.integrationBuilderMaxTokens),
      integrationBuilderCentralGraphqlUrl: config.INTEGRATION_BUILDER_CENTRAL_GRAPHQL_URL || 'https://api.dev-central.ballerina.io/2.0/graphql',
      moesifAppUrl: config.MOESIF_APP_URL?.trim() || undefined,
      trackingEnv: parseTrackingEnv(config.TRACKING_ENV),
      // config.json is untyped: a non-string value must not throw here and reset the whole config.
      moesifAppApiKey: typeof config.MOESIF_APP_API_KEY === 'string' ? config.MOESIF_APP_API_KEY.trim() || undefined : undefined,
    };

    console.info('✓ Runtime configuration loaded from config.json');
  } catch (error) {
    console.warn('Failed to load runtime config, using defaults:', error);
    window.API_CONFIG = DEFAULT_CONFIG;
  }
}

// URL helpers — only for values that require computation (path concatenation or runtime parameters).
// Simple field reads (e.g. window.API_CONFIG.choreoBaseApiUrl) are done directly at call sites.

// Insights (Usage Insights / APIM traffic) query endpoint — served by the per-org
// systemapis gateway, like logging (`<sysApiPrefix>.<gatewayHost>/systemapis/analyticsqueryapi/0.1.0/query`).
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
