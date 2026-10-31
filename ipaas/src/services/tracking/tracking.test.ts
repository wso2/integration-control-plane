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

import { beforeEach, describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({ current: null as unknown }));
vi.mock('../../auth', () => ({ getSession: () => session.current }));

const moesifClient = vi.hoisted(() => ({
  start: vi.fn(),
  stop: vi.fn(),
  track: vi.fn(),
  identifyUser: vi.fn(),
  identifyCompany: vi.fn(),
  clearCookies: vi.fn(),
  clearStorage: vi.fn(),
  initBatching: vi.fn(),
  requestBatchers: { events: { stop: vi.fn(), clear: vi.fn() } },
}));
const moesifInit = vi.hoisted(() => vi.fn(() => moesifClient));
vi.mock('moesif-browser-js', () => ({ default: { init: moesifInit } }));

import { initTracking, trackEvent } from './tracking';

function setActiveGroups(value: string | undefined): void {
  if (value === undefined) {
    delete (globalThis as Record<string, unknown>).OnetrustActiveGroups;
  } else {
    (globalThis as Record<string, unknown>).OnetrustActiveGroups = value;
  }
}

describe('initTracking', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    delete (window as unknown as Record<string, unknown>).dataLayer;
    delete (window as unknown as Record<string, unknown>).OptanonWrapper;
    delete (globalThis as Record<string, unknown>).OneTrust;
    delete (window as unknown as Record<string, unknown>).API_CONFIG;
    setActiveGroups(undefined);

    session.current = null;

    moesifInit.mockClear();
    moesifClient.start.mockClear();
    moesifClient.stop.mockClear();
    moesifClient.track.mockClear();
    moesifClient.identifyUser.mockClear();
    moesifClient.identifyCompany.mockClear();
    moesifClient.clearCookies.mockClear();
    moesifClient.clearStorage.mockClear();
    moesifClient.initBatching.mockClear();
    moesifClient.requestBatchers.events.stop.mockClear();
    moesifClient.requestBatchers.events.clear.mockClear();
  });

  it('does not load GTM before analytics consent is granted', () => {
    initTracking();
    setActiveGroups('C0001'); // strictly necessary only — no analytics consent
    window.OptanonWrapper?.();

    expect(document.head.querySelector('script[src*="googletagmanager.com/gtm.js"]')).toBeNull();
  });

  it('does not initialize Moesif before analytics consent is granted', () => {
    (window as unknown as { API_CONFIG: unknown }).API_CONFIG = { moesifAppApiKey: 'test-key' };

    initTracking();
    setActiveGroups('C0001'); // strictly necessary only — no analytics consent
    window.OptanonWrapper?.();

    expect(moesifInit).not.toHaveBeenCalled();
  });

  it('initializes and starts Moesif once analytics consent is granted', () => {
    (window as unknown as { API_CONFIG: unknown }).API_CONFIG = { moesifAppApiKey: 'test-key' };

    initTracking();
    setActiveGroups('C0001,C0002');
    window.OptanonWrapper?.();

    expect(moesifInit).toHaveBeenCalledWith(expect.objectContaining({ applicationId: 'test-key' }));
    expect(moesifClient.start).toHaveBeenCalledTimes(1);
  });

  it('identifies the signed-in user once consent initializes Moesif', () => {
    (window as unknown as { API_CONFIG: unknown }).API_CONFIG = { moesifAppApiKey: 'test-key' };
    session.current = { user: { userId: 'u-1', username: 'jane@wso2.com', displayName: 'Jane' }, orgHandle: 'acme', orgUuid: 'org-1' };

    initTracking();
    setActiveGroups('C0001,C0002');
    window.OptanonWrapper?.();

    expect(moesifClient.identifyUser).toHaveBeenCalledWith('u-1', { email: 'jane@wso2.com', name: 'Jane', isWSO2User: true });
    expect(moesifClient.identifyCompany).toHaveBeenCalledWith('org-1', { name: 'acme' });
  });

  it('stops Moesif when analytics consent is later withdrawn', () => {
    (window as unknown as { API_CONFIG: unknown }).API_CONFIG = { moesifAppApiKey: 'test-key' };
    let onConsentChanged: (() => void) | undefined;
    (globalThis as Record<string, unknown>).OneTrust = {
      OnConsentChanged: (callback: () => void) => {
        onConsentChanged = callback;
      },
    };

    initTracking();
    setActiveGroups('C0001,C0002');
    window.OptanonWrapper?.();
    expect(moesifClient.start).toHaveBeenCalledTimes(1);

    setActiveGroups('C0001');
    onConsentChanged?.();

    expect(moesifClient.stop).toHaveBeenCalledTimes(1);
    expect(moesifClient.clearCookies).toHaveBeenCalledTimes(1);
    expect(moesifClient.clearStorage).toHaveBeenCalledTimes(1);
    expect(moesifClient.requestBatchers.events.stop).toHaveBeenCalledTimes(1);
    expect(moesifClient.requestBatchers.events.clear).toHaveBeenCalledTimes(1);

    setActiveGroups('C0001,C0002');
    onConsentChanged?.();

    expect(moesifClient.initBatching).toHaveBeenCalledTimes(1);
  });

  it('registers the consent listener once when OptanonWrapper fires again', () => {
    const onConsentChanged = vi.fn();
    (globalThis as Record<string, unknown>).OneTrust = { OnConsentChanged: onConsentChanged };

    initTracking();
    setActiveGroups('C0001,C0002');
    window.OptanonWrapper?.();
    window.OptanonWrapper?.();

    expect(onConsentChanged).toHaveBeenCalledTimes(1);
  });

  it('loads the dev/stage GTM container and CookiePro test domain script by default', () => {
    initTracking();
    setActiveGroups('C0001,C0002');
    window.OptanonWrapper?.();

    const gtmScript = document.head.querySelector('script[src*="googletagmanager.com/gtm.js"]');
    expect(gtmScript?.getAttribute('src')).toContain('GTM-58K3W2QB');
    const cookieProScript = document.head.querySelector('script[src*="cookiepro"]');
    expect(cookieProScript?.getAttribute('data-domain-script')).toBe('486163bc-a8c5-40d8-b185-c707cc718a23-test');
  });

  it('loads the prod GTM container and CookiePro prod domain script when trackingEnv is prod', () => {
    (window as unknown as { API_CONFIG: unknown }).API_CONFIG = { trackingEnv: 'prod' };

    initTracking();
    setActiveGroups('C0001,C0002');
    window.OptanonWrapper?.();

    const gtmScript = document.head.querySelector('script[src*="googletagmanager.com/gtm.js"]');
    expect(gtmScript?.getAttribute('src')).toContain('GTM-5VPGH8GR');
    const cookieProScript = document.head.querySelector('script[src*="cookiepro"]');
    expect(cookieProScript?.getAttribute('data-domain-script')).toBe('486163bc-a8c5-40d8-b185-c707cc718a23');
  });

  it('injects GTM only once across repeated consent-change events', () => {
    let onConsentChanged: (() => void) | undefined;
    (globalThis as Record<string, unknown>).OneTrust = {
      OnConsentChanged: (callback: () => void) => {
        onConsentChanged = callback;
      },
    };

    initTracking();
    setActiveGroups('C0001,C0002');
    window.OptanonWrapper?.();
    onConsentChanged?.();
    onConsentChanged?.();

    expect(document.head.querySelectorAll('script[src*="googletagmanager.com/gtm.js"]')).toHaveLength(1);
  });
});

describe('trackEvent', () => {
  // The Moesif client is module state, created on first consent; one consented init serves the block.
  beforeEach(() => {
    (window as unknown as { API_CONFIG: unknown }).API_CONFIG = { moesifAppApiKey: 'test-key' };
    initTracking();
    setActiveGroups('C0001,C0002');
    window.OptanonWrapper?.();
    session.current = { user: { userId: 'u-1', username: 'jane@wso2.com', displayName: 'Jane' }, orgHandle: 'acme', orgUuid: 'org-1' };
    moesifClient.track.mockClear();
    moesifClient.identifyUser.mockClear();
    moesifClient.identifyCompany.mockClear();
  });

  it('sends a mapped event under its Moesif name with snake_cased properties', () => {
    trackEvent('component-create-submit', { integrationType: 'automation' });

    expect(moesifClient.track).toHaveBeenCalledWith('Component-Created-Submit', expect.objectContaining({ product: 'integration', idp_id: 'u-1', is_wso2_user: true, integration_type: 'automation' }));
  });

  it('adds the mapped fixed properties', () => {
    trackEvent('component-test');

    expect(moesifClient.track).toHaveBeenCalledWith('Component-Viewed-Page', expect.objectContaining({ page: 'test' }));
  });

  it('sends nothing once analytics consent is withdrawn', () => {
    setActiveGroups('C0001');

    trackEvent('component-create-submit');

    expect(moesifClient.track).not.toHaveBeenCalled();
  });

  it('ignores an unmapped event', () => {
    trackEvent('not-a-real-event');

    expect(moesifClient.track).not.toHaveBeenCalled();
  });

  it('identifies the user and organization when asked', () => {
    trackEvent('login-clickbutton-success', undefined, true);

    expect(moesifClient.identifyUser).toHaveBeenCalledWith('u-1', { email: 'jane@wso2.com', name: 'Jane', isWSO2User: true });
    expect(moesifClient.identifyCompany).toHaveBeenCalledWith('org-1', { name: 'acme' });
  });
});

// Consent resolution is module state, so these start from a freshly loaded module.
describe('events before consent resolves', () => {
  const signedIn = { user: { userId: 'u-1', username: 'jane@wso2.com', displayName: 'Jane' }, orgHandle: 'acme', orgUuid: 'org-1' };

  async function freshTracking(): Promise<typeof import('./tracking')> {
    vi.resetModules();
    return import('./tracking');
  }

  beforeEach(() => {
    document.head.innerHTML = '';
    delete (window as unknown as Record<string, unknown>).OptanonWrapper;
    delete (globalThis as Record<string, unknown>).OneTrust;
    (window as unknown as { API_CONFIG: unknown }).API_CONFIG = { moesifAppApiKey: 'test-key' };
    setActiveGroups(undefined);
    session.current = null;
    moesifClient.track.mockClear();
    moesifClient.identifyUser.mockClear();
  });

  it('sends events queued before consent once it is granted', async () => {
    const tracking = await freshTracking();
    tracking.initTracking();
    tracking.trackEvent('visit-login-page');
    expect(moesifClient.track).not.toHaveBeenCalled();

    setActiveGroups('C0001,C0002');
    window.OptanonWrapper?.();

    expect(moesifClient.track).toHaveBeenCalledWith('Landing-SignIn-Viewed', expect.any(Object));
  });

  it('discards queued events when consent is explicitly denied', async () => {
    (globalThis as Record<string, unknown>).OneTrust = { OnConsentChanged: vi.fn(), IsAlertBoxClosed: () => true };
    const tracking = await freshTracking();
    tracking.initTracking();
    tracking.trackEvent('visit-login-page');

    setActiveGroups('C0001');
    window.OptanonWrapper?.();
    setActiveGroups('C0001,C0002');

    expect(moesifClient.track).not.toHaveBeenCalled();
  });

  it('keeps queued events while the banner is unanswered, then sends them on accept', async () => {
    let bannerClosed = false;
    let onConsentChanged: (() => void) | undefined;
    (globalThis as Record<string, unknown>).OneTrust = {
      OnConsentChanged: (callback: () => void) => {
        onConsentChanged = callback;
      },
      IsAlertBoxClosed: () => bannerClosed,
    };
    const tracking = await freshTracking();
    tracking.initTracking();
    tracking.trackEvent('visit-login-page');

    setActiveGroups('C0001'); // opt-in region: unanswered banner looks like a denial
    window.OptanonWrapper?.();
    expect(moesifClient.track).not.toHaveBeenCalled();

    bannerClosed = true;
    setActiveGroups('C0001,C0002');
    onConsentChanged?.();

    expect(moesifClient.track).toHaveBeenCalledWith('Landing-SignIn-Viewed', expect.any(Object));
  });

  it('identifies a restored session on its first event', async () => {
    const tracking = await freshTracking();
    tracking.initTracking();
    setActiveGroups('C0001,C0002');
    window.OptanonWrapper?.(); // consent resolves before the session is restored
    expect(moesifClient.identifyUser).not.toHaveBeenCalled();

    session.current = signedIn;
    tracking.trackEvent('visit-home');
    tracking.trackEvent('navbar-home');

    expect(moesifClient.identifyUser).toHaveBeenCalledTimes(1);
    expect(moesifClient.identifyUser).toHaveBeenCalledWith('u-1', expect.any(Object));
  });

  it('loads nothing and queues nothing when trackingEnv is off', async () => {
    (window as unknown as { API_CONFIG: unknown }).API_CONFIG = { trackingEnv: 'off', moesifAppApiKey: 'test-key' };
    const tracking = await freshTracking();
    tracking.initTracking();
    tracking.trackEvent('visit-login-page');

    expect(document.head.querySelector('script[src*="cookiepro"]')).toBeNull();
    expect(window.OptanonWrapper).toBeUndefined();
    expect(moesifClient.track).not.toHaveBeenCalled();
  });
});
