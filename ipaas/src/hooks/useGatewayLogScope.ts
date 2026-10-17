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
import { useComponentDeployments, useEnvEndpoints } from './useDeployments';
import { useEndpointSecurities } from './useConsumers';
import { endpointContextPath, gatewayFrontedEndpoints, gatewaySearchPhrases } from '../utils/gatewayLogs';
import type { ComponentDetail } from '../types/component';
import type { GatewayLogEndpoint } from '../types/logs';

/** What an integration needs before its gateway traffic can be read: the endpoints the gateway fronts, and their paths. */
export interface GatewayLogScope {
  endpoints: GatewayLogEndpoint[];
  /** Phrases that narrow the query to these endpoints — the only narrowing the log backend offers. */
  searchPhrases: string[];
  /** False when nothing is exposed through the gateway. */
  available: boolean;
  /** True while the lookups that decide `available` are still in flight. */
  resolving: boolean;
}

// An endpoint's path is the same in every environment, so its endpoints are read from the first one it is deployed in.
export function useGatewayLogScope(orgHandler: string, orgUuid: string, component: ComponentDetail | null | undefined, environmentIds: string[]): GatewayLogScope {
  const versionId = useMemo(() => {
    const versions = component?.apiVersions ?? [];
    return (versions.find((v) => v.latest) ?? versions[0])?.id ?? '';
  }, [component]);

  // The endpoint is the signal, not the type: wire type names differ from the console's vocabulary.
  const deployments = useComponentDeployments(orgHandler, orgUuid, component?.id ?? '', versionId, environmentIds);
  const deployedIndex = deployments.findIndex((q) => !!q.data?.releaseId);
  const environmentId = deployedIndex >= 0 ? environmentIds[deployedIndex] : '';
  const releaseId = deployedIndex >= 0 ? (deployments[deployedIndex].data?.releaseId ?? '') : '';
  const { data: envEndpoints = [], isLoading: loadingEndpoints } = useEnvEndpoints(component?.id ?? '', versionId, releaseId);

  const fronted = useMemo(() => gatewayFrontedEndpoints(envEndpoints), [envEndpoints]);
  const refs = useMemo(() => (component ? fronted.map((e) => ({ projectName: component.projectId, componentName: component.id, environmentName: environmentId, endpointName: e.id })) : []), [component, fronted, environmentId]);
  const securities = useEndpointSecurities(refs);
  const publicUrlsKey = securities.map((q) => q.data?.publicUrl ?? '').join('|');

  // An API exposed through the platform gateway has no external URL on the release, only the security publicUrl.
  const endpoints = useMemo<GatewayLogEndpoint[]>(
    () => fronted.map((e, i) => ({ id: e.id, displayName: e.displayName || e.id, contextPath: endpointContextPath(e.apiContext, securities[i]?.data?.publicUrl || e.publicUrl) })).filter((e) => e.contextPath !== ''),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fronted, publicUrlsKey],
  );
  const searchPhrases = useMemo(() => gatewaySearchPhrases(endpoints.map((e) => e.contextPath)), [endpoints]);

  const resolving = deployments.some((q) => q.isLoading) || loadingEndpoints || securities.some((q) => q.isLoading);

  return { endpoints, searchPhrases, available: searchPhrases.length > 0, resolving };
}
