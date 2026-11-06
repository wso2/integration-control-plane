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

import { skipToken, useIsFetching, useQuery } from '@tanstack/react-query';
import { fetchComponentTraces, fetchTraceSpans } from '../api/integrationTraces';
import { SPAN_FETCH_CONCURRENCY, SPAN_SAMPLE_TRACES } from '../constants/integrationTraces';
import { mapWithConcurrency } from '../utils/integrationTraces';
import type { ComponentTracesRequest, SpanRow, TracePage, TraceRow } from '../types/integrationTraces';

const ROOT_KEY = 'integration-traces';

/**
 * Keeps the shown data while the same integration and environment refresh. Another
 * integration's or environment's traces would read as this one's, so a switch shows
 * the skeleton instead. Both query keys carry the request third.
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

export interface SampledSpans {
  spans: SpanRow[];
  /** Traces whose spans were read. */
  sampled: number;
  /** Sampled traces whose span query failed; their spans are missing from `spans`. */
  failed: number;
}

/**
 * Spans of the newest SPAN_SAMPLE_TRACES traces. The observer lists traces without
 * the services they passed through, so the per-service views are built from these.
 * Fails only when every span query does; otherwise the gap is reported in `failed`.
 */
export function useSampledTraceSpans(req: ComponentTracesRequest | null, traces: TraceRow[] | undefined) {
  const traceIds = (traces ?? []).slice(0, SPAN_SAMPLE_TRACES).map((t) => t.traceId);
  return useQuery({
    queryKey: [ROOT_KEY, 'sampled-spans', req, traceIds],
    queryFn:
      req && traceIds.length > 0
        ? async (): Promise<SampledSpans> => {
            const results = await mapWithConcurrency(traceIds, SPAN_FETCH_CONCURRENCY, (id) => fetchTraceSpans(req, id));
            const spans = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
            const failed = results.filter((r) => r.status === 'rejected').length;
            if (failed === results.length) {
              throw results.find((r): r is PromiseRejectedResult => r.status === 'rejected')?.reason ?? new Error('Could not read any trace spans.');
            }
            return { spans, sampled: traceIds.length, failed };
          }
        : skipToken,
    retry: false,
    placeholderData: sameScope<SampledSpans>(req),
  });
}
