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

// @ts-expect-error: moesif-browser-js does not ship types
import moesif from 'moesif-browser-js';
import { getOrgHandle, getOrgUuidFromToken } from '../auth/tokenManager';
import { IS_CLOUD, IS_WIP } from '../features';
import { isAnalyticsCookiesAllowed, onConsentChange } from './oneTrustCookiePro';

declare global {
  interface Window {
    dataLayer?: unknown[];
    OptanonWrapper?: () => void;
  }
}

// Ported from choreo-console's index.html + public/js/cookieProInject.<date>.js, which hardcode
// these same two IDs per deployment tier. Microsoft Clarity is not a separate snippet — it's wired
// in as a tag inside the GTM container itself (configured in GTM's own console), so loading GTM is
// sufficient to bring Clarity along; there is nothing else to add for it here.
const WIP_GTM_CONTAINER_ID: Record<'dev' | 'stage' | 'prod', string> = {
  dev: 'GTM-MW3T7S9W',
  stage: 'GTM-MW3T7S9W',
  prod: 'GTM-58TBJFHN',
};

const WIP_COOKIEPRO_DOMAIN_SCRIPT_ID: Record<'dev' | 'stage' | 'prod', string> = {
  dev: '01956090-3b3e-72fc-8434-dd70c76c43d2-test',
  stage: '01956090-3b3e-72fc-8434-dd70c76c43d2-test',
  prod: '01956090-3b3e-72fc-8434-dd70c76c43d2',
};

// Cloud has no GTM/CookiePro codes of its own yet — replace these per tier before Cloud ships with
// tracking enabled. Tiered the same way as WIP's, matching choreo-console's own pattern of a
// distinct GTM container + CookiePro domain script per deployment tier (not one shared value
// across dev/stage/prod). initTracking() compares against the placeholders below and no-ops until
// both are replaced for the active tier, so an unconfigured environment never fires real
// GTM/CookiePro requests with bogus IDs (which could otherwise render a broken consent banner or
// hit third-party CDNs pointlessly).
const CLOUD_GTM_PLACEHOLDER = 'GTM-XXXXXXX';
const CLOUD_COOKIEPRO_PLACEHOLDER = 'REPLACE_WITH_CLOUD_COOKIEPRO_DOMAIN_SCRIPT_ID';
const CLOUD_GTM_CONTAINER_ID: Record<'dev' | 'stage' | 'prod', string> = {
  // Dev shares stage's container ID (integration-console-staging.txt) — no separate dev code was
  // provided. Real prod container ID is distinct (integration-platform-prod.txt).
  dev: 'GTM-58K3W2QB',
  stage: 'GTM-58K3W2QB',
  prod: 'GTM-5VPGH8GR',
};
const CLOUD_COOKIEPRO_DOMAIN_SCRIPT_ID: Record<'dev' | 'stage' | 'prod', string> = {
  // Real domain-script IDs from Thimuth: dev/stage share the "-test" variant
  // (CookiePro-Staging.txt), prod uses the same underlying script without the "-test" suffix
  // (CookiePro-wso2com-Prod.txt) — same pairing pattern as the WIP build's own codes.
  dev: '486163bc-a8c5-40d8-b185-c707cc718a23-test',
  stage: '486163bc-a8c5-40d8-b185-c707cc718a23-test',
  prod: '486163bc-a8c5-40d8-b185-c707cc718a23',
};

function injectGtm(containerId: string): void {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtm.js?id=${containerId}`;
  // Exempts this tag from OneTrust's script-blocking scanner, matching choreo-console's setup.
  script.setAttribute('data-ot-ignore', '');
  document.head.appendChild(script);

  const noscript = document.createElement('noscript');
  const iframe = document.createElement('iframe');
  iframe.src = `https://www.googletagmanager.com/ns.html?id=${containerId}`;
  iframe.height = '0';
  iframe.width = '0';
  iframe.style.display = 'none';
  iframe.style.visibility = 'hidden';
  noscript.appendChild(iframe);
  document.body.prepend(noscript);
}

// `onReady` runs once OneTrust's own script finishes initializing consent categories — that's
// when it calls window.OptanonWrapper. Checking consent any earlier would see
// `OnetrustActiveGroups` as still undefined, since OneTrust hasn't populated it yet.
function injectCookiePro(domainScriptId: string, onReady: () => void): void {
  window.OptanonWrapper = onReady;

  const script = document.createElement('script');
  script.src = 'https://cookie-cdn.cookiepro.com/scripttemplates/otSDKStub.js';
  script.type = 'text/javascript';
  script.charset = 'UTF-8';
  script.setAttribute('data-domain-script', domainScriptId);
  document.head.appendChild(script);
}

// Bootstraps the Moesif SDK, which auto-instruments fetch/XHR to capture API traffic — mirrors
// choreo-console's getMoesifClient(), minus the org-registration/identify calls that depend on
// this app's auth context (out of scope for just wiring up the tracking codes themselves).
//
// moesif.init() can create cookies/localStorage immediately regardless of consent status (per the
// SDK's own docs), so init() itself is deferred until consent is actually granted rather than
// gated after the fact — and start()/stop() track consent being granted/withdrawn thereafter,
// since onConsentChange re-runs this on every later preference-center change too.
let moesifClient: ReturnType<typeof moesif.init> | null = null;

function syncMoesifConsent(applicationId: string | undefined): void {
  if (!applicationId) return;

  if (!isAnalyticsCookiesAllowed()) {
    moesifClient?.stop();
    return;
  }

  moesifClient ??= moesif.init({ applicationId, batchEnabled: true, batchSize: 20, batchMaxTime: 5000 });
  moesifClient.start();
}

// Ported from choreo-console's MOESIF_EVENT_MAP (src/utils/tracking.ts) — maps this app's internal
// event keys to the Moesif event names already established in existing Moesif dashboards. The
// 7 hybrid-gateway-* entries from the original map are dropped: this app has no hybrid gateway
// feature to fire them from. Event names are kept verbatim (including "Component-*", even though
// this app calls the concept "integration") for continuity with the existing Moesif taxonomy.
interface MoesifEventEntry {
  name: string;
  properties?: Record<string, unknown>;
}

const MOESIF_EVENT_MAP: Record<string, MoesifEventEntry> = {
  'visit-login-page': { name: 'Landing-SignIn-Viewed' },
  'signup-success': { name: 'Landing-SignUp-Succeeded' },
  'invitation-signup-success': { name: 'Landing-SignUp-Succeeded', properties: { referral: 'invitation' } },
  'login-clickbutton-success': { name: 'Landing-SignIn-Succeeded' },
  'login-clickbutton-error': { name: 'Landing-SignIn-Failed' },
  'visit-home': { name: 'Portal-Viewed-Home' },
  'navbar-home': { name: 'Navbar-Clicked-Home' },
  'navbar-documentation': { name: 'Navbar-Clicked-Documentation' },
  'navbar-user-billing': { name: 'Navbar-Clicked-Billing' },
  'navbar-user-logout': { name: 'Navbar-Clicked-Logout' },
  'navbar-dev-portal': { name: 'Navbar-Clicked-DevPortal' },
  'navbar-project-dropdown-existing': { name: 'Project-Clicked' },
  'project-create-start': { name: 'Project-Created-Start' },
  'project-create-end': { name: 'Project-Created-End' },
  'component-create-start': { name: 'Component-Created-Start' },
  'component-create-end': { name: 'Component-Created-End' },
  'component-delete': { name: 'Component-Deleted' },
  'component-overview': { name: 'Component-Viewed-Page', properties: { page: 'overview' } },
  'component-develop': { name: 'Component-Viewed-Page', properties: { page: 'develop' } },
  'component-test': { name: 'Component-Viewed-Page', properties: { page: 'test' } },
  'component-build': { name: 'Component-Built' },
  'component-deploy': { name: 'Component-Deployed' },
  'component-promote': { name: 'Component-Promoted' },
  'component-test-execute': { name: 'Component-Tested' },
  'component-test-openapi-get-test-key': { name: 'Component-Generated-Key', properties: { keyType: 'test' } },
  'component-manage-lifecycle-state-change-to-publish': { name: 'Component-Published' },
  'component-manage-lifecycle-state-change-to-demote-to-created': { name: 'Component-Unpublished' },
  'component-manage-dev-portal': { name: 'DevPortal-Visited' },
  'visit-moesif-dashboard': { name: 'Moesif-Viewed-Dashboard' },

  // Integration-creation flow (src/components/CreateIntegrationPanels.tsx,
  // src/pages/ImportIntegration.tsx, src/pages/BrowseSamples.tsx). One event per git provider
  // rather than a single shared event, so each import shortcut is its own series.
  'component-create-import-public-url': { name: 'Component-Import-PublicURL' },
  'component-create-import-github': { name: 'Component-Import-GitHub' },
  'component-create-import-gitlab': { name: 'Component-Import-GitLab' },
  'component-create-import-bitbucket': { name: 'Component-Import-Bitbucket' },
  'component-create-import-azure-devops': { name: 'Component-Import-AzureDevOps' },

  // One event per integration-type card; anything not in this list (a type added later, before
  // this map is updated for it) falls through to the generic 'component-create-select-type' at
  // the call site instead of vanishing silently.
  'component-create-select-type-automation': { name: 'Component-SelectedType-Automation' },
  'component-create-select-type-ai-agent': { name: 'Component-SelectedType-AIAgent' },
  'component-create-select-type-integration-as-api': { name: 'Component-SelectedType-IntegrationAsAPI' },
  'component-create-select-type-mcp-server': { name: 'Component-SelectedType-MCPServer' },
  'component-create-select-type-event-integration': { name: 'Component-SelectedType-EventIntegration' },
  'component-create-select-type-file-integration': { name: 'Component-SelectedType-FileIntegration' },
  'component-create-select-type-webhook': { name: 'Component-SelectedType-Webhook' },
  'component-create-select-type': { name: 'Component-SelectedType' },

  // Fires on click, before the create API call — 'component-create-end' (above) only fires on
  // success, so the gap between the two is the real submit-to-success drop-off.
  'component-create-submit': { name: 'Component-Created-Submit' },
  // TODO(component-create-multiple-start / Component-CreateMultiple-Start): no "Create Multiple"
  // UI exists anywhere in this app yet (see ImportIntegration.tsx / CreateIntegrationPanels.tsx —
  // there is only a single Create flow). Add this once that flow exists.
  'components-new-browse-more-samples': { name: 'Sample-Explored' },
  'components-new-get-started-tab': { name: 'GetStartedQuickly-TabClicked' },

  // These didn't have any call site at all before this batch (not just an unmapped one) — added
  // alongside their call sites, not backfilled onto existing ones.
  'open-cloud-editor-click': { name: 'CloudEditor-Opened' },
  'quick-deploy-click': { name: 'Sample-Deployed' },
  'featured-prebuilt-integration-click': { name: 'PrebuiltIntegration-Clicked' },
  'prebuilt-integration-explore-click': { name: 'PrebuiltIntegration-Explored' },
};

// trackEvent/identify are called imperatively from event handlers (button clicks, mutation
// onSuccess callbacks), not from React render, so they read auth state directly out of
// localStorage/the access token rather than via the useAuth()/useOrgUuid() hooks.
interface StoredUserInfo {
  userId?: string;
  username?: string;
  displayName?: string;
}

function getStoredUserInfo(): StoredUserInfo | null {
  try {
    const raw = localStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function convertKeysToSnakeCase(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).map(([key, value]) => [key.replace(/([A-Z])/g, '_$1').toLowerCase(), value]));
}

export function identifyMoesifUser(): void {
  if (!moesifClient) return;
  const user = getStoredUserInfo();
  if (!user?.userId) return;
  moesifClient.identifyUser(user.userId, {
    email: user.username,
    name: user.displayName,
    isWSO2User: user.username?.endsWith('@wso2.com') ?? false,
  });
}

export function identifyMoesifCompany(orgUuid: string, orgHandle?: string | null): void {
  if (!moesifClient || !orgUuid) return;
  moesifClient.identifyCompany(orgUuid, orgHandle ? { name: orgHandle } : undefined);
}

/**
 * Records a product-usage event in Moesif, matching choreo-console's `trackEvent()`. `name` is
 * looked up in MOESIF_EVENT_MAP — an unmapped name is a no-op (Azure App Insights, the old code's
 * fallback destination for unmapped events, is not used by this app). Pass `identify: true` at
 * the same call sites the old code did (post-login/signup) to also (re-)identify the current
 * user/company in Moesif.
 */
export function trackEvent(name: string, properties?: Record<string, unknown>, identify?: boolean): void {
  if (!moesifClient) return;
  const mapped = MOESIF_EVENT_MAP[name];
  if (!mapped) return;

  if (identify) {
    identifyMoesifUser();
    const orgUuid = getOrgUuidFromToken();
    if (orgUuid) identifyMoesifCompany(orgUuid, getOrgHandle());
  }

  const user = getStoredUserInfo();
  moesifClient.track(mapped.name, {
    product: 'integration',
    asset_type: 'console',
    domain: window.location.hostname,
    deployment_model: 'saas',
    idp_id: user?.userId,
    is_wso2_user: user?.username?.endsWith('@wso2.com') ?? false,
    ...convertKeysToSnakeCase(properties ?? {}),
    ...mapped.properties,
  });
}

/**
 * Loads the product's tracking scripts: GTM (which also carries Clarity as a GTM tag), CookiePro,
 * and Moesif. WIP uses choreo-console's real per-tier codes; Cloud uses per-tier placeholders for
 * GTM/CookiePro until it has its own (Moesif already comes from runtime config either way, so no
 * placeholder is needed for it). ICP loads nothing.
 */
// GTM carries Clarity (see initTracking's own doc comment) and must be gated on analytics consent
// the same way syncMoesifConsent gates Moesif — otherwise Clarity starts recording before the user
// has consented. Injects at most once: onConsentChange's callback re-runs on every later
// preference-center change too, and GTM has no equivalent of Moesif's stop() to undo an injection.
function injectGtmOnceConsented(containerId: string): () => void {
  let injected = false;
  return () => {
    if (injected || !isAnalyticsCookiesAllowed()) return;
    injected = true;
    injectGtm(containerId);
  };
}

export function initTracking(): void {
  if (IS_WIP) {
    const env = window.API_CONFIG?.trackingEnv ?? 'dev';
    const injectGtmIfConsented = injectGtmOnceConsented(WIP_GTM_CONTAINER_ID[env]);
    injectCookiePro(WIP_COOKIEPRO_DOMAIN_SCRIPT_ID[env], () =>
      onConsentChange(() => {
        syncMoesifConsent(window.API_CONFIG?.moesifAppApiKey);
        injectGtmIfConsented();
      }),
    );
    return;
  }

  if (IS_CLOUD) {
    const env = window.API_CONFIG?.trackingEnv ?? 'dev';
    const cloudConfigured = CLOUD_GTM_CONTAINER_ID[env] !== CLOUD_GTM_PLACEHOLDER && CLOUD_COOKIEPRO_DOMAIN_SCRIPT_ID[env] !== CLOUD_COOKIEPRO_PLACEHOLDER;
    if (!cloudConfigured) return;

    // Moesif's app key comes from window.API_CONFIG the same way WIP's does — it's runtime config
    // (Cloud's own deployed config.json per environment), not a value to hardcode in source here.
    const injectGtmIfConsented = injectGtmOnceConsented(CLOUD_GTM_CONTAINER_ID[env]);
    injectCookiePro(CLOUD_COOKIEPRO_DOMAIN_SCRIPT_ID[env], () =>
      onConsentChange(() => {
        syncMoesifConsent(window.API_CONFIG?.moesifAppApiKey);
        injectGtmIfConsented();
      }),
    );
  }

  // ICP: no tracking.
}
