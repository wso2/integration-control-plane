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

import { afterEach, describe, expect, it } from 'vitest';
import { prefixed } from './storage';
import { clearStoredTestKeys, readStoredTestKey, storeTestKey } from './storedTestKeys';

afterEach(() => sessionStorage.clear());

describe('stored test keys', () => {
  const now = 1_000_000;

  it('reads back a key until it is due for renewal', () => {
    storeTestKey('org|a', { key: 'k1', mintedAt: now - 1_000, renewAt: now + 1_000 });
    expect(readStoredTestKey('org|a', now)).toEqual({ key: 'k1', mintedAt: now - 1_000, renewAt: now + 1_000 });
    expect(readStoredTestKey('org|a', now + 1_000)).toBeNull();
    // A key due for renewal is dropped, not kept for the next read.
    expect(sessionStorage.length).toBe(0);
  });

  it('drops a value it cannot read', () => {
    sessionStorage.setItem(prefixed('endpoint-test-key:org|a'), '{not json');
    expect(readStoredTestKey('org|a', now)).toBeNull();
    sessionStorage.setItem(prefixed('endpoint-test-key:org|a'), JSON.stringify({ key: '', mintedAt: now, renewAt: now + 1 }));
    expect(readStoredTestKey('org|a', now)).toBeNull();
    expect(sessionStorage.length).toBe(0);
  });

  it('clears every kept key and nothing else', () => {
    storeTestKey('org|a', { key: 'k1', mintedAt: now, renewAt: now + 1 });
    storeTestKey('org|b', { key: 'k2', mintedAt: now, renewAt: now + 1 });
    sessionStorage.setItem(prefixed('skip-silent-sign-in'), '1');
    clearStoredTestKeys();
    expect(sessionStorage.length).toBe(1);
    expect(sessionStorage.getItem(prefixed('skip-silent-sign-in'))).toBe('1');
  });
});
