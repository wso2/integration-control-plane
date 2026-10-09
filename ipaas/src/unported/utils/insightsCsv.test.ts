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

import { describe, it, expect, vi } from 'vitest';
import { escapeCsvCell, toCsv, downloadOrgInsightsCsv } from './insightsCsv';

describe('escapeCsvCell', () => {
  it('wraps plain values in double quotes', () => {
    expect(escapeCsvCell('hello')).toBe('"hello"');
    expect(escapeCsvCell(42)).toBe('"42"');
  });

  it('doubles embedded double-quotes', () => {
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
  });

  it('preserves commas and newlines inside the quoted cell', () => {
    expect(escapeCsvCell('a,b')).toBe('"a,b"');
    expect(escapeCsvCell('line1\nline2')).toBe('"line1\nline2"');
  });

  it('renders null and undefined as empty quoted cells', () => {
    expect(escapeCsvCell(null)).toBe('""');
    expect(escapeCsvCell(undefined)).toBe('""');
  });

  it('prefixes formula-like strings with an apostrophe, leaving numbers unchanged', () => {
    expect(escapeCsvCell('=SUM(A1:A2)')).toBe('"\'=SUM(A1:A2)"');
    expect(escapeCsvCell('+cmd|calc')).toBe('"\'+cmd|calc"');
    expect(escapeCsvCell('@import')).toBe('"\'@import"');
    expect(escapeCsvCell('-2+3')).toBe('"\'-2+3"');
    expect(escapeCsvCell(-42)).toBe('"-42"');
    expect(escapeCsvCell('plain')).toBe('"plain"');
  });
});

describe('toCsv', () => {
  it('joins cells with commas and rows with CRLF', () => {
    expect(
      toCsv([
        ['a', 'b'],
        ['c', 'd'],
      ]),
    ).toBe('"a","b"\r\n"c","d"');
  });

  it('renders an empty row array as a blank line', () => {
    expect(toCsv([['a'], [], ['b']])).toBe('"a"\r\n\r\n"b"');
  });

  it('escapes each cell as it joins', () => {
    expect(toCsv([['x,y', 'z"z']])).toBe('"x,y","z""z"');
  });
});

describe('downloadOrgInsightsCsv', () => {
  it('emits KPI and trend rows and triggers a download', async () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const createUrlSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    const revokeUrlSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    downloadOrgInsightsCsv('Test-Org', 'Production', '7d', {
      kpis: [
        { label: 'Total Traffic', value: '10.5k' },
        { label: 'Total Errors', value: '125' },
        { label: 'Overall Latency', value: '245 ms' },
      ],
      trend: [
        { label: '7/1', apiRequests: 1000, errors: 50 },
        { label: '7/2', apiRequests: 1200, errors: 60 },
      ],
    });

    expect(clickSpy).toHaveBeenCalledOnce();
    const csv = await (createUrlSpy.mock.calls[0][0] as Blob).text();
    expect(csv).toContain('"Organization Usage Insights Report"');
    expect(csv).toContain('"Total Traffic","10.5k"');
    expect(csv).toContain('"7/2","1200","60"');

    clickSpy.mockRestore();
    createUrlSpy.mockRestore();
    revokeUrlSpy.mockRestore();
  });
});
