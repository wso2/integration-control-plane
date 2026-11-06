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

import { describe, expect, it } from 'vitest';
import { historyIndex, historyRestoreDelta, isLeavingLinkClick, type LinkClick, type LinkTarget } from './unsavedChanges';

const plain: LinkClick = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false };
const current = new URL('https://console.test/organizations/acme/projects/new?x=1');
const link = (href: string, extra: Partial<LinkTarget> = {}): LinkTarget => ({ href, target: '', download: false, ...extra });

describe('isLeavingLinkClick', () => {
  it('intercepts a plain click to another in-app page', () => {
    expect(isLeavingLinkClick(plain, link('https://console.test/organizations/acme'), current)).toBe(true);
  });

  it('intercepts a change of query string alone', () => {
    expect(isLeavingLinkClick(plain, link('https://console.test/organizations/acme/projects/new?x=2'), current)).toBe(true);
  });

  it('lets same-page hash links through', () => {
    expect(isLeavingLinkClick(plain, link('https://console.test/organizations/acme/projects/new?x=1#top'), current)).toBe(false);
  });

  it.each([{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }, { defaultPrevented: true }])('lets %o through', (overrides) => {
    expect(isLeavingLinkClick({ ...plain, ...overrides }, link('https://console.test/organizations/acme'), current)).toBe(false);
  });

  it('lets new-tab and download links through', () => {
    expect(isLeavingLinkClick(plain, link('https://console.test/organizations/acme', { target: '_blank' }), current)).toBe(false);
    expect(isLeavingLinkClick(plain, link('https://console.test/organizations/acme', { download: true }), current)).toBe(false);
  });

  it('treats target=_self as the same tab', () => {
    expect(isLeavingLinkClick(plain, link('https://console.test/organizations/acme', { target: '_self' }), current)).toBe(true);
  });

  it('lets links to other origins through', () => {
    expect(isLeavingLinkClick(plain, link('https://docs.example.com/page'), current)).toBe(false);
  });

  it('lets unparseable hrefs through', () => {
    expect(isLeavingLinkClick(plain, link('http://[bad'), current)).toBe(false);
  });

  describe('under a base path', () => {
    const base = '/integration-platform';
    const inApp = new URL('https://console.test/integration-platform/organizations/acme/projects/new');

    it('intercepts links inside the base path, including the bare prefix', () => {
      expect(isLeavingLinkClick(plain, link('https://console.test/integration-platform/organizations/acme'), inApp, base)).toBe(true);
      expect(isLeavingLinkClick(plain, link('https://console.test/integration-platform'), inApp, base)).toBe(true);
    });

    it('lets same-origin links outside the base path through', () => {
      expect(isLeavingLinkClick(plain, link('https://console.test/other-console/home'), inApp, base)).toBe(false);
      expect(isLeavingLinkClick(plain, link('https://console.test/integration-platform-old/home'), inApp, base)).toBe(false);
    });
  });
});

describe('historyRestoreDelta', () => {
  it('returns the delta that undoes a back navigation', () => {
    expect(historyRestoreDelta(4, { idx: 3 })).toBe(1);
  });

  it('returns the delta that undoes a forward navigation', () => {
    expect(historyRestoreDelta(4, { idx: 6 })).toBe(-2);
  });

  it('is null when an index is unknown or unchanged', () => {
    expect(historyRestoreDelta(null, { idx: 3 })).toBeNull();
    expect(historyRestoreDelta(4, null)).toBeNull();
    expect(historyRestoreDelta(4, { usr: 1 })).toBeNull();
    expect(historyRestoreDelta(4, { idx: 4 })).toBeNull();
  });
});

describe('historyIndex', () => {
  it('reads the router index from history state', () => {
    expect(historyIndex({ idx: 2, key: 'k' })).toBe(2);
    expect(historyIndex(null)).toBeNull();
    expect(historyIndex({ idx: '2' })).toBeNull();
  });
});
