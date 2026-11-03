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
import { local, prefixed, session } from './storage';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('prefixed', () => {
  it('keeps this console’s keys out of the other consoles’ slots on a shared origin', () => {
    expect(prefixed('org_handle')).toBe('icp:org_handle');
  });
});

describe('local', () => {
  it('stores under the prefix', () => {
    local.set('org_handle', 'acme');
    expect(localStorage.getItem('icp:org_handle')).toBe('acme');
    expect(localStorage.getItem('org_handle')).toBeNull();
  });

  it('reads back what it stored', () => {
    local.set('org_handle', 'acme');
    expect(local.get('org_handle')).toBe('acme');
  });

  it('is null for a key that was never set', () => {
    expect(local.get('org_handle')).toBeNull();
  });

  it('removes only its own copy, never the unprefixed slot', () => {
    localStorage.setItem('org_handle', 'someone-elses');
    local.set('org_handle', 'acme');
    local.remove('org_handle');
    expect(localStorage.getItem('icp:org_handle')).toBeNull();
    expect(localStorage.getItem('org_handle')).toBe('someone-elses');
  });
});

describe('local — values left by a build from before the prefix', () => {
  it('copies a migratable value forward and leaves the original in place', () => {
    localStorage.setItem('org_handle', 'acme');
    expect(local.get('org_handle')).toBe('acme');
    expect(localStorage.getItem('icp:org_handle')).toBe('acme');
    expect(localStorage.getItem('org_handle')).toBe('acme');
  });

  it('copies the keyed forms too', () => {
    localStorage.setItem('last_project:u1', '{"org":"acme"}');
    localStorage.setItem('persona:u1:acme', 'developer');
    expect(local.get('last_project:u1')).toBe('{"org":"acme"}');
    expect(local.get('persona:u1:acme')).toBe('developer');
  });

  it('prefers its own value over a stale unprefixed one', () => {
    localStorage.setItem('icp:org_handle', 'acme');
    localStorage.setItem('org_handle', 'stale');
    expect(local.get('org_handle')).toBe('acme');
  });

  it.each(['redirect_url', 'tos_accepted:u1:acme', 'github_oauth_state', 'skip-silent-sign-in'])('does not adopt %s, which may be another console’s', (key) => {
    localStorage.setItem(key, 'from-another-console');
    expect(local.get(key)).toBeNull();
    expect(localStorage.getItem(prefixed(key))).toBeNull();
  });

  it('still returns the legacy value when the copy forward cannot be written', () => {
    localStorage.setItem('org_handle', 'acme');
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    try {
      expect(local.get('org_handle')).toBe('acme');
    } finally {
      setItem.mockRestore();
    }
  });
});

describe('session', () => {
  it('stores under the prefix in sessionStorage, not localStorage', () => {
    session.set('github_oauth_state', 'state-1');
    expect(sessionStorage.getItem('icp:github_oauth_state')).toBe('state-1');
    expect(localStorage.getItem('icp:github_oauth_state')).toBeNull();
  });

  it('adopts nothing: a one-shot flag is worthless after one load', () => {
    sessionStorage.setItem('github_oauth_state', 'from-another-console');
    expect(session.get('github_oauth_state')).toBeNull();
    expect(sessionStorage.getItem('github_oauth_state')).toBe('from-another-console');
  });
});
