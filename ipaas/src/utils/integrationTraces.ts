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

import { BI_BUILDPACK } from '../constants/integrations';
import { identifyIntegration } from './identifyIntegration';
import type { Component } from '../types/component';
import type { ServiceSpanPoint, ServiceSpanSeries, ServiceTrace, ServiceTraceSummary, SpanRow, TracePage, TraceRow, TraceStats, WaterfallRow } from '../types/integrationTraces';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const BUCKET_STEPS_MS = [MINUTE, 5 * MINUTE, 10 * MINUTE, 15 * MINUTE, 30 * MINUTE, HOUR, 3 * HOUR, 6 * HOUR, 12 * HOUR, DAY];
const MAX_BUCKETS = 40;

/**
 * Whether the integration publishes traces to the observability plane: ipaas-service sets
 * tracing up on deploy for Ballerina integrations. Agents publish through Agent Manager instead.
 */
export const hasIntegrationTraces = (c: Pick<Component, 'buildpackType' | 'displayType' | 'componentSubType'>): boolean => c.buildpackType === BI_BUILDPACK && identifyIntegration(c.displayType ?? '', c.componentSubType ?? null).type !== 'ai-agent';

/** The observer counts only the traces it lists, so a truncated window gives lower bounds. */
export function traceStats(page: TracePage): TraceStats {
  const errorTraces = page.traces.filter((t) => t.hasErrors).length;
  return {
    traces: page.total,
    errorTraces,
    errorRate: page.traces.length > 0 ? errorTraces / page.traces.length : 0,
    spans: page.traces.reduce((sum, t) => sum + t.spanCount, 0),
    lowerBound: page.truncated,
  };
}

export const formatCount = (value: number, lowerBound: boolean): string => `${value.toLocaleString()}${lowerBound ? '+' : ''}`;

export const formatPercent = (ratio: number): string => `${(ratio * 100).toFixed(ratio > 0 && ratio < 0.1 ? 1 : 0)}%`;

export function formatDuration(ms: number): string {
  if (ms < 1) return `${Math.round(ms * 1000)} µs`;
  if (ms < 1000) return `${ms < 10 ? ms.toFixed(1) : Math.round(ms)} ms`;
  if (ms < MINUTE) return `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)} s`;
  return `${(ms / MINUTE).toFixed(1)} min`;
}

/** The smallest step that keeps the window within MAX_BUCKETS points. */
export function bucketSizeMs(startMs: number, endMs: number): number {
  const span = Math.max(endMs - startMs, 1);
  return BUCKET_STEPS_MS.find((step) => span / step <= MAX_BUCKETS) ?? Math.ceil(span / MAX_BUCKETS / DAY) * DAY;
}

function bucketLabel(ms: number, stepMs: number): string {
  const d = new Date(ms);
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return stepMs >= HOUR ? `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}` : time;
}

/** Services ordered by how many spans they emitted, most first, so the busiest keeps the first colour. */
function servicesBySpanCount(spans: SpanRow[]): string[] {
  const counts = new Map<string, number>();
  for (const s of spans) counts.set(s.serviceName, (counts.get(s.serviceName) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([service]) => service);
}

/**
 * Span counts per service in fixed time buckets across the window. Series keys are
 * positional (s0, s1, …): service names such as "/api" or "a.b" are not safe chart
 * data keys, which the chart reads as property paths.
 */
export function spanSeriesByService(spans: SpanRow[], startMs: number, endMs: number): ServiceSpanSeries {
  const step = bucketSizeMs(startMs, endMs);
  const first = Math.floor(startMs / step) * step;
  const bucketCount = Math.max(Math.ceil((endMs - first) / step), 1);
  const services = servicesBySpanCount(spans);
  const series = services.map((service, i) => ({ key: `s${i}`, service }));
  const keyOf = new Map(series.map((s) => [s.service, s.key]));

  const points: ServiceSpanPoint[] = Array.from({ length: bucketCount }, (_, i) => {
    const point: ServiceSpanPoint = { label: bucketLabel(first + i * step, step) };
    for (const s of series) point[s.key] = 0;
    return point;
  });
  for (const span of spans) {
    const at = Date.parse(span.startTime);
    if (Number.isNaN(at) || at < startMs || at > endMs) continue;
    const point = points[Math.min(Math.floor((at - first) / step), bucketCount - 1)];
    const key = keyOf.get(span.serviceName);
    if (point && key) point[key] = (point[key] as number) + 1;
  }
  return { points, series };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(Math.ceil(p * sorted.length) - 1, sorted.length - 1)] ?? 0;
}

/** The spans of each sampled trace, keyed by trace id. */
function spansByTrace(spans: SpanRow[]): Map<string, SpanRow[]> {
  const byTrace = new Map<string, SpanRow[]>();
  for (const s of spans) {
    const own = byTrace.get(s.traceId);
    if (own) own.push(s);
    else byTrace.set(s.traceId, [s]);
  }
  return byTrace;
}

/** Where the trace entered the service: its earliest span whose parent belongs to another service or to none. */
function entrySpan(traceSpans: SpanRow[], service: string): SpanRow | undefined {
  const serviceOf = new Map(traceSpans.map((s) => [s.spanId, s.serviceName]));
  return traceSpans.filter((s) => s.serviceName === service && (!s.parentSpanId || serviceOf.get(s.parentSpanId) !== service)).sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime))[0];
}

/**
 * The sampled traces each service took part in, newest first. Only traces whose spans
 * were read appear, since the trace list does not name the services a trace passed through.
 */
export const tracesOfService = (traces: TraceRow[], spans: SpanRow[], service: string): ServiceTrace[] => serviceTraces(traces, spansByTrace(spans), service);

function serviceTraces(traces: TraceRow[], byTrace: Map<string, SpanRow[]>, service: string): ServiceTrace[] {
  return traces
    .flatMap((trace) => {
      const spans = byTrace.get(trace.traceId);
      const entry = spans && entrySpan(spans, service);
      if (!spans || !entry) return [];
      return [{ trace, spans, operation: entry.name, ...(entry.attributes['http.status_code'] ? { httpStatus: entry.attributes['http.status_code'] } : {}) }];
    })
    .sort((a, b) => Date.parse(b.trace.startTime) - Date.parse(a.trace.startTime));
}

/** Per service: the sampled traces it took part in, how many had an error, and their duration. */
export function summarizeServiceTraces(traces: TraceRow[], spans: SpanRow[]): ServiceTraceSummary[] {
  const byTrace = spansByTrace(spans);
  return servicesBySpanCount(spans).map((service) => {
    const own = serviceTraces(traces, byTrace, service).map((t) => t.trace);
    const durations = own.map((t) => t.durationMs).sort((a, b) => a - b);
    return {
      service,
      traces: own.length,
      errorTraces: own.filter((t) => t.hasErrors).length,
      avgDurationMs: durations.length > 0 ? durations.reduce((sum, d) => sum + d, 0) / durations.length : 0,
      p95DurationMs: percentile(durations, 0.95),
    };
  });
}

/**
 * One trace's spans in call order: each span after its parent, siblings by start time,
 * with its depth and its offset and width as fractions of the trace. A span whose parent
 * was not stored starts a branch of its own at depth 0.
 */
export function traceWaterfall(spans: SpanRow[]): WaterfallRow[] {
  if (spans.length === 0) return [];
  const byStart = [...spans].sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime));
  const ids = new Set(byStart.map((s) => s.spanId));
  const children = new Map<string, SpanRow[]>();
  for (const s of byStart) {
    if (!s.parentSpanId || !ids.has(s.parentSpanId)) continue;
    const siblings = children.get(s.parentSpanId);
    if (siblings) siblings.push(s);
    else children.set(s.parentSpanId, [s]);
  }
  const startMs = Math.min(...byStart.map((s) => Date.parse(s.startTime)));
  const endMs = Math.max(...byStart.map((s) => Date.parse(s.startTime) + s.durationMs));
  const total = Math.max(endMs - startMs, 1);

  const rows: WaterfallRow[] = [];
  const visit = (span: SpanRow, depth: number): void => {
    const offset = (Date.parse(span.startTime) - startMs) / total;
    rows.push({ span, depth, offset, width: Math.min(span.durationMs / total, 1 - offset) });
    for (const child of children.get(span.spanId) ?? []) visit(child, depth + 1);
  };
  for (const root of byStart.filter((s) => !s.parentSpanId || !ids.has(s.parentSpanId))) visit(root, 0);
  return rows;
}

/** Runs fn over items with at most `limit` calls in flight, keeping input order in the result. */
export async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next++;
      try {
        results[index] = { status: 'fulfilled', value: await fn(items[index] as T) };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(limit, 1), items.length) }, worker));
  return results;
}
