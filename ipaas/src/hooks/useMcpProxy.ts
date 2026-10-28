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

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { generateMcpFeatures, createMcpApi } from '../api/mcpProxy';
import { deleteApimApi } from '../api/apim';
import { createMcpProxyComponent } from '../api/components';
import type { Component } from '../types/component';
import type { McpProxyMetadata } from '../types/mcpProxy';

interface CreateMcpProxyParams {
  orgHandler: string;
  projectId: string;
  /** Component + API handle/name. */
  name: string;
  displayName: string;
  description: string;
  /** API base path / context. */
  context: string;
  /** API version (e.g. "1.0.0"). */
  version: string;
  /** Backend endpoint the MCP API fronts. */
  endpoint: string;
  /** Subscription policies (e.g. ["Bronze"]). */
  policies: string[];
  /** Source-API operations the user selected, as MCP tool features. */
  selectedOperations: McpProxyMetadata[];
}

/**
 * Creates an MCP proxy from an existing HTTP API, running devant's exact
 * sequence against the shared backend:
 *   1. `generate-mcp-features` — selected operations → MCP tools
 *   2. `POST /apis` — create the APIM API (`type: MCP`)
 *   3. `createComponent` — the proxy component referencing the API by `apiId`
 *
 * (Deploying the proxy via the proxy-deployer is a follow-up step.)
 */
export function useCreateMcpProxy() {
  const queryClient = useQueryClient();
  return useMutation<Component, unknown, CreateMcpProxyParams>({
    mutationFn: async ({ orgHandler, projectId, name, displayName, description, context, version, endpoint, policies, selectedOperations }) => {
      const operations = await generateMcpFeatures(selectedOperations);
      const api = await createMcpApi({ name, displayName, version, description, context, policies, operations, endpoint, projectId });
      try {
        return await createMcpProxyComponent({ name, displayName, description, orgHandler, projectId, apiId: api.id, version: api.version });
      } catch (err) {
        // Component creation failed after the API was created — clean up the
        // orphaned APIM API so a retry isn't blocked by a name/context clash.
        await deleteApimApi(api.id).catch(() => {});
        throw err;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['components'] });
    },
  });
}
