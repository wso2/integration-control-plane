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
 * AI agent execution traces. The BFF passes agent-manager-observer's bodies
 * through unchanged, so these mirror that service's OpenAPI document. A field
 * is optional here wherever a trace's instrumentation may not have emitted it.
 */

export interface TokenUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

/** The observer reports a trace as ok or error; an unfinished trace has neither. */
export type TraceStatus = 'ok' | 'error' | 'unset';

export interface TraceOverview {
  traceId: string;
  rootSpanId: string;
  rootSpanName: string;
  /** Semantic span type the observer derived: llm, tool, agent, chain, … */
  rootSpanKind: string;
  startTime: string;
  endTime: string;
  durationInNanos: number;
  spanCount: number;
  tokenUsage?: TokenUsage;
  status?: TraceStatus;
  /** As emitted: a string, an object or an array. */
  input?: unknown;
  output?: unknown;
  models?: string[];
  conversationId?: string;
  tools?: string[];
  failedTools?: string[];
  mcpServers?: string[];
}

export interface TraceListResponse {
  traces: TraceOverview[];
  totalCount: number;
  /** How far back the observer examined, for display only. Never page with it. */
  lookedBackTo: string;
  /** True when the observer stopped before the window ran out. */
  truncated: boolean;
  /** Pass as `cursor` for the next page, with the same window and sort order. */
  nextCursor?: string;
}

export interface SpanSummary {
  spanId: string;
  spanName: string;
  parentSpanId?: string | null;
  startTime: string;
  endTime: string;
  durationNs: number;
  error?: boolean;
  statusMessage?: string | null;
}

export interface SpanListResponse {
  spans: SpanSummary[];
  totalCount: number;
}

export interface SpanDetail extends SpanSummary {
  kind?: string;
  attributes?: Record<string, unknown>;
  resourceAttributes?: Record<string, unknown>;
  ampAttributes?: Record<string, unknown>;
}

/** The window and paging a trace listing is made over. */
export interface TraceQuery {
  startTime: string;
  endTime: string;
  limit?: number;
  sortOrder?: 'asc' | 'desc';
  cursor?: string;
  /** Span-derived fields to fill; each costs the observer extra reads. */
  include?: Array<'models' | 'tools' | 'mcpServers'>;
}
