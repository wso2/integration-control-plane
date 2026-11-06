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
import { DEFAULT_SETTLE_MS, clearSettling, isSettling, markSettling } from './settleRegistry';

describe('settleRegistry', () => {
  afterEach(() => {
    clearSettling();
    vi.useRealTimers();
  });

  it('keeps a workflow just acted on settling for the window, then forgets it', () => {
    vi.useFakeTimers();
    markSettling('order-1');
    expect(isSettling('order-1')).toBe(true);
    expect(isSettling('order-2')).toBe(false);

    vi.advanceTimersByTime(DEFAULT_SETTLE_MS + 1);
    expect(isSettling('order-1')).toBe(false);
  });

  it('ignores a missing workflow id', () => {
    markSettling('');
    expect(isSettling('')).toBe(false);
    expect(isSettling(null)).toBe(false);
  });
});
