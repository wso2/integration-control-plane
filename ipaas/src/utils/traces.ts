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

/** Pure helpers for the agent traces page. */

import type { SpanSummary, TokenUsage, TraceQuery } from '../types/traces';

const NANOS_PER_MS = 1_000_000;

/**
 * A span duration in the largest readable unit. Agent spans run from
 * microseconds to minutes, so one fixed unit prints either zeros or noise.
 */
export function formatDuration(nanos: number): string {
  if (!Number.isFinite(nanos) || nanos < 0) return '—';
  const ms = nanos / NANOS_PER_MS;
  if (ms < 1) return `${Math.round(nanos / 1000)}µs`;
  if (ms < 1000) return `${ms < 10 ? ms.toFixed(1) : Math.round(ms)}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 2 : 1)}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${Math.round(seconds - minutes * 60)}s`;
}

/** An absent count reads as unknown, not as zero — the agent may well have spent tokens. */
export function formatTokens(usage: TokenUsage | undefined): string {
  if (usage?.totalTokens === undefined) return '—';
  return usage.totalTokens.toLocaleString();
}

/** One line of a span's input or output, for a table cell. */
export function previewValue(value: unknown, maxLength = 120): string {
  if (value === undefined || value === null) return '';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  const collapsed = text.replace(/\s+/g, ' ').trim();
  return collapsed.length > maxLength ? `${collapsed.slice(0, maxLength - 1)}…` : collapsed;
}

/** Pretty JSON for the detail panel; non-JSON values are shown as they are. */
export function formatAttributeValue(value: unknown): string {
  if (typeof value === 'string') {
    // Instrumentation often puts a JSON document in a string attribute.
    const trimmed = value.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        return JSON.stringify(JSON.parse(trimmed), null, 2);
      } catch {
        return value;
      }
    }
    return value;
  }
  return JSON.stringify(value, null, 2) ?? String(value);
}

export interface SpanTreeRow {
  span: SpanSummary;
  depth: number;
  /** Start of the span as a fraction of the trace's own span, 0–1. */
  offset: number;
  /** Length of the span as a fraction of the trace's own span, 0–1. */
  width: number;
}

/**
 * Epoch milliseconds, keeping the sub-millisecond part. `Date.parse` truncates
 * at three decimals, which collapses a whole trace that runs inside one
 * millisecond onto a single instant and renders every bar full width.
 */
export function parseEpochMs(iso: string): number {
  const base = Date.parse(iso);
  if (Number.isNaN(base)) return Number.NaN;
  const fraction = /\.(\d+)/.exec(iso);
  if (!fraction || fraction[1].length <= 3) return base;
  return base + Number(`0.${fraction[1].slice(3)}`);
}

/**
 * Orders spans depth-first and measures each against the trace's window, for
 * the waterfall. A span whose parent is missing becomes a root rather than
 * disappearing: the listing is capped and a parent may never have been
 * exported, so dropping those would lose whole subtrees.
 */
export function buildSpanTree(spans: SpanSummary[]): SpanTreeRow[] {
  if (spans.length === 0) return [];

  const byId = new Map(spans.map((span) => [span.spanId, span]));
  const childrenOf = new Map<string, SpanSummary[]>();
  const roots: SpanSummary[] = [];

  for (const span of spans) {
    const parentId = span.parentSpanId;
    if (parentId && parentId !== span.spanId && byId.has(parentId)) {
      const siblings = childrenOf.get(parentId);
      if (siblings) siblings.push(span);
      else childrenOf.set(parentId, [span]);
    } else {
      roots.push(span);
    }
  }

  const startOf = (span: SpanSummary): number => parseEpochMs(span.startTime);
  // durationNs is the authoritative length; the end timestamp only bounds the trace.
  const lengthMs = (span: SpanSummary): number => span.durationNs / NANOS_PER_MS;
  const byStart = (a: SpanSummary, b: SpanSummary): number => startOf(a) - startOf(b) || a.spanId.localeCompare(b.spanId);

  const starts = spans.map(startOf).filter((t) => !Number.isNaN(t));
  const ends = spans.map((span) => startOf(span) + lengthMs(span)).filter((t) => !Number.isNaN(t));
  const traceStart = starts.length ? Math.min(...starts) : 0;
  const traceEnd = ends.length ? Math.max(...ends) : 0;
  const traceSpanMs = traceEnd - traceStart;

  const measure = (span: SpanSummary): { offset: number; width: number } => {
    if (traceSpanMs <= 0) return { offset: 0, width: 1 };
    const start = startOf(span);
    if (Number.isNaN(start)) return { offset: 0, width: 0 };
    const offset = (start - traceStart) / traceSpanMs;
    const width = lengthMs(span) / traceSpanMs;
    return { offset: Math.min(Math.max(offset, 0), 1), width: Math.min(Math.max(width, 0), 1 - Math.min(offset, 1)) };
  };

  const rows: SpanTreeRow[] = [];
  const emitted = new Set<string>();

  const walk = (span: SpanSummary, depth: number): void => {
    if (emitted.has(span.spanId)) return;
    emitted.add(span.spanId);
    rows.push({ span, depth, ...measure(span) });
    for (const child of (childrenOf.get(span.spanId) ?? []).sort(byStart)) walk(child, depth + 1);
  };

  for (const root of [...roots].sort(byStart)) walk(root, 0);
  // A cycle leaves its members unreachable from any root; emit them flat.
  for (const span of spans) walk(span, 0);

  return rows;
}

/** Minutes of history the page offers, newest first. */
export const TRACE_RANGES = [
  { label: 'Last 15 minutes', minutes: 15 },
  { label: 'Last hour', minutes: 60 },
  { label: 'Last 6 hours', minutes: 60 * 6 },
  { label: 'Last 24 hours', minutes: 60 * 24 },
  { label: 'Last 7 days', minutes: 60 * 24 * 7 },
] as const;

/** The window for a range, ending at `now`. */
export function traceWindow(minutes: number, now: Date = new Date()): Pick<TraceQuery, 'startTime' | 'endTime'> {
  return {
    startTime: new Date(now.getTime() - minutes * 60_000).toISOString(),
    endTime: now.toISOString(),
  };
}
