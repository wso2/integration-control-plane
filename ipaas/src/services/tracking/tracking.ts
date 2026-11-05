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
import { getSession } from '../../auth';
import { hasRecordedConsentChoice, isAnalyticsCookiesAllowed, onConsentChange } from './oneTrustCookiePro';

declare global {
  interface Window {
    dataLayer?: unknown[];
    OptanonWrapper?: () => void;
  }
}

// One GTM container and CookiePro domain script per deployment tier, chosen by the TRACKING_ENV
// runtime key. Dev and stage share the staging codes; prod has its own. Microsoft Clarity is not a
// separate snippet: it is a tag inside the GTM container, so loading GTM brings it along.
type TrackingEnv = 'dev' | 'stage' | 'prod';

const GTM_CONTAINER_ID: Record<TrackingEnv, string> = {
  dev: 'GTM-58K3W2QB',
  stage: 'GTM-58K3W2QB',
  prod: 'GTM-5VPGH8GR',
};

const COOKIEPRO_DOMAIN_SCRIPT_ID: Record<TrackingEnv, string> = {
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

// Bootstraps the Moesif SDK, which auto-instruments fetch/XHR to capture API traffic, mirroring
// choreo-console's getMoesifClient().
//
// moesif.init() can create cookies/localStorage immediately regardless of consent status (per the
// SDK's own docs), so init() itself is deferred until consent is actually granted rather than
// gated after the fact — and start()/stop() track consent being granted/withdrawn thereafter,
// since onConsentChange re-runs this on every later preference-center change too.
let moesifClient: ReturnType<typeof moesif.init> | null = null;

// Events fired before CookiePro reports consent (it loads over the network after the first render)
// wait here, then are sent or discarded once consent resolves. Capped so a blocked CookiePro
// script can't grow it without bound.
interface PendingEvent {
  name: string;
  properties?: Record<string, unknown>;
  identify?: boolean;
}
const MAX_PENDING_EVENTS = 50;
let consentResolved = false;
let pendingEvents: PendingEvent[] = [];
// The user Moesif last identified, so trackEvent can identify a session restored without a sign-in.
let identifiedUserId: string | null = null;
// Set while the SDK's batchers are halted by a consent withdrawal, so a re-grant restarts them.
let batchingPaused = false;

function syncMoesifConsent(applicationId: string | undefined): void {
  const allowed = isAnalyticsCookiesAllowed();

  if (!applicationId || !allowed) {
    // An unanswered banner reads as "not allowed" too; keep the queue until the user decides.
    if (!applicationId || hasRecordedConsentChoice()) {
      consentResolved = true;
      pendingEvents = [];
    }
    if (moesifClient) {
      // stop() only unpatches fetch/XHR; clear the ids and session init() persisted too.
      moesifClient.stop();
      moesifClient.clearCookies();
      moesifClient.clearStorage();
      // stop() leaves the batch queue flushing on its timer. Halt each batcher and empty its queue
      // (memory and localStorage) so nothing recorded before the withdrawal is sent. Not
      // stopAllBatching(), which also turns batching off for good.
      Object.values<{ stop: () => void; clear: () => void }>(moesifClient.requestBatchers ?? {}).forEach((batcher) => {
        batcher.stop();
        batcher.clear();
      });
      batchingPaused = true;
      identifiedUserId = null;
    }
    return;
  }

  consentResolved = true;
  moesifClient ??= moesif.init({ applicationId, batchEnabled: true, batchSize: 20, batchMaxTime: 5000 });
  moesifClient.start();
  if (batchingPaused) {
    // init() starts the batchers only once; restart the ones the withdrawal halted.
    moesifClient.initBatching();
    batchingPaused = false;
  }
  // Consent often lands after sign-in, when the post-sign-in identify found no client yet.
  identifyMoesifSession();

  const queued = pendingEvents;
  pendingEvents = [];
  queued.forEach((event) => trackEvent(event.name, event.properties, event.identify));
}

// Ported from choreo-console's MOESIF_EVENT_MAP: maps this console's event keys to the Moesif event
// names the existing Moesif dashboards already use. The hybrid-gateway-* entries are dropped (no
// such feature here). Names are kept verbatim, "Component-*" included, for continuity with the
// existing Moesif taxonomy. Some keys have no call site yet because their screen is unported or
// gone (develop page, lifecycle and Devportal, GitLab/Bitbucket/Azure import); they stay mapped so
// the taxonomy is complete when those screens come back.
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

  // Integration-creation flow (CreateIntegrationPanels, ImportIntegration, BrowseSamples). One event
  // per git provider rather than a shared one, so each import shortcut is its own series.
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
  // TODO(component-create-multiple-start / Component-CreateMultiple-Start): add once a
  // "Create Multiple" flow exists.
  'components-new-browse-more-samples': { name: 'Sample-Explored' },
  'components-new-get-started-tab': { name: 'GetStartedQuickly-TabClicked' },

  'open-cloud-editor-click': { name: 'CloudEditor-Opened' },
  'quick-deploy-click': { name: 'Sample-Deployed' },
  'featured-prebuilt-integration-click': { name: 'PrebuiltIntegration-Clicked' },
  'prebuilt-integration-explore-click': { name: 'PrebuiltIntegration-Explored' },
};

// trackEvent/identify run from event handlers and mutation callbacks, not from render, so they read
// the signed-in user from the auth session rather than through useAuth().
const isWso2User = (username: string | undefined): boolean => username?.endsWith('@wso2.com') ?? false;

function convertKeysToSnakeCase(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).map(([key, value]) => [key.replace(/([A-Z])/g, '_$1').toLowerCase(), value]));
}

function identifyMoesifSession(): void {
  const session = getSession();
  if (!moesifClient || !session) return;
  const { user, orgUuid, orgHandle } = session;
  identifiedUserId = user.userId;
  moesifClient.identifyUser(user.userId, { email: user.username, name: user.displayName, isWSO2User: isWso2User(user.username) });
  if (orgUuid) moesifClient.identifyCompany(orgUuid, { name: orgHandle });
}

/**
 * Records a product-usage event in Moesif, matching choreo-console's `trackEvent()`. `name` is
 * looked up in MOESIF_EVENT_MAP; an unmapped name is a no-op. Pass `identify: true` after sign-in
 * to also (re-)identify the current user and organization in Moesif.
 */
export function trackEvent(name: string, properties?: Record<string, unknown>, identify?: boolean): void {
  const mapped = MOESIF_EVENT_MAP[name];
  if (!mapped) return;

  if (!consentResolved) {
    if (pendingEvents.length < MAX_PENDING_EVENTS) pendingEvents.push({ name, properties, identify });
    return;
  }

  // The client outlives a consent withdrawal (stop() only halts API capture), so check consent too.
  if (!moesifClient || !isAnalyticsCookiesAllowed()) return;

  // A session restored by silent sign-in never passes the sign-in identify, so identify lazily.
  const user = getSession()?.user;
  if (identify || (user && user.userId !== identifiedUserId)) identifyMoesifSession();

  moesifClient.track(mapped.name, {
    product: 'integration',
    asset_type: 'console',
    domain: window.location.hostname,
    deployment_model: 'saas',
    idp_id: user?.userId,
    is_wso2_user: isWso2User(user?.username),
    ...convertKeysToSnakeCase(properties ?? {}),
    ...mapped.properties,
  });
}

// GTM carries Clarity and must be gated on analytics consent the same way syncMoesifConsent gates
// Moesif, otherwise Clarity starts recording before the user has consented. Injects at most once:
// onConsentChange's callback re-runs on every later preference-center change too, and GTM has no
// equivalent of Moesif's stop() to undo an injection.
function injectGtmOnceConsented(containerId: string): () => void {
  let injected = false;
  return () => {
    if (injected || !isAnalyticsCookiesAllowed()) return;
    injected = true;
    injectGtm(containerId);
  };
}

/**
 * Loads CookiePro, then GTM (which carries Clarity) and Moesif once analytics consent is granted.
 * The tier comes from the TRACKING_ENV runtime key ('off' loads nothing) and the Moesif app key
 * from MOESIF_APP_API_KEY.
 */
export function initTracking(): void {
  const env = window.API_CONFIG?.trackingEnv ?? 'dev';
  if (env === 'off') {
    // Nothing loads, so nothing will ever resolve consent; stop events from queueing.
    consentResolved = true;
    return;
  }

  const injectGtmIfConsented = injectGtmOnceConsented(GTM_CONTAINER_ID[env]);
  const sync = (): void => {
    syncMoesifConsent(window.API_CONFIG?.moesifAppApiKey);
    injectGtmIfConsented();
  };
  // Some OneTrust versions call OptanonWrapper again after a preference change. Register the
  // consent listener only on the first call, so listeners don't stack; later calls just re-sync.
  let listening = false;
  injectCookiePro(COOKIEPRO_DOMAIN_SCRIPT_ID[env], () => {
    if (listening) return sync();
    listening = true;
    onConsentChange(sync);
  });
}
