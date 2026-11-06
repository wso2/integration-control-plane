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

/** Traces of one integration in one environment over a time window. */
export interface ComponentTracesRequest {
  componentId: string;
  environmentId: string;
  startTime: string;
  endTime: string;
}

/** Summary of one trace, as the observer lists it. */
export interface TraceRow {
  traceId: string;
  /** Name of the trace's root span, e.g. "get /greeting". */
  name: string;
  spanCount: number;
  startTime: string;
  endTime: string;
  durationMs: number;
  hasErrors: boolean;
}

export interface TracePage {
  traces: TraceRow[];
  /** Matching traces in the window; the observer stops counting at its query limit. */
  total: number;
  /** True when the window holds more traces than the observer returns, so totals are lower bounds. */
  truncated: boolean;
}

export type SpanStatus = 'ok' | 'error' | 'unset';

export interface SpanRow {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: string;
  startTime: string;
  endTime: string;
  durationMs: number;
  status: SpanStatus;
  statusMessage?: string;
  /** The span's service.name: for a Ballerina integration, the base path of the Ballerina service. */
  serviceName: string;
  attributes: Record<string, string>;
}

/** Headline numbers for a window. When the window was truncated they are lower bounds. */
export interface TraceStats {
  traces: number;
  errorTraces: number;
  /** Share of listed traces with an error, 0 to 1. */
  errorRate: number;
  spans: number;
  lowerBound: boolean;
}

/** One chart series: `key` is the data key in each point, `service` the name shown. */
export interface ServiceSeries {
  key: string;
  service: string;
}

/** One time bucket: `label` for the axis, then a span count under each series key. */
export interface ServiceSpanPoint {
  label: string;
  [seriesKey: string]: string | number;
}

export interface ServiceSpanSeries {
  points: ServiceSpanPoint[];
  series: ServiceSeries[];
}

/** One service's share of the sampled traces. */
export interface ServiceTraceSummary {
  service: string;
  traces: number;
  errorTraces: number;
  avgDurationMs: number;
  p95DurationMs: number;
}

/** A trace a service took part in, with the operation it entered the service through. */
export interface ServiceTrace {
  trace: TraceRow;
  /** Every sampled span of the trace, from all services. */
  spans: SpanRow[];
  /** Name of the service's entry span in the trace, e.g. "post /albums". */
  operation: string;
  /** The entry span's http.status_code, when it has one. */
  httpStatus?: string;
}

/** One span in a trace's waterfall. `offset` and `width` are fractions of the trace's duration. */
export interface WaterfallRow {
  span: SpanRow;
  depth: number;
  offset: number;
  width: number;
}
