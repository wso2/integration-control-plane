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

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchExecutionConfigs, fetchTaskExecutions, fetchRuntimeArguments, fetchExecutionArguments, fetchExecutionLogs, fetchTaskExecutionCount, updateJobConfigs, stopSchedule, triggerTask, triggerComponentRun } from '../api/executions';
import type { StopScheduleInput, ExecutionLogWindow, UpdateJobConfigsInput, TriggerComponentInput, RuntimeArgument } from '../types/executions';
import type { TriggerTaskInput } from '../types/artifact';

export function useExecutionConfigs(componentId: string, releaseId: string, envId = '') {
  return useQuery({
    queryKey: ['executionConfigs', componentId, releaseId, envId],
    queryFn: () => fetchExecutionConfigs(componentId, releaseId, envId),
    enabled: !!componentId && !!envId && !!releaseId,
    retry: false,
  });
}

export function useTaskExecutions(releaseId: string, componentId = '', envId = '', projectId = '', refetchInterval: number | false = false) {
  return useQuery({
    queryKey: ['taskExecutions', releaseId, componentId, envId, projectId],
    queryFn: () => fetchTaskExecutions(releaseId, componentId, envId, projectId),
    enabled: !!componentId && !!envId,
    retry: false,
    staleTime: 0,
    placeholderData: keepPreviousData,
    refetchInterval,
  });
}

/**
 * The automation's runtime-argument schema, keyed by the deployed commit. An empty
 * array means "no declared args" — the Test page then shows a trigger-only form.
 * `retry: false` so a 404 (no schema for this component) surfaces promptly to the
 * caller, which treats it the same as an empty schema.
 */
export function useRuntimeArguments(componentId: string, deploymentTrackId: string, commitHash: string, enabled = true) {
  return useQuery<RuntimeArgument[]>({
    queryKey: ['runtimeArguments', componentId, deploymentTrackId, commitHash],
    queryFn: () => fetchRuntimeArguments(componentId, deploymentTrackId, commitHash),
    enabled: enabled && !!componentId && !!deploymentTrackId && !!commitHash,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });
}

export function useExecutionArguments(runId: string, componentId: string, releaseId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['executionArguments', runId, componentId, releaseId],
    queryFn: () => fetchExecutionArguments(runId, componentId, releaseId),
    enabled: enabled && !!runId && !!componentId && !!releaseId,
    retry: false,
    staleTime: 60000,
  });
}

// `run` bounds the query to the execution: the observability proxy filters logs by
// component and time, not by run. The run's completionTime is appended last so it
// participates in the cache key — a run still in flight refetches as it finishes —
// while leaving the leading key parts intact for callers that invalidate by prefix.
export function useExecutionLogs(componentId: string, deploymentTrackId: string, executionId: string, environmentId: string, enabled: boolean, run?: ExecutionLogWindow) {
  return useQuery({
    queryKey: ['executionLogs', componentId, deploymentTrackId, executionId, environmentId, run?.completionTime ?? ''],
    queryFn: () => fetchExecutionLogs(componentId, deploymentTrackId, executionId, environmentId, run),
    enabled: enabled && !!componentId && !!executionId && !!environmentId,
    retry: false,
    staleTime: 30000,
  });
}

// `enabled` lets a caller skip the count fetch entirely — a caller that already has
// the executions list derives its count from that instead.
export function useTaskExecutionCount(releaseId: string, componentId = '', envId = '', projectId = '', enabled = true) {
  return useQuery({
    queryKey: ['taskExecutionCount', releaseId, componentId, envId, projectId],
    queryFn: () => fetchTaskExecutionCount(releaseId, componentId, envId, projectId),
    enabled: enabled && !!componentId && !!envId,
    retry: false,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
}

export function useUpdateJobConfigs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateJobConfigsInput) => updateJobConfigs(input),
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: ['executionConfigs', input.componentId] });
    },
  });
}

export function useStopSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: StopScheduleInput) => stopSchedule(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['executionConfigs'] }),
  });
}

export function useTriggerTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TriggerTaskInput) => triggerTask(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['artifacts', 'Task'] });
    },
  });
}

export function useTriggerComponent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TriggerComponentInput) => triggerComponentRun(input),
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: ['taskExecutions', input.releaseId] });
    },
  });
}
