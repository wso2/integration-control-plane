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
import { loadConfig } from './runtimeConfig';

async function load(config: Record<string, string>): Promise<void> {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json(config)),
  );
  await loadConfig();
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('loadConfig: gateway sign-in (BFF)', () => {
  it('takes AUTH_BFF_CONTEXT and AUTH_BFF_SIGN_IN_URL as paths on the console origin', async () => {
    await load({ AUTH_BFF_CONTEXT: '/_auth/integration/', AUTH_BFF_SIGN_IN_URL: '/_auth/cloud/login?returnTo=%2F_auth%2Fintegration%2Fsignin' });
    expect(window.API_CONFIG.authBffContext).toBe('/_auth/integration');
    expect(window.API_CONFIG.authBffSignInUrl).toBe('/_auth/cloud/login?returnTo=%2F_auth%2Fintegration%2Fsignin');
  });

  it.each(['https://evil.example/_auth', '//evil.example/_auth', '/\\evil.example/_auth', 'javascript:alert(1)', '_auth/integration'])('ignores %s', async (value) => {
    await load({ AUTH_BFF_CONTEXT: value, AUTH_BFF_SIGN_IN_URL: value });
    expect(window.API_CONFIG.authBffContext).toBeUndefined();
    expect(window.API_CONFIG.authBffSignInUrl).toBeUndefined();
  });
});

describe('loadConfig: organization switcher', () => {
  it.each([
    ['true', true],
    [true, true],
    ['false', false],
    ['', false],
  ] as const)('reads ORGANIZATION_SWITCHER %j as %s', async (value, expected) => {
    await load({ ORGANIZATION_SWITCHER: value } as unknown as Record<string, string>);
    expect(window.API_CONFIG.organizationSwitcher).toBe(expected);
  });

  it('is off when unset', async () => {
    await load({});
    expect(window.API_CONFIG.organizationSwitcher).toBe(false);
  });
});

describe('loadConfig: console analytics', () => {
  it.each([
    ['true', true],
    [true, true],
    ['false', false],
    ['yes', false],
  ] as const)('reads CONSOLE_ANALYTICS_ENABLED %j as %s', async (value, expected) => {
    await load({ CONSOLE_ANALYTICS_ENABLED: value } as unknown as Record<string, string>);
    expect(window.API_CONFIG.consoleAnalyticsEnabled).toBe(expected);
  });

  it('is off when unset', async () => {
    await load({});
    expect(window.API_CONFIG.consoleAnalyticsEnabled).toBe(false);
  });
});

describe('loadConfig: tracking tier', () => {
  it.each(['dev', 'stage', 'prod', 'off'] as const)('reads TRACKING_ENV %s', async (value) => {
    await load({ TRACKING_ENV: value });
    expect(window.API_CONFIG.trackingEnv).toBe(value);
  });

  it('is off when unset or empty', async () => {
    await load({});
    expect(window.API_CONFIG.trackingEnv).toBe('off');
    await load({ TRACKING_ENV: '' });
    expect(window.API_CONFIG.trackingEnv).toBe('off');
  });

  it('is off, with a warning, for an unrecognized value', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await load({ TRACKING_ENV: 'production' });
    expect(window.API_CONFIG.trackingEnv).toBe('off');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('TRACKING_ENV "production"'));
    warn.mockRestore();
  });
});
