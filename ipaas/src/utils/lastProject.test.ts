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
import { readLastProject, rememberLastProject } from './lastProject';

describe('lastProject', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('stores the project under the name the platforms share', () => {
    rememberLastProject('payments');
    expect(localStorage.getItem('lastOpenedProject')).toBe('payments');
    expect(readLastProject()).toBe('payments');
  });

  it('reads a project another console stored', () => {
    localStorage.setItem('lastOpenedProject', 'orders');
    expect(readLastProject()).toBe('orders');
  });

  it('forgets the project at the organization level', () => {
    rememberLastProject('payments');
    rememberLastProject(undefined);
    expect(readLastProject()).toBeUndefined();
  });

  it('carries on when storage is unavailable', () => {
    const blocked = () => {
      throw new Error('SecurityError');
    };
    vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked, removeItem: blocked });
    expect(() => rememberLastProject('payments')).not.toThrow();
    expect(readLastProject()).toBeUndefined();
  });
});
