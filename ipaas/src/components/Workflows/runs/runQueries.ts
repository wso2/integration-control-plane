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

import type { QueryClient } from '@tanstack/react-query';
import { runScopedKeys, workflowKeys } from '../api/queryKeys';

/**
 * What a write to a run makes stale. A start, a lifecycle action and a reset all change which runs
 * a list holds or the status it shows them in, so every runs list of the connection is read again,
 * whatever its filters; an action or a reset also changes the run itself.
 */

/** Every runs list of the connection: `workflowKeys.instances` without its trailing filters. */
export function invalidateRunLists(queryClient: QueryClient, scopeId: string): void {
  void queryClient.invalidateQueries({ queryKey: workflowKeys.instances(scopeId).slice(0, -1) });
}

/** One run's own reads (its instance, history, activity tree, graph and reset points) and every runs list. */
export function invalidateRun(queryClient: QueryClient, scopeId: string, workflowId: string, runId?: string | null): void {
  runScopedKeys(scopeId, workflowId, runId).forEach((queryKey) => void queryClient.invalidateQueries({ queryKey }));
  invalidateRunLists(queryClient, scopeId);
}
