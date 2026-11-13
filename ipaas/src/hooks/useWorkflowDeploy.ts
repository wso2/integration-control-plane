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

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { fetchWorkflowDeploy } from '../api/workflowRuntime';
import type { WorkflowDeploy } from '../types/workflowRuntime';
import { invalidateEndpointSettings } from './useConsumers';

// A deploy takes from a few seconds to a minute or two; its status is one annotation read.
const DEPLOYING_POLL_MS = 3_000;

export const workflowDeployKey = (componentId: string, environment: string) => ['workflowDeploy', componentId, environment];

/** Starts polling a deploy a 202 answer carries, without waiting for the first read. */
export function trackWorkflowDeploy(qc: QueryClient, componentId: string, deploy: WorkflowDeploy): void {
  qc.setQueryData(workflowDeployKey(componentId, deploy.environment), deploy);
}

/**
 * Re-reads what a deploy or promote changed in the environment. A deploy that finishes within
 * its request calls it on success; one that runs after its request calls it once its status
 * leaves deploying. Invalidating is idempotent, so a second call only re-reads again.
 */
export function invalidateAfterDeploy(qc: QueryClient, componentId: string, environment: string): void {
  qc.invalidateQueries({ queryKey: ['deploymentStatus', componentId] });
  qc.invalidateQueries({ queryKey: ['executionConfigs', componentId] });
  qc.invalidateQueries({ queryKey: ['componentDeployment'] });
  qc.invalidateQueries({ queryKey: ['integrationLinks'] });
  qc.invalidateQueries({ queryKey: ['envEndpoints', componentId] });
  invalidateEndpointSettings(qc, componentId, environment);
}

/**
 * Reads the deploy, and re-reads the environment's deployment when this read finds the deploy
 * the previous one saw running has ended. It runs once per read of the query, however many
 * components show the deploy, so the refresh does too.
 */
async function readWorkflowDeploy(qc: QueryClient, componentId: string, environment: string): Promise<WorkflowDeploy> {
  const before = qc.getQueryData<WorkflowDeploy>(workflowDeployKey(componentId, environment));
  const after = await fetchWorkflowDeploy(componentId, environment);
  if (before?.state === 'deploying' && after.state !== 'deploying') invalidateAfterDeploy(qc, componentId, environment);
  return after;
}

/**
 * A workflow's deploy or promote to one environment, which the BFF runs after its request. It
 * polls while the deploy runs, and re-reads the environment's deployment once it ends. The
 * status lives on the integration, so a reload, or a teammate's console, sees a deploy in progress.
 *
 * isChecking is true until the first read lands: a deploy may already be running, so actions
 * that start one hold until then. isError is a read that failed, which the card reports with a
 * retry rather than reading as "nothing running".
 */
export function useWorkflowDeploy(componentId: string, environment: string, enabled = true) {
  const qc = useQueryClient();
  const active = enabled && !!componentId && !!environment;
  const query = useQuery({
    queryKey: workflowDeployKey(componentId, environment),
    queryFn: () => readWorkflowDeploy(qc, componentId, environment),
    enabled: active,
    // A card that is idle re-reads at most once per poll interval when the window regains focus.
    staleTime: DEPLOYING_POLL_MS,
    refetchInterval: (q) => (q.state.data?.state === 'deploying' ? DEPLOYING_POLL_MS : false),
  });
  const state = query.data?.state;
  return {
    deploy: query.data,
    isDeploying: state === 'deploying',
    isChecking: active && query.isPending,
    isError: active && query.isError && !query.data,
    refetch: query.refetch,
    failure: state === 'failed' ? query.data : undefined,
  };
}
