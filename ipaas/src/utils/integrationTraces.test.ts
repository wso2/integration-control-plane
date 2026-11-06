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
import { bucketSizeMs, hasIntegrationTraces, formatCount, formatDuration, mapWithConcurrency, spanSeriesByService, summarizeServiceTraces, traceStats, traceWaterfall, tracesOfService } from './integrationTraces';
import type { SpanRow, TraceRow } from '../types/integrationTraces';

const trace = (overrides: Partial<TraceRow> = {}): TraceRow => ({
  traceId: 't',
  name: 'get /x',
  spanCount: 2,
  startTime: '2026-10-30T00:00:00Z',
  endTime: '2026-10-30T00:00:01Z',
  durationMs: 1000,
  hasErrors: false,
  ...overrides,
});

const span = (overrides: Partial<SpanRow> = {}): SpanRow => ({
  traceId: 't',
  spanId: 's',
  name: 'get /x',
  kind: 'SERVER',
  startTime: '2026-10-30T00:00:00Z',
  endTime: '2026-10-30T00:00:00Z',
  durationMs: 10,
  status: 'ok',
  serviceName: '/api',
  attributes: {},
  ...overrides,
});

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const T0 = Date.parse('2026-10-30T00:00:00Z');

describe('hasIntegrationTraces', () => {
  it('is true for Ballerina integrations only, not agents or MI', () => {
    expect(hasIntegrationTraces({ buildpackType: 'BI', displayType: 'ballerinaService', componentSubType: null })).toBe(true);
    expect(hasIntegrationTraces({ buildpackType: 'wso2-mi', displayType: 'miApiService', componentSubType: null })).toBe(false);
    expect(hasIntegrationTraces({ buildpackType: 'BI', displayType: 'ballerinaService', componentSubType: 'aiAgent' })).toBe(false);
    expect(hasIntegrationTraces({ displayType: 'ballerinaService', componentSubType: null })).toBe(false);
  });
});

describe('traceStats', () => {
  it('counts error traces and spans of the listed traces', () => {
    const stats = traceStats({ traces: [trace({ hasErrors: true, spanCount: 3 }), trace(), trace(), trace()], total: 4, truncated: false });
    expect(stats).toEqual({ traces: 4, errorTraces: 1, errorRate: 0.25, spans: 9, lowerBound: false });
  });

  it('reports a truncated window as lower bounds', () => {
    expect(traceStats({ traces: [trace()], total: 1000, truncated: true }).lowerBound).toBe(true);
  });

  it('gives a zero error rate for an empty window rather than NaN', () => {
    expect(traceStats({ traces: [], total: 0, truncated: false }).errorRate).toBe(0);
  });
});

describe('formatting', () => {
  it('marks a lower bound with a plus', () => {
    expect(formatCount(1000, true)).toBe('1,000+');
    expect(formatCount(12, false)).toBe('12');
  });

  it('picks a unit that fits the duration', () => {
    expect(formatDuration(0.25)).toBe('250 µs');
    expect(formatDuration(4.25)).toBe('4.3 ms');
    expect(formatDuration(120)).toBe('120 ms');
    expect(formatDuration(1500)).toBe('1.50 s');
    expect(formatDuration(90_000)).toBe('1.5 min');
  });
});

describe('bucketSizeMs', () => {
  it('keeps every preset within forty buckets', () => {
    for (const hours of [1 / 6, 0.5, 1, 24, 168, 720]) {
      const step = bucketSizeMs(T0, T0 + hours * HOUR);
      expect((hours * HOUR) / step).toBeLessThanOrEqual(40);
    }
  });

  it('uses one-minute buckets for a ten-minute window', () => {
    expect(bucketSizeMs(T0, T0 + 10 * MINUTE)).toBe(MINUTE);
  });
});

describe('spanSeriesByService', () => {
  it('counts spans per service in each bucket, busiest service first', () => {
    const spans = [
      span({ serviceName: '/admin', startTime: '2026-10-30T00:01:30Z' }),
      span({ serviceName: '/api', startTime: '2026-10-30T00:01:10Z' }),
      span({ serviceName: '/api', startTime: '2026-10-30T00:01:20Z' }),
      span({ serviceName: '/api', startTime: '2026-10-30T00:03:00Z' }),
    ];
    const { points, series } = spanSeriesByService(spans, T0, T0 + 10 * MINUTE);

    expect(series).toEqual([
      { key: 's0', service: '/api' },
      { key: 's1', service: '/admin' },
    ]);
    expect(points).toHaveLength(10);
    expect(points[1]).toMatchObject({ s0: 2, s1: 1 });
    expect(points[3]).toMatchObject({ s0: 1, s1: 0 });
    expect(points.reduce((sum, p) => sum + (p.s0 as number) + (p.s1 as number), 0)).toBe(4);
  });

  // Service names are not safe chart data keys: the chart reads "a.b" as a nested path.
  it('never uses a service name as a data key', () => {
    const { points } = spanSeriesByService([span({ serviceName: 'a.b' })], T0, T0 + MINUTE);
    expect(Object.keys(points[0] ?? {})).toEqual(['label', 's0']);
  });

  it('ignores spans outside the window', () => {
    const { points } = spanSeriesByService([span({ startTime: '2026-10-29T23:00:00Z' })], T0, T0 + 10 * MINUTE);
    expect(points.every((p) => p.s0 === 0)).toBe(true);
  });
});

// Trace t1: /api calls /backend. Trace t2: /api only, with an error and older.
const t1 = trace({ traceId: 't1', startTime: '2026-10-30T00:05:00Z', durationMs: 300 });
const t2 = trace({ traceId: 't2', startTime: '2026-10-30T00:01:00Z', durationMs: 100, hasErrors: true });
const sampleSpans = [
  span({ traceId: 't1', spanId: 'a', name: 'post /albums', attributes: { 'http.status_code': '201' } }),
  span({ traceId: 't1', spanId: 'b', parentSpanId: 'a', name: 'client post', kind: 'CLIENT' }),
  span({ traceId: 't1', spanId: 'c', parentSpanId: 'b', name: 'post /backend/albums', serviceName: '/backend' }),
  span({ traceId: 't2', spanId: 'd', name: 'get /albums', status: 'error' }),
];

describe('tracesOfService', () => {
  it('lists the traces a service took part in, newest first, with the span it was entered through', () => {
    expect(tracesOfService([t2, t1], sampleSpans, '/api')).toEqual([
      { trace: t1, spans: sampleSpans.slice(0, 3), operation: 'post /albums', httpStatus: '201' },
      { trace: t2, spans: sampleSpans.slice(3), operation: 'get /albums' },
    ]);
  });

  it('names the entry span of a service called from another one', () => {
    expect(tracesOfService([t1, t2], sampleSpans, '/backend')).toMatchObject([{ trace: t1, operation: 'post /backend/albums' }]);
  });

  it('leaves out traces whose spans were not read', () => {
    expect(tracesOfService([trace({ traceId: 'unsampled' })], sampleSpans, '/api')).toEqual([]);
  });
});

describe('summarizeServiceTraces', () => {
  it('counts traces, error traces and trace durations per service, busiest service first', () => {
    expect(summarizeServiceTraces([t1, t2], sampleSpans)).toEqual([
      { service: '/api', traces: 2, errorTraces: 1, avgDurationMs: 200, p95DurationMs: 300 },
      { service: '/backend', traces: 1, errorTraces: 0, avgDurationMs: 300, p95DurationMs: 300 },
    ]);
  });
});

describe('traceWaterfall', () => {
  it('orders spans as a call tree and places each on the trace timeline', () => {
    const spans = [
      span({ spanId: 'child2', parentSpanId: 'root', startTime: '2026-10-30T00:00:00.600Z', durationMs: 200 }),
      span({ spanId: 'root', startTime: '2026-10-30T00:00:00Z', durationMs: 1000 }),
      span({ spanId: 'grandchild', parentSpanId: 'child1', startTime: '2026-10-30T00:00:00.200Z', durationMs: 100 }),
      span({ spanId: 'child1', parentSpanId: 'root', startTime: '2026-10-30T00:00:00.100Z', durationMs: 400 }),
    ];
    expect(traceWaterfall(spans).map((r) => [r.span.spanId, r.depth, r.offset, r.width])).toEqual([
      ['root', 0, 0, 1],
      ['child1', 1, 0.1, 0.4],
      ['grandchild', 2, 0.2, 0.1],
      ['child2', 1, 0.6, 0.2],
    ]);
  });

  it('starts a branch for a span whose parent was not stored', () => {
    const rows = traceWaterfall([span({ spanId: 'orphan', parentSpanId: 'missing' })]);
    expect(rows.map((r) => [r.span.spanId, r.depth])).toEqual([['orphan', 0]]);
  });
});

describe('mapWithConcurrency', () => {
  it('keeps order, reports failures per item, and never exceeds the limit', async () => {
    let inFlight = 0;
    let peak = 0;
    const results = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      if (n === 3) throw new Error('three');
      return n * 10;
    });

    expect(peak).toBe(2);
    expect(results.map((r) => (r.status === 'fulfilled' ? r.value : 'failed'))).toEqual([10, 20, 'failed', 40, 50]);
  });

  it('returns nothing for no items', async () => {
    expect(await mapWithConcurrency([], 4, async () => 1)).toEqual([]);
  });
});
