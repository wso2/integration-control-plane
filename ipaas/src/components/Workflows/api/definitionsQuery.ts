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

import type { WorkflowClient } from './client';
import { retryWorkflowRead } from './http';
import { workflowKeys } from './queryKeys';

/**
 * The read of an integration's workflow definitions, shared by every view that lists them and by the
 * connection, which starts it alongside its probe. Definitions change with a deploy, which is a new
 * scope, so a read minutes old still serves a view that mounts.
 */
export const definitionsQuery = (client: Pick<WorkflowClient, 'definitions'>, scopeId: string) => ({
  queryKey: workflowKeys.definitions(scopeId),
  queryFn: () => client.definitions.list(),
  staleTime: 5 * 60_000,
  retry: retryWorkflowRead,
});
