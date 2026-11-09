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
import { formatDurationMs } from './workflowDuration';

describe('formatDurationMs', () => {
  it('writes each range in its own units', () => {
    expect(formatDurationMs(420)).toBe('420ms');
    expect(formatDurationMs(4200)).toBe('4.2s');
    expect(formatDurationMs(42_000)).toBe('42s');
    expect(formatDurationMs(68_000)).toBe('1m 8s');
    expect(formatDurationMs(3_908_000)).toBe('1h 5m');
  });

  it('carries a rounded-up unit into the next one', () => {
    expect(formatDurationMs(999.6)).toBe('1.0s');
    expect(formatDurationMs(9960)).toBe('10s');
    expect(formatDurationMs(59_600)).toBe('1m 0s');
    expect(formatDurationMs(119_600)).toBe('2m 0s');
    expect(formatDurationMs(3_599_600)).toBe('1h 0m');
  });

  it('reads a negative or unknown duration as zero', () => {
    expect(formatDurationMs(-5)).toBe('0ms');
    expect(formatDurationMs(NaN)).toBe('0ms');
  });
});
