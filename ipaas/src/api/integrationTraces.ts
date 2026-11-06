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

/**
 * Distributed traces of an integration, read from the OpenChoreo observer through
 * the wso2cloud observability proxy, as runtime logs are (see logs.ts). The proxy
 * sets searchScope.namespace from the caller's token, so a query never reaches
 * another organization's traces.
 */

import { obsClient, seg } from './_client';
import { resolveComponentProject } from './logs';
import { TRACE_QUERY_LIMIT, UNKNOWN_SERVICE } from '../constants/integrationTraces';
import type { ComponentTracesRequest, SpanRow, SpanStatus, TracePage, TraceRow } from '../types/integrationTraces';

const TRACES_QUERY_PATH = '/wso2cloud-obs/api/v1alpha1/traces/query';
const spansQueryPath = (traceId: string): string => `/wso2cloud-obs/api/v1alpha1/traces/${seg(traceId)}/spans/query`;

interface ObsTraceScope {
  project: string;
  component: string;
  environment: string;
}

interface ObsTracesQuery {
  searchScope: ObsTraceScope;
  startTime: string;
  endTime: string;
  limit: number;
  sortOrder: 'asc' | 'desc';
  includeAttributes?: boolean;
}

interface ObsTraceInfo {
  traceId?: string;
  traceName?: string;
  spanCount?: number;
  startTime?: string;
  endTime?: string;
  durationNs?: number;
  hasErrors?: boolean;
}

interface ObsSpanInfo {
  spanId?: string;
  spanName?: string;
  spanKind?: string;
  startTime?: string;
  endTime?: string;
  durationNs?: number;
  parentSpanId?: string;
  status?: { code?: string; message?: string };
  attributes?: Record<string, unknown>;
  resourceAttributes?: Record<string, unknown>;
}

const NS_PER_MS = 1_000_000;

// A trace or span without its id or start time cannot be listed, placed on the time axis or opened, so it is dropped rather than shown with made-up values.
function toTraceRow(t: ObsTraceInfo): TraceRow | null {
  if (!t.traceId || !t.startTime) return null;
  const endTime = t.endTime ?? t.startTime;
  return {
    traceId: t.traceId,
    name: t.traceName || t.traceId,
    spanCount: t.spanCount ?? 0,
    startTime: t.startTime,
    endTime,
    durationMs: t.durationNs !== undefined ? t.durationNs / NS_PER_MS : Date.parse(endTime) - Date.parse(t.startTime),
    hasErrors: t.hasErrors === true,
  };
}

const toStatus = (code: string | undefined): SpanStatus => (code === 'ok' || code === 'error' ? code : 'unset');

const stringify = (value: unknown): string => (typeof value === 'string' ? value : JSON.stringify(value));

function toSpanRow(traceId: string, s: ObsSpanInfo): SpanRow | null {
  if (!s.spanId || !s.startTime) return null;
  const endTime = s.endTime ?? s.startTime;
  const service = s.resourceAttributes?.['service.name'];
  return {
    traceId,
    spanId: s.spanId,
    ...(s.parentSpanId ? { parentSpanId: s.parentSpanId } : {}),
    name: s.spanName || s.spanId,
    kind: s.spanKind ?? '',
    startTime: s.startTime,
    endTime,
    durationMs: s.durationNs !== undefined ? s.durationNs / NS_PER_MS : Date.parse(endTime) - Date.parse(s.startTime),
    status: toStatus(s.status?.code?.toLowerCase()),
    ...(s.status?.message ? { statusMessage: s.status.message } : {}),
    serviceName: typeof service === 'string' && service ? service : UNKNOWN_SERVICE,
    attributes: Object.fromEntries(Object.entries(s.attributes ?? {}).map(([k, v]) => [k, stringify(v)])),
  };
}

// The observer requires the project whenever the component is set; see fetchComponentLogs.
async function traceQuery(req: ComponentTracesRequest, extra: Partial<ObsTracesQuery> = {}): Promise<ObsTracesQuery | null> {
  const project = await resolveComponentProject(req.componentId);
  if (!project) return null;
  return {
    searchScope: { project, component: req.componentId, environment: req.environmentId.toLowerCase() },
    startTime: req.startTime,
    endTime: req.endTime,
    limit: TRACE_QUERY_LIMIT,
    sortOrder: 'desc',
    ...extra,
  };
}

/** Newest traces first, up to TRACE_QUERY_LIMIT. */
export async function fetchComponentTraces(req: ComponentTracesRequest): Promise<TracePage> {
  const query = await traceQuery(req);
  if (!query) return { traces: [], total: 0, truncated: false };
  const json = await obsClient.post<{ traces?: ObsTraceInfo[]; total?: number }>(TRACES_QUERY_PATH, query);
  const raw = json?.traces ?? [];
  const traces = raw.map(toTraceRow).filter((t): t is TraceRow => t !== null);
  const total = Math.max(json?.total ?? 0, raw.length);
  return { traces, total, truncated: total >= TRACE_QUERY_LIMIT };
}

/** Every span of one trace, with attributes and the service that emitted it. */
export async function fetchTraceSpans(req: ComponentTracesRequest, traceId: string): Promise<SpanRow[]> {
  const query = await traceQuery(req, { includeAttributes: true });
  if (!query) return [];
  const json = await obsClient.post<{ spans?: ObsSpanInfo[] }>(spansQueryPath(traceId), query);
  return (json?.spans ?? []).map((s) => toSpanRow(traceId, s)).filter((s): s is SpanRow => s !== null);
}
