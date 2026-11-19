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

import { skipToken, useIsFetching, useQueries, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { fetchComponentTraces, fetchTraceSpans } from '../api/integrationTraces';
import type { ComponentTracesRequest, SpanRow, TracePage, TraceRow } from '../types/integrationTraces';

const ROOT_KEY = 'integration-traces';

/**
 * Keeps the shown data while the same integration and environment refresh. Another
 * integration's or environment's traces would read as this one's, so a switch shows
 * the skeleton instead. The list's query key carries the request third.
 */
function sameScope<T>(req: ComponentTracesRequest | null) {
  return (prev: T | undefined, prevQuery?: { queryKey: readonly unknown[] }): T | undefined => {
    const prevReq = prevQuery?.queryKey[2] as ComponentTracesRequest | null | undefined;
    return prevReq?.componentId === req?.componentId && prevReq?.environmentId === req?.environmentId ? prev : undefined;
  };
}

export function useComponentTraces(req: ComponentTracesRequest | null) {
  return useQuery({
    queryKey: [ROOT_KEY, 'list', req],
    queryFn: req ? () => fetchComponentTraces(req) : skipToken,
    retry: false,
    placeholderData: sameScope<TracePage>(req),
  });
}

/** True while any trace or span query is in flight, for a refresh indicator outside the components that run them. */
export const useTracesFetching = (): boolean => useIsFetching({ queryKey: [ROOT_KEY] }) > 0;

export interface TraceSpans {
  spans: SpanRow[];
  /** Traces whose spans have been read. */
  read: number;
  /** Traces whose span query failed; their spans are missing from `spans`. */
  failed: number;
  /** Traces whose spans are still loading. */
  pending: number;
  /** Retries the span queries that failed. */
  retryFailed: () => void;
}

// Module scope keeps it stable, so useQueries returns the same object until a span query changes.
export function combineTraceSpans(results: UseQueryResult<SpanRow[]>[]): TraceSpans {
  const failedQueries = results.filter((r) => r.isError);
  return {
    spans: results.flatMap((r) => r.data ?? []),
    read: results.filter((r) => r.isSuccess).length,
    failed: failedQueries.length,
    pending: results.filter((r) => r.isPending).length,
    retryFailed: () => failedQueries.forEach((r) => void r.refetch()),
  };
}

/**
 * Spans of every listed trace, one query per trace. The observer lists traces without the
 * services they passed through, so the per-service counts need each trace's spans.
 * - The key leaves out the time window, so a Refresh reads only new traces, and those whose
 *   span count grew since they were read.
 * - A query that leaves the list (a new window, environment or page) aborts its request.
 */
export function useTraceSpans(req: ComponentTracesRequest | null, traces: TraceRow[] | undefined): TraceSpans {
  return useQueries({
    queries: req
      ? (traces ?? []).map((t) => ({
          queryKey: [ROOT_KEY, 'spans', req.componentId, req.environmentId, t.traceId, t.spanCount],
          queryFn: ({ signal }: { signal: AbortSignal }) => fetchTraceSpans(req, t.traceId, signal),
          staleTime: Infinity,
          retry: 1,
        }))
      : [],
    combine: combineTraceSpans,
  });
}
