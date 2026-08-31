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

const mockFeatures = vi.hoisted(() => ({ IS_WIP: false, IS_CLOUD: false, IS_ICP: false }));
vi.mock('../features', () => mockFeatures);

const moesifClient = vi.hoisted(() => ({ start: vi.fn(), stop: vi.fn() }));
const moesifInit = vi.hoisted(() => vi.fn(() => moesifClient));
vi.mock('moesif-browser-js', () => ({ default: { init: moesifInit } }));

import { initTracking } from './tracking';

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

    mockFeatures.IS_WIP = false;
    mockFeatures.IS_CLOUD = false;
    mockFeatures.IS_ICP = false;

    moesifInit.mockClear();
    moesifClient.start.mockClear();
    moesifClient.stop.mockClear();
  });

  it('loads nothing for ICP', () => {
    mockFeatures.IS_ICP = true;

    initTracking();

    expect(document.head.querySelector('script[src*="googletagmanager"]')).toBeNull();
    expect(document.head.querySelector('script[src*="cookiepro"]')).toBeNull();
  });

  it('loads the dev/stage GTM container and CookiePro test domain script for WIP by default', () => {
    mockFeatures.IS_WIP = true;

    initTracking();

    const gtmScript = document.head.querySelector('script[src*="googletagmanager.com/gtm.js"]');
    expect(gtmScript?.getAttribute('src')).toContain('GTM-MW3T7S9W');
    const cookieProScript = document.head.querySelector('script[src*="cookiepro"]');
    expect(cookieProScript?.getAttribute('data-domain-script')).toBe('01956090-3b3e-72fc-8434-dd70c76c43d2-test');
  });

  it('loads the prod GTM container and CookiePro prod domain script for WIP when trackingEnv is prod', () => {
    mockFeatures.IS_WIP = true;
    (window as unknown as { API_CONFIG: unknown }).API_CONFIG = { trackingEnv: 'prod' };

    initTracking();

    const gtmScript = document.head.querySelector('script[src*="googletagmanager.com/gtm.js"]');
    expect(gtmScript?.getAttribute('src')).toContain('GTM-58TBJFHN');
    const cookieProScript = document.head.querySelector('script[src*="cookiepro"]');
    expect(cookieProScript?.getAttribute('data-domain-script')).toBe('01956090-3b3e-72fc-8434-dd70c76c43d2');
  });

  it('does not initialize Moesif before analytics consent is granted', () => {
    mockFeatures.IS_WIP = true;
    (window as unknown as { API_CONFIG: unknown }).API_CONFIG = { moesifAppApiKey: 'test-key' };

    initTracking();
    setActiveGroups('C0001'); // strictly necessary only — no analytics consent
    window.OptanonWrapper?.();

    expect(moesifInit).not.toHaveBeenCalled();
  });

  it('initializes and starts Moesif once analytics consent is granted', () => {
    mockFeatures.IS_WIP = true;
    (window as unknown as { API_CONFIG: unknown }).API_CONFIG = { moesifAppApiKey: 'test-key' };

    initTracking();
    setActiveGroups('C0001,C0002');
    window.OptanonWrapper?.();

    expect(moesifInit).toHaveBeenCalledWith(expect.objectContaining({ applicationId: 'test-key' }));
    expect(moesifClient.start).toHaveBeenCalledTimes(1);
  });

  it('stops Moesif when analytics consent is later withdrawn', () => {
    mockFeatures.IS_WIP = true;
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
  });

  it('loads nothing for an unconfigured Cloud build', () => {
    mockFeatures.IS_CLOUD = true;

    initTracking();

    expect(document.head.querySelector('script[src*="googletagmanager"]')).toBeNull();
    expect(document.head.querySelector('script[src*="cookiepro"]')).toBeNull();
  });
});
