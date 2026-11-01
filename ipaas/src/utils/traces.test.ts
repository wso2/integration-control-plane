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
import { buildSpanTree, formatAttributeValue, formatDuration, formatTokens, previewValue, traceWindow } from './traces';
import type { SpanSummary } from '../types/traces';

function span(spanId: string, parentSpanId: string | null, startMs: number, endMs: number): SpanSummary {
  return {
    spanId,
    spanName: spanId,
    parentSpanId,
    startTime: new Date(startMs).toISOString(),
    endTime: new Date(endMs).toISOString(),
    durationNs: (endMs - startMs) * 1_000_000,
  };
}

describe('formatDuration', () => {
  it.each([
    [500, '1µs'],
    [120_000, '120µs'],
    [1_500_000, '1.5ms'],
    [45_000_000, '45ms'],
    [2_250_000_000, '2.25s'],
    [12_000_000_000, '12.0s'],
    [95_000_000_000, '1m 35s'],
  ])('formats %i ns as %s', (nanos, expected) => {
    expect(formatDuration(nanos)).toBe(expected);
  });

  it('shows a dash rather than a number for an unusable duration', () => {
    expect(formatDuration(Number.NaN)).toBe('—');
    expect(formatDuration(-1)).toBe('—');
  });
});

describe('formatTokens', () => {
  // Missing usage and zero usage are different facts about a trace.
  it('distinguishes an absent count from a zero count', () => {
    expect(formatTokens(undefined)).toBe('—');
    expect(formatTokens({})).toBe('—');
    expect(formatTokens({ totalTokens: 0 })).toBe('0');
  });

  it('groups large counts', () => {
    expect(formatTokens({ totalTokens: 12345 })).toBe((12345).toLocaleString());
  });
});

describe('previewValue', () => {
  it('collapses whitespace in a multi-line value', () => {
    expect(previewValue('line one\n  line two')).toBe('line one line two');
  });

  it('serialises a structured value', () => {
    expect(previewValue({ role: 'user' })).toBe('{"role":"user"}');
  });

  it('truncates past the limit', () => {
    expect(previewValue('x'.repeat(50), 10)).toBe(`${'x'.repeat(9)}…`);
  });

  it('renders nothing for an absent value', () => {
    expect(previewValue(undefined)).toBe('');
    expect(previewValue(null)).toBe('');
  });
});

describe('formatAttributeValue', () => {
  it('pretty-prints JSON carried in a string attribute', () => {
    expect(formatAttributeValue('{"a":1}')).toBe('{\n  "a": 1\n}');
  });

  it('leaves a non-JSON string alone', () => {
    expect(formatAttributeValue('gpt-4o')).toBe('gpt-4o');
  });

  it('leaves a malformed JSON-looking string alone rather than throwing', () => {
    expect(formatAttributeValue('{not json')).toBe('{not json');
  });
});

describe('buildSpanTree', () => {
  it('orders a tree depth-first with the earliest sibling first', () => {
    const rows = buildSpanTree([span('child-b', 'root', 300, 400), span('root', null, 0, 1000), span('child-a', 'root', 100, 200), span('grandchild', 'child-a', 120, 180)]);

    expect(rows.map((r) => r.span.spanId)).toEqual(['root', 'child-a', 'grandchild', 'child-b']);
    expect(rows.map((r) => r.depth)).toEqual([0, 1, 2, 1]);
  });

  it('measures each span against the trace window', () => {
    const rows = buildSpanTree([span('root', null, 0, 1000), span('half', 'root', 500, 1000)]);

    expect(rows[0].offset).toBeCloseTo(0);
    expect(rows[0].width).toBeCloseTo(1);
    expect(rows[1].offset).toBeCloseTo(0.5);
    expect(rows[1].width).toBeCloseTo(0.5);
  });

  // The span listing is capped, so a child can arrive without its parent.
  it('keeps a span whose parent is missing instead of dropping it', () => {
    const rows = buildSpanTree([span('orphan', 'never-exported', 0, 100)]);

    expect(rows.map((r) => r.span.spanId)).toEqual(['orphan']);
    expect(rows[0].depth).toBe(0);
  });

  it('emits every span exactly once even when parents form a cycle', () => {
    const rows = buildSpanTree([span('a', 'b', 0, 100), span('b', 'a', 10, 90)]);

    expect(rows.map((r) => r.span.spanId).sort()).toEqual(['a', 'b']);
  });

  it('treats a span that claims itself as its parent as a root', () => {
    const rows = buildSpanTree([span('self', 'self', 0, 100)]);

    expect(rows).toHaveLength(1);
    expect(rows[0].depth).toBe(0);
  });

  it('returns nothing for no spans', () => {
    expect(buildSpanTree([])).toEqual([]);
  });

  it('gives every span full width when the trace has no measurable duration', () => {
    const rows = buildSpanTree([span('instant', null, 500, 500)]);

    expect(rows[0].width).toBe(1);
  });
});

describe('traceWindow', () => {
  it('ends at the reference instant and reaches back by the range', () => {
    const now = new Date('2026-11-01T12:00:00.000Z');

    expect(traceWindow(60, now)).toEqual({
      startTime: '2026-11-01T11:00:00.000Z',
      endTime: '2026-11-01T12:00:00.000Z',
    });
  });
});
