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

import { afterEach, describe, expect, it, vi } from 'vitest';
import { isAnalyticsCookiesAllowed, onConsentChange } from './oneTrustCookiePro';

function setActiveGroups(value: string | undefined): void {
  if (value === undefined) {
    delete (globalThis as Record<string, unknown>).OnetrustActiveGroups;
  } else {
    (globalThis as Record<string, unknown>).OnetrustActiveGroups = value;
  }
}

function setOneTrust(value: unknown): void {
  if (value === undefined) {
    delete (globalThis as Record<string, unknown>).OneTrust;
  } else {
    (globalThis as Record<string, unknown>).OneTrust = value;
  }
}

describe('isAnalyticsCookiesAllowed', () => {
  afterEach(() => {
    setActiveGroups(undefined);
  });

  it('returns false when OneTrust has not populated OnetrustActiveGroups yet', () => {
    expect(isAnalyticsCookiesAllowed()).toBe(false);
  });

  it('returns false when the user has not consented to the analytics category', () => {
    setActiveGroups('C0001');
    expect(isAnalyticsCookiesAllowed()).toBe(false);
  });

  it('returns true when the user has consented to the analytics category (C0002)', () => {
    setActiveGroups('C0001,C0002');
    expect(isAnalyticsCookiesAllowed()).toBe(true);
  });

  it('returns false for an empty consent string', () => {
    setActiveGroups('');
    expect(isAnalyticsCookiesAllowed()).toBe(false);
  });
});

describe('onConsentChange', () => {
  afterEach(() => {
    setOneTrust(undefined);
  });

  it('invokes the callback immediately', () => {
    const callback = vi.fn();
    onConsentChange(callback);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('does not throw when OneTrust has not loaded', () => {
    expect(() => onConsentChange(vi.fn())).not.toThrow();
  });

  it('subscribes the callback to OneTrust.OnConsentChanged when OneTrust is available', () => {
    const onConsentChanged = vi.fn();
    setOneTrust({ OnConsentChanged: onConsentChanged });
    const callback = vi.fn();

    onConsentChange(callback);

    expect(onConsentChanged).toHaveBeenCalledWith(callback);
  });
});
