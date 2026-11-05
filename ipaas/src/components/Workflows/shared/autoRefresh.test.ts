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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { autoRefreshEnabled, isWorkflowDataQuery, setAutoRefreshEnabled, whenAutoRefresh } from './autoRefresh';

describe('autoRefresh', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('is on until the viewer switches it off, and remembers the choice', () => {
    expect(autoRefreshEnabled()).toBe(true);
    setAutoRefreshEnabled(false);
    expect(autoRefreshEnabled()).toBe(false);
    setAutoRefreshEnabled(true);
    expect(autoRefreshEnabled()).toBe(true);
  });

  it('keeps the choice under this console’s own storage prefix', () => {
    setAutoRefreshEnabled(false);
    expect(localStorage.getItem('icp:wf.autoRefresh')).toBe('off');
    expect(localStorage.getItem('wf.autoRefresh')).toBeNull();
  });

  it('polls only while it is on', () => {
    expect(whenAutoRefresh(3000)).toBe(3000);
    expect(whenAutoRefresh(false)).toBe(false);
    setAutoRefreshEnabled(false);
    expect(whenAutoRefresh(3000)).toBe(false);
  });

  // React Query skips the ticks of a hidden tab itself; turning the interval off here instead
  // would leave it off after the tab came back.
  it('keeps the interval in a hidden tab', () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    expect(whenAutoRefresh(3000)).toBe(3000);
  });

  it('stays on when storage cannot be read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(autoRefreshEnabled()).toBe(true);
  });

  it('refetches workflow data on resume, never another feature’s queries', () => {
    expect(isWorkflowDataQuery(['wf', 'scope-1', 'instances'])).toBe(true);
    expect(isWorkflowDataQuery(['endpoint-security', 'c', 'e', 'ep', 't'])).toBe(false);
    expect(isWorkflowDataQuery(['envEndpoints', {}])).toBe(false);
  });
});
