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

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ensureWorkflowRuntime, fetchWorkflowRuntime } from '../api/workflowRuntime';
import type { WorkflowRuntimeStatus } from '../types/workflowRuntime';

const KEY = ['workflow-runtime'];
const PREPARING_POLL_MS = 15_000;

// Provisioning takes minutes; poll only while the runtime is on its way.
const PREPARING: readonly WorkflowRuntimeStatus[] = ['NOT_PROVISIONED', 'PROVISIONING'];

export function useWorkflowRuntime(enabled = true) {
  return useQuery({
    queryKey: KEY,
    queryFn: fetchWorkflowRuntime,
    enabled,
    refetchInterval: (query) => (query.state.data && PREPARING.includes(query.state.data.status) ? PREPARING_POLL_MS : false),
  });
}

export function useEnsureWorkflowRuntime() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ensureWorkflowRuntime,
    onSuccess: (runtime) => qc.setQueryData(KEY, runtime),
  });
}
