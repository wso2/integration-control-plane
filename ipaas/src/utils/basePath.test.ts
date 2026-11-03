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

// `basePath` is read from import.meta.env.BASE_URL when the module is evaluated, so each case
// stubs the build-time value and re-imports. Vite inlines BASE_URL; the default here is '/'.
async function withBaseUrl(baseUrl: string): Promise<typeof import('./basePath')> {
  vi.stubEnv('BASE_URL', baseUrl);
  vi.resetModules();
  return import('./basePath');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('at the root', () => {
  it('has an empty prefix', async () => {
    const { basePath } = await withBaseUrl('/');
    expect(basePath).toBe('');
  });

  it('leaves app paths untouched', async () => {
    const { withBase } = await withBaseUrl('/');
    expect(withBase('/signin')).toBe('/signin');
  });

  it('leaves window pathnames untouched', async () => {
    const { stripBase } = await withBaseUrl('/');
    expect(stripBase('/organizations/acme/home')).toBe('/organizations/acme/home');
    expect(stripBase('/')).toBe('/');
  });
});

describe('under a prefix', () => {
  it('drops the trailing slash Vite puts on BASE_URL', async () => {
    const { basePath } = await withBaseUrl('/integration-platform/');
    expect(basePath).toBe('/integration-platform');
  });

  it('prefixes an app path exactly once', async () => {
    const { withBase } = await withBaseUrl('/integration-platform/');
    expect(withBase('/signin')).toBe('/integration-platform/signin');
    expect(withBase('/editor')).toBe('/integration-platform/editor');
  });

  it('strips the prefix from a window pathname', async () => {
    const { stripBase } = await withBaseUrl('/integration-platform/');
    expect(stripBase('/integration-platform/signin')).toBe('/signin');
    expect(stripBase('/integration-platform/organizations/acme/home')).toBe('/organizations/acme/home');
  });

  it('maps the bare prefix to the app root', async () => {
    const { stripBase } = await withBaseUrl('/integration-platform/');
    expect(stripBase('/integration-platform')).toBe('/');
    expect(stripBase('/integration-platform/')).toBe('/');
  });

  it('leaves a path outside the prefix alone, including one that merely starts with the same letters', async () => {
    const { stripBase } = await withBaseUrl('/integration-platform/');
    expect(stripBase('/agent-platform/home')).toBe('/agent-platform/home');
    expect(stripBase('/integration-platform-x/home')).toBe('/integration-platform-x/home');
    expect(stripBase('/signin')).toBe('/signin');
  });

  it('strips only the first occurrence, so a doubled prefix stays visible', async () => {
    const { stripBase } = await withBaseUrl('/integration-platform/');
    expect(stripBase('/integration-platform/integration-platform/signin')).toBe('/integration-platform/signin');
  });

  it('round-trips an app path through withBase and back', async () => {
    const { withBase, stripBase } = await withBaseUrl('/integration-platform/');
    expect(stripBase(withBase('/organizations/acme/home'))).toBe('/organizations/acme/home');
  });
});
