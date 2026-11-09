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

import { useMemo } from 'react';
import type { EnvEndpoint } from '../types/component';
import type { EndpointRef } from '../types/consumers';
import { aiGatewayAccessOf } from '../utils/mcpGateway';
import { useEndpointSecurities } from './useConsumers';

interface AiGatewayUrlsScope {
  projectId: string;
  componentId: string;
  envId: string;
  versionId: string;
}

export interface AiGatewayUrls {
  /** The endpoints the AI gateway fronts, by endpoint id, each with its public proxy URL ('' while the proxy has none). */
  urls: Record<string, string>;
  /** Some endpoint's security is still being read, so which ones the AI gateway fronts is not known yet. */
  pending: boolean;
}

/**
 * The endpoints Agent Manager's AI gateway fronts, by endpoint id, each with its public proxy URL ('' while the
 * proxy has none, such as before it is deployed). An endpoint left out is fronted by the API Platform.
 *
 * Read from each endpoint's security, which is how the BFF says the AI gateway fronts it, so the console never
 * keeps a rule of its own for which MCP servers that is. Only an MCP server can be fronted, so pass
 * `enabled: false` for any other component and no security is read.
 */
export function useAiGatewayUrls(endpoints: EnvEndpoint[], { projectId, componentId, envId, versionId }: AiGatewayUrlsScope, enabled: boolean): AiGatewayUrls {
  const refs = useMemo<EndpointRef[]>(
    () => (enabled ? endpoints.map((ep) => ({ projectName: projectId, componentName: componentId, environmentName: envId, endpointName: ep.id, deploymentTrackId: versionId })) : []),
    [enabled, endpoints, projectId, componentId, envId, versionId],
  );
  const securities = useEndpointSecurities(refs);
  const urls: Record<string, string> = {};
  refs.forEach((ref, i) => {
    const { data, error } = securities[i] ?? {};
    if (aiGatewayAccessOf(data, error)) urls[ref.endpointName] = data?.publicUrl ?? '';
  });
  return { urls, pending: securities.some((q) => q.isLoading) };
}
