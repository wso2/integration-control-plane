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

import type { EnvEndpoint } from '../types/component';
import type { AiGatewayBinding, SecurityConfig } from '../types/consumers';
import { httpCodeOf, httpStatusOf } from './apiErrors';

/** An MCP server endpoint on Agent Manager's AI gateway, or not published there yet (`binding: null`). */
export interface AiGatewayAccess {
  binding: AiGatewayBinding | null;
}

/** The BFF's answer for an AI-gateway MCP server endpoint with no binding in the environment. */
const NOT_PUBLISHED = 'MCP_PROXY_NOT_PUBLISHED';

/**
 * Whether the AI gateway fronts the endpoint, read from its security config or from the refusal that says it is
 * not published yet. `null` means the API Platform fronts it, as every other endpoint and an MCP proxy.
 */
export function aiGatewayAccessOf(security: SecurityConfig | undefined, securityError: unknown): AiGatewayAccess | null {
  if (security?.aiGateway) return { binding: security.aiGateway };
  if (httpStatusOf(securityError) === 409 && httpCodeOf(securityError) === NOT_PUBLISHED) return { binding: null };
  return null;
}

/**
 * The URL an MCP client connects to. The AI gateway's URL already ends in the MCP path; the API Platform's
 * is the API's base, with the MCP path below it.
 */
export function mcpUrlOf(gatewayUrl: string, aiGateway: AiGatewayAccess | null): string {
  if (!gatewayUrl) return '';
  try {
    const url = new URL(gatewayUrl);
    url.pathname = url.pathname.replace(/\/+$/, '');
    if (!aiGateway) url.pathname += '/mcp';
    return url.toString();
  } catch {
    return '';
  }
}

/** Adds the Streamable HTTP selector without corrupting an existing query string. */
export function mcpTransportUrlOf(mcpUrl: string): URL {
  const url = new URL(mcpUrl);
  url.searchParams.set('transportType', 'streamable-http');
  return url;
}

/**
 * The endpoints an MCP server's Test page offers: those with a public URL, or every endpoint when none has
 * one. An MCP server on the AI gateway is never exposed on the API Platform, so its endpoints carry no
 * public URL; offering them lets the page test it through ipaas-service's relay instead of finding nothing.
 */
export function mcpTestEndpoints(endpoints: EnvEndpoint[]): EnvEndpoint[] {
  const routed = endpoints.filter((e) => e.publicUrl);
  return routed.length ? routed : endpoints;
}
