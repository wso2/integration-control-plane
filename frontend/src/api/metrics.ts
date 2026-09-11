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
import { useRef } from 'react';
import { observabilityMetricsApiUrl, observabilityWorkflowMetricsApiUrl } from '../paths';
import { authenticatedFetch } from '../auth/tokenManager';
import { gql } from './graphql';

export interface MetricsRequest {
  componentId?: string;
  environmentId: string;
  startTime: string;
  endTime: string;
  resolutionInterval: string;
}

export interface TimeSeriesData {
  name: string;
  timeSeriesData: Record<string, number>;
}

export interface MetricEntry {
  tags: Record<string, string>;
  requests_total: TimeSeriesData;
  response_time_seconds_avg: TimeSeriesData;
  response_time_seconds_min: TimeSeriesData;
  response_time_seconds_max: TimeSeriesData;
  response_time_seconds_percentile_33: TimeSeriesData;
  response_time_seconds_percentile_50: TimeSeriesData;
  response_time_seconds_percentile_66: TimeSeriesData;
  response_time_seconds_percentile_95: TimeSeriesData;
  response_time_seconds_percentile_99: TimeSeriesData;
}

export interface MetricsResponse {
  inboundMetrics: MetricEntry[];
  outboundMetrics: MetricEntry[];
}

// ── Workflow metrics ──
// One record per workflow event from the Ballerina workflow module; the server groups them into series by tags.

export type WorkflowSample =
  | 'workflow.started'
  | 'workflow.closed'
  | 'activity.executed'
  | 'data.sent'
  | 'task.decided'
  | 'workflow.suspended'
  | 'workflow.resumed'
  | 'workflow.terminated'
  | 'workflow.cancelled'
  | 'agent.model_called'
  | 'agent.tool_called'
  | 'agent.event_received'
  | 'agent.slept'
  | 'agent.task_awaited'
  | 'agent.tool_reviewed';

export interface WorkflowMetricEntry {
  sample: WorkflowSample;
  // Whichever tags the sample carries: workflow_type, activity_type, outcome, task_kind, task_name, action, data_name.
  tags: Record<string, string>;
  count: TimeSeriesData;
  duration_seconds_avg: TimeSeriesData;
  duration_seconds_max: TimeSeriesData;
  duration_seconds_percentile_50: TimeSeriesData;
  duration_seconds_percentile_95: TimeSeriesData;
  duration_seconds_percentile_99: TimeSeriesData;
}

export interface WorkflowMetricsResponse {
  runs: WorkflowMetricEntry[];
  activities: WorkflowMetricEntry[];
  decisions: WorkflowMetricEntry[];
  dataEvents: WorkflowMetricEntry[];
  // The AI agent's steps (agent.*) and the management control operations (workflow.suspended, …).
  agentSteps?: WorkflowMetricEntry[];
  controls?: WorkflowMetricEntry[];
}

async function fetchMetrics(req: MetricsRequest): Promise<MetricsResponse> {
  // Add timeout to fail fast when observability service is unavailable
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

  try {
    const res = await authenticatedFetch(observabilityMetricsApiUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      const text = await res.text();
      let errorMessage = text;
      try {
        const errorJson = JSON.parse(text);
        errorMessage = errorJson.message || text;
      } catch {
        // If JSON parsing fails, use the raw text
      }
      const error = new Error(errorMessage);
      (error as any).status = res.status;
      throw error;
    }
    const json: MetricsResponse = await res.json();
    return json;
  } catch (error) {
    clearTimeout(timeoutId);
    // Handle abort/timeout errors
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Observability service is unavailable. Request timed out.');
    }
    throw error;
  }
}

async function fetchWorkflowMetrics(req: MetricsRequest): Promise<WorkflowMetricsResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await authenticatedFetch(observabilityWorkflowMetricsApiUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text();
      let errorMessage = text;
      try {
        errorMessage = JSON.parse(text).message || text;
      } catch {
        // raw text it is
      }
      const error: Error & { status?: number } = new Error(errorMessage);
      error.status = res.status;
      throw error;
    }
    // The timeout stays armed until the body is consumed: a response whose headers
    // arrive but whose body stalls must still abort.
    return (await res.json()) as WorkflowMetricsResponse;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Observability service is unavailable. Request timed out.');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Workflow counterpart of useMetrics; refreshKey re-keys the query so the page's Refresh refetches this too.
export function useWorkflowMetrics(req: MetricsRequest | null, getTimeRange?: () => { startTime: string; endTime: string }, refreshKey = 0) {
  const getTimeRangeRef = useRef(getTimeRange);
  getTimeRangeRef.current = getTimeRange;

  return useQuery<WorkflowMetricsResponse>({
    queryKey: ['workflow-metrics', req, refreshKey],
    queryFn: () => {
      const baseReq = getTimeRangeRef.current ? { ...req!, ...getTimeRangeRef.current() } : req!;
      return fetchWorkflowMetrics(baseReq);
    },
    enabled: !!req,
    refetchInterval: false,
    retry: false,
    staleTime: 0,
  });
}

// ── OpenSearch observability metrics availability ──

// Whether the OpenSearch-backed observability metrics backend is configured and
// reachable. The metrics landing page uses this to choose the default provider:
// when OpenSearch is unavailable it defaults to Moesif and shows OpenSearch as
// the secondary option.
export interface ObservabilityMetricsConfigStatus {
  configured: boolean;
}

const OBSERVABILITY_METRICS_CONFIG_QUERY = `
  query ObservabilityMetricsConfig {
    observabilityMetricsConfig {
      configured
    }
  }`;

// Reads whether OpenSearch observability metrics are configured/available.
export function useObservabilityMetricsConfig() {
  return useQuery<ObservabilityMetricsConfigStatus>({
    queryKey: ['observability-metrics-config'],
    queryFn: () => gql<{ observabilityMetricsConfig: ObservabilityMetricsConfigStatus }>(OBSERVABILITY_METRICS_CONFIG_QUERY).then((d) => d.observabilityMetricsConfig),
    staleTime: 5 * 60_000,
  });
}

export function useMetrics(req: MetricsRequest | null, getTimeRange?: () => { startTime: string; endTime: string }) {
  const getTimeRangeRef = useRef(getTimeRange);
  getTimeRangeRef.current = getTimeRange;

  return useQuery<MetricsResponse>({
    queryKey: ['metrics', req],
    queryFn: () => {
      const baseReq = getTimeRangeRef.current ? { ...req!, ...getTimeRangeRef.current() } : req!;
      return fetchMetrics(baseReq);
    },
    enabled: !!req,
    refetchInterval: false,
    retry: false, // Disable retries for faster failure when observability service is unavailable
    staleTime: 0, // Always fetch fresh data
  });
}
