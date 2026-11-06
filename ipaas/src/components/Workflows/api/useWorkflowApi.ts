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

import { useWorkflowConnection, type ReadyWorkflowConnection, type WorkflowConnection, type WorkflowTarget } from '../connection/useWorkflowConnection';
import type { WorkflowClient } from './client';

/** A client and the connection it is bound to; the client is null until the connection is ready. */
export type WorkflowApi = { client: WorkflowClient; connection: ReadyWorkflowConnection } | { client: null; connection: Exclude<WorkflowConnection, ReadyWorkflowConnection> };

/** What a view gets once the connection is ready, as the page shell hands it to its content. */
export type ReadyWorkflowApi = Extract<WorkflowApi, { client: WorkflowClient }>;

/**
 * The one hook a workflow view calls: resolves the connection and hands back a client bound to it,
 * or `null` while the connection is not ready. Callers gate on `connection.status` for the reason.
 */
export function useWorkflowApi(target: WorkflowTarget): WorkflowApi {
  const connection = useWorkflowConnection(target);
  return connection.status === 'ready' ? { client: connection.client, connection } : { client: null, connection };
}
