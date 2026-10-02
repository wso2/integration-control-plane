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

import { getOrgUuidFromToken } from '#auth';
import { apimClient } from './httpClients';
import type { CreateMcpApiInput, CreatedMcpApi, McpFeatureOperation, McpProxyMetadata } from '../../types/mcpProxy';

/**
 * The MCP "convert from existing HTTP API" backend flow — identical to devant
 * (same backend): generate tool features from the chosen operations, then create
 * an APIM API of `type: MCP`. (The proxy component itself is created via the
 * GraphQL `createComponent` mutation in `components.ts`.)
 */

/** CORS config applied to MCP APIs — verbatim from devant. */
const MCP_CORS_CONFIGURATION = {
  corsConfigurationEnabled: true,
  accessControlAllowOrigins: ['*'],
  accessControlAllowCredentials: false,
  accessControlAllowHeaders: ['authorization', 'Access-Control-Allow-Origin', 'Content-Type', 'SOAPAction', 'apikey', 'API-Key', 'testKey', 'Mcp-Protocol-Version'],
  accessControlAllowMethods: ['GET', 'PUT', 'POST', 'DELETE', 'PATCH', 'OPTIONS'],
  corsOverrideEnabled: true,
};

/**
 * Turn selected source-API operations into MCP tool features.
 * `POST /api/am/publisher/v2/apis/generate-mcp-features`.
 */
export async function generateMcpFeatures(items: McpProxyMetadata[]): Promise<McpFeatureOperation[]> {
  const orgUuid = getOrgUuidFromToken();
  const params = new URLSearchParams({ organizationId: orgUuid ?? '', isBackendAPI: 'false' });
  return (await apimClient.post<McpFeatureOperation[]>(`/api/am/publisher/v2/apis/generate-mcp-features?${params.toString()}`, items)) ?? [];
}

/**
 * Create the MCP API in APIM. `POST /api/am/publisher/v2/apis` with
 * `type: 'MCP'`, the generated operations, MCP CORS, and a fixed backend
 * endpoint — exactly as devant builds it.
 */
export async function createMcpApi(input: CreateMcpApiInput): Promise<CreatedMcpApi> {
  const orgUuid = getOrgUuidFromToken();
  const params = new URLSearchParams({ organizationId: orgUuid ?? '' });
  const payload = {
    name: input.name,
    displayName: input.displayName,
    version: input.version,
    description: input.description,
    context: input.context,
    policies: input.policies,
    visibility: 'PRIVATE',
    type: 'MCP',
    operations: input.operations,
    endpointConfig: {
      endpoint_type: 'http',
      production_endpoints: { url: input.endpoint },
      sandbox_endpoints: { url: input.endpoint },
    },
    corsConfiguration: MCP_CORS_CONFIGURATION,
    additionalProperties: [{ name: 'projectId', value: input.projectId, display: true }],
  };
  return apimClient.post<CreatedMcpApi>(`/api/am/publisher/v2/apis?${params.toString()}`, payload);
}
