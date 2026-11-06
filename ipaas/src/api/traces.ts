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
 * AI agent execution traces, served by the BFF:
 *
 *   GET /components/{c}/environments/{e}/traces
 *   GET /components/{c}/environments/{e}/traces/{traceId}/spans
 *   GET /components/{c}/environments/{e}/traces/{traceId}/spans/{spanId}
 *
 * The path is the whole scope — the BFF fills in the organization, project and
 * agent — and the bodies come back as agent-manager-observer wrote them.
 */

import { bff, q, seg } from './_client';
import type { SpanDetail, SpanListResponse, TraceListResponse, TraceQuery } from '../types/traces';

const tracesBase = (componentId: string, envId: string): string => `/components/${seg(componentId)}/environments/${seg(envId)}/traces`;

/** `include` goes over the wire comma-separated. */
function traceParams(query: TraceQuery): string {
  return q({
    startTime: query.startTime,
    endTime: query.endTime,
    limit: query.limit,
    sortOrder: query.sortOrder,
    cursor: query.cursor,
    include: query.include?.join(','),
  });
}

export const fetchTraces = (componentId: string, envId: string, query: TraceQuery): Promise<TraceListResponse> =>
  bff.get<TraceListResponse>(`${tracesBase(componentId, envId)}${traceParams(query)}`);

/** Asks for the maximum page: a partial span list renders as orphaned branches. */
export const fetchTraceSpans = (componentId: string, envId: string, traceId: string, query: TraceQuery): Promise<SpanListResponse> =>
  bff.get<SpanListResponse>(`${tracesBase(componentId, envId)}/${seg(traceId)}/spans${traceParams({ ...query, limit: 1000, sortOrder: 'asc', cursor: undefined, include: undefined })}`);

/** The window is required: the BFF checks the span against a listing made over it. */
export const fetchSpanDetail = (componentId: string, envId: string, traceId: string, spanId: string, query: TraceQuery): Promise<SpanDetail> =>
  bff.get<SpanDetail>(`${tracesBase(componentId, envId)}/${seg(traceId)}/spans/${seg(spanId)}${q({ startTime: query.startTime, endTime: query.endTime })}`);
