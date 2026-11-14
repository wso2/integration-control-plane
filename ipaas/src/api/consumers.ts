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

/**
 * Cloud API security & exposure, against the ipaas-service BFF. Org context comes
 * from the JWT, so no call takes an org parameter.
 */

import type { ApiExposure, ApiKeyAuthOptions, ApiKeyResult, ApiKeySummary, CreateApiKeyInput, EndpointPolicyConfig, EndpointRef, SecurityConfig } from '../types/consumers';
import type { McpTool } from '../types/mcp';
import { bff, bffAbsoluteUrl, items, q, seg, type ListResponse } from './_client';

/** List routes return a bare array; other BFF routes use `{ items: [] }`. Accept both. */
const asList = <T>(r: T[] | ListResponse<T> | null | undefined): T[] => (Array.isArray(r) ? r : items(r));

const endpointPath = ({ componentName, environmentName, endpointName }: EndpointRef): string => `/components/${seg(componentName)}/environments/${seg(environmentName)}/endpoints/${seg(endpointName)}`;

/** `path` under the endpoint, addressed to the API of the ref's deployment track. */
const endpointUrl = (ref: EndpointRef, path: string): string => `${endpointPath(ref)}${path}${q({ deploymentTrackId: ref.deploymentTrackId })}`;

// ---------------------------------------------------------------------------
// Exposure
// ---------------------------------------------------------------------------

export const exposeEndpoint = (ref: EndpointRef): Promise<ApiExposure> => bff.post<ApiExposure>(endpointUrl(ref, '/expose'));

export const unexposeEndpoint = (ref: EndpointRef): Promise<void> => bff.delete<void>(endpointUrl(ref, '/expose'));

// ---------------------------------------------------------------------------
// Endpoint security — API keys
// ---------------------------------------------------------------------------

export const listEndpointApiKeys = (ref: EndpointRef): Promise<ApiKeySummary[]> => bff.get<ApiKeySummary[] | ListResponse<ApiKeySummary>>(endpointUrl(ref, '/api-keys')).then(asList);

export const createEndpointApiKey = (ref: EndpointRef, input: CreateApiKeyInput): Promise<ApiKeyResult> => bff.post<ApiKeyResult>(endpointUrl(ref, '/api-keys'), input);

export const revokeEndpointApiKey = (ref: EndpointRef, keyName: string): Promise<void> => bff.delete<void>(endpointUrl(ref, `/api-keys/${seg(keyName)}`));

/**
 * One-click 1h credential. On the API Platform it is minted for an endpoint on API-key auth only: for another mode
 * ipaas-service refuses it (`API_KEY_AUTH_REQUIRED`, or `API_KEY_AUTH_NOT_ENFORCED` for API-key auth the gateway
 * doesn't enforce) rather than switch the endpoint, which only `setEndpointApiKeyAuth` does. For an MCP server on the
 * AI gateway it is an Agent Manager key, and only while the binding checks keys.
 */
export const createEndpointTestKey = (ref: EndpointRef): Promise<ApiKeyResult> => bff.post<ApiKeyResult>(`${endpointPath(ref)}/test-key${q({ deploymentTrackId: ref.deploymentTrackId, keepSecurity: true })}`);

// ---------------------------------------------------------------------------
// Endpoint security — enforcement policies
// ---------------------------------------------------------------------------

interface AuthToggleResponse {
  enabled?: boolean;
}

// A 200 with an empty body must not read as "toggle failed".
const toggled =
  (requested: boolean) =>
  (r: AuthToggleResponse | null | undefined): boolean =>
    r?.enabled ?? requested;

export const setEndpointApiKeyAuth = (ref: EndpointRef, enabled: boolean, options?: ApiKeyAuthOptions): Promise<boolean> => bff.put<AuthToggleResponse>(endpointUrl(ref, '/security/api-key'), { enabled, ...options }).then(toggled(enabled));

export const setEndpointJwtAuth = (ref: EndpointRef, enabled: boolean): Promise<boolean> => bff.put<AuthToggleResponse>(endpointUrl(ref, '/security/jwt'), { enabled }).then(toggled(enabled));

/** Read the single active auth mode (+ options) of the exposed API. */
export const getEndpointSecurity = (ref: EndpointRef): Promise<SecurityConfig> => bff.get<SecurityConfig>(endpointUrl(ref, '/security'));

/**
 * Where the Test page's MCP client connects for an MCP server on the AI gateway: ipaas-service relays each
 * request to the server with a key of its own, since the AI gateway answers no browser's CORS preflight.
 * Send with `bffFetch`, which carries the console's session.
 */
export const mcpRelayUrl = (ref: EndpointRef): string => bffAbsoluteUrl(endpointUrl(ref, '/mcp'));

/**
 * The tools an MCP server on the AI gateway exposes (`GET .../mcp-tools`), as Agent Manager listed them through
 * the gateway after the server's last deploy or refresh.
 */
export const getMcpServerTools = (ref: EndpointRef): Promise<McpTool[]> => bff.get<{ tools?: McpTool[] }>(endpointUrl(ref, '/mcp-tools')).then((r) => r?.tools ?? []);

/** Set the single active auth mode. The BFF clears the other mode + redeploys. */
export const setEndpointSecurity = (ref: EndpointRef, cfg: SecurityConfig): Promise<SecurityConfig> => bff.put<SecurityConfig>(endpointUrl(ref, '/security'), cfg);

// ---------------------------------------------------------------------------
// Endpoint policies — CORS and rate limiting, written independently of /security
// ---------------------------------------------------------------------------

export const getEndpointPolicies = (ref: EndpointRef): Promise<EndpointPolicyConfig> => bff.get<EndpointPolicyConfig>(endpointUrl(ref, '/policies'));

/** Replaces both policies and redeploys. */
export const setEndpointPolicies = (ref: EndpointRef, cfg: EndpointPolicyConfig): Promise<EndpointPolicyConfig> => bff.put<EndpointPolicyConfig>(endpointUrl(ref, '/policies'), cfg);
