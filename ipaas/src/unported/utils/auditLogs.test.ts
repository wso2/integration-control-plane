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
import { formatAuditTimestamp, outcomeColor, rangeFromPreset } from './auditLogs';

describe('rangeFromPreset', () => {
  it('returns ISO bounds spanning the window ending at now', () => {
    const now = Date.parse('2026-07-02T06:00:00.000Z');
    const { startTime, endTime } = rangeFromPreset(7 * 24 * 60 * 60 * 1000, now);
    expect(endTime).toBe('2026-07-02T06:00:00.000Z');
    expect(startTime).toBe('2026-06-25T06:00:00.000Z');
  });
});

describe('formatAuditTimestamp', () => {
  it('renders a value for a valid epoch-ms timestamp (string or number)', () => {
    expect(formatAuditTimestamp({ timestamp: Date.parse('2026-07-02T06:00:00Z') })).not.toBe('—');
    expect(formatAuditTimestamp({ timestamp: String(Date.parse('2026-07-02T06:00:00Z')) })).not.toBe('—');
  });

  it('falls back to eventLoggedTime, then to a dash', () => {
    expect(formatAuditTimestamp({ timestamp: 0, eventLoggedTime: '2026-07-02T06:00:00Z' })).not.toBe('—');
    expect(formatAuditTimestamp({ timestamp: 0 })).toBe('—');
    expect(formatAuditTimestamp({ timestamp: 'not-a-number' })).toBe('—');
  });
});

describe('outcomeColor', () => {
  it('maps outcomes to chip colours', () => {
    expect(outcomeColor('succeeded')).toBe('success');
    expect(outcomeColor('failed')).toBe('error');
    expect(outcomeColor(undefined)).toBe('default');
  });
});
