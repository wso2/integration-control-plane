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

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { certificateValidity, certificateTypeLabel, formatCertificateDate } from './certificates';

describe('certificateValidity', () => {
  const NOW = new Date('2026-06-22T12:00:00Z').getTime();
  const DAY = 24 * 60 * 60 * 1000;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns UNKNOWN when notAfter is missing', () => {
    expect(certificateValidity(undefined)).toEqual({ label: 'N/A', color: 'default', category: 'UNKNOWN' });
    expect(certificateValidity('')).toEqual({ label: 'N/A', color: 'default', category: 'UNKNOWN' });
  });

  it('returns UNKNOWN when notAfter cannot be parsed', () => {
    expect(certificateValidity('not-a-date')).toEqual({ label: 'N/A', color: 'default', category: 'UNKNOWN' });
  });

  it('returns EXPIRED when the date is in the past', () => {
    expect(certificateValidity(new Date(NOW - DAY).toISOString())).toEqual({ label: 'Expired', color: 'error', category: 'EXPIRED' });
  });

  it('returns "Expires today" when the date is today', () => {
    expect(certificateValidity(new Date(NOW).toISOString())).toEqual({ label: 'Expires today', color: 'error', category: 'EXPIRED' });
  });

  it('returns singular day phrasing when 1 day remains', () => {
    expect(certificateValidity(new Date(NOW + DAY).toISOString())).toEqual({ label: 'Expires in 1 day', color: 'warning', category: 'EXPIRING_SOON' });
  });

  it('returns EXPIRING_SOON at the 30 day boundary', () => {
    expect(certificateValidity(new Date(NOW + 30 * DAY).toISOString())).toEqual({ label: 'Expires in 30 days', color: 'warning', category: 'EXPIRING_SOON' });
  });

  it('returns VALID just past the 30 day boundary', () => {
    expect(certificateValidity(new Date(NOW + 31 * DAY).toISOString())).toEqual({ label: 'Expires in 31 days', color: 'success', category: 'VALID' });
  });
});

describe('certificateTypeLabel', () => {
  it('labels TLS certificates as a public cert', () => {
    expect(certificateTypeLabel('TLS')).toBe('Public Cert');
  });

  it('labels CustomDomain certificates', () => {
    expect(certificateTypeLabel('CustomDomain')).toBe('Custom Domain');
  });

  it('passes through unrecognized types unchanged', () => {
    expect(certificateTypeLabel('Other')).toBe('Other');
  });

  it('falls back to N/A when no type is given', () => {
    expect(certificateTypeLabel(undefined)).toBe('N/A');
    expect(certificateTypeLabel('')).toBe('N/A');
  });
});

describe('formatCertificateDate', () => {
  it('returns null when there is no date string', () => {
    expect(formatCertificateDate(undefined)).toBeNull();
  });

  it('returns the original string when it cannot be parsed', () => {
    expect(formatCertificateDate('not-a-date')).toBe('not-a-date');
  });

  it('formats a valid Java-style date string', () => {
    const dateString = 'Thu Jul 03 10:56:45 GMT 2036';
    const expected = new Date(dateString).toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
    expect(formatCertificateDate(dateString)).toBe(expected);
  });
});
