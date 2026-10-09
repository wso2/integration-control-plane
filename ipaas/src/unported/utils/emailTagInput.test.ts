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

import { describe, it, expect } from 'vitest';
import { isValidEmailAddress } from './emailTagInput';

describe('isValidEmailAddress', () => {
  it('accepts standard valid addresses', () => {
    expect(isValidEmailAddress('user@example.com')).toBe(true);
    expect(isValidEmailAddress('user.name+tag@sub.domain.org')).toBe(true);
    expect(isValidEmailAddress('a@b.co')).toBe(true);
  });

  it('rejects addresses missing @', () => {
    expect(isValidEmailAddress('userexample.com')).toBe(false);
  });

  it('rejects addresses with no domain', () => {
    expect(isValidEmailAddress('user@')).toBe(false);
  });

  it('rejects addresses with no TLD', () => {
    expect(isValidEmailAddress('user@domain')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidEmailAddress('')).toBe(false);
  });

  it('rejects addresses longer than 254 characters', () => {
    const long = 'a'.repeat(243) + '@example.com'; // total 255
    expect(long.length).toBeGreaterThan(254);
    expect(isValidEmailAddress(long)).toBe(false);
  });

  it('accepts addresses exactly at the 254-character limit', () => {
    // local = 242 chars, @ = 1, domain = 11 → total 254
    const at254 = 'a'.repeat(242) + '@example.com';
    expect(at254.length).toBe(254);
    expect(isValidEmailAddress(at254)).toBe(true);
  });
});
