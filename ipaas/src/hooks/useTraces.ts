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

import { useQuery } from '@tanstack/react-query';
import { fetchSpanDetail, fetchTraceSpans, fetchTraces } from '../api/traces';
import type { SpanDetail, SpanListResponse, TraceListResponse, TraceQuery } from '../types/traces';

/**
 * Everything a trace listing is scoped to, as one key segment. The cursor is
 * kept out of it so paging can be told apart from a change of integration,
 * environment or window — only the former may keep the previous page on screen.
 */
function traceScopeId(componentId: string, envId: string, query: TraceQuery): string {
  return JSON.stringify([componentId, envId, query.startTime, query.endTime, query.sortOrder ?? '', query.limit ?? 0, query.include?.join(',') ?? '']);
}

export function useTraces(componentId: string, envId: string, query: TraceQuery) {
  const scopeId = traceScopeId(componentId, envId, query);

  return useQuery<TraceListResponse>({
    queryKey: ['agentTraces', scopeId, query.cursor ?? ''],
    queryFn: () => fetchTraces(componentId, envId, query),
    enabled: !!componentId && !!envId && !!query.startTime && !!query.endTime,
    // Paging keeps the current page on screen rather than collapsing to a
    // skeleton; any other change must not show one scope's traces under another.
    placeholderData: (previous, previousQuery) => (previousQuery?.queryKey[1] === scopeId ? previous : undefined),
    retry: false,
  });
}

export function useTraceSpans(componentId: string, envId: string, traceId: string, query: TraceQuery) {
  return useQuery<SpanListResponse>({
    queryKey: ['agentTraceSpans', componentId, envId, traceId, query.startTime, query.endTime],
    queryFn: () => fetchTraceSpans(componentId, envId, traceId, query),
    enabled: !!componentId && !!envId && !!traceId && !!query.startTime && !!query.endTime,
    retry: false,
  });
}

export function useSpanDetail(componentId: string, envId: string, traceId: string, spanId: string, query: TraceQuery) {
  return useQuery<SpanDetail>({
    queryKey: ['agentSpanDetail', componentId, envId, traceId, spanId, query.startTime, query.endTime],
    queryFn: () => fetchSpanDetail(componentId, envId, traceId, spanId, query),
    enabled: !!componentId && !!envId && !!traceId && !!spanId && !!query.startTime && !!query.endTime,
    retry: false,
    // A span's attributes never change once written.
    staleTime: Infinity,
  });
}
