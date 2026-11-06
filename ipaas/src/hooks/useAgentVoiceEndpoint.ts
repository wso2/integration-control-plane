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

import type { Component } from '../types/component';
import type { Environment } from '../types/environment';
import { agentVoiceWsUrl } from '../utils/voiceAgent';
import { useComponentDeployment, useEnvEndpoints } from './useDeployments';
import { useEnvironments } from './useEnvironments';
import { useOrgUuid } from './useOrgUuid';
import { useSelectedTrack } from './useSelectedTrack';

export type AgentVoiceEndpointState =
  | { status: 'loading' }
  | { status: 'no-environment' }
  | { status: 'not-deployed'; env: Environment }
  | { status: 'no-endpoint'; env: Environment }
  | { status: 'ready'; env: Environment; url: string };

export function useAgentVoiceEndpoint(orgHandler: string, projectId: string, agent: Component | undefined): AgentVoiceEndpointState {
  const orgUuid = useOrgUuid() ?? '';
  const { data: environments = [], isLoading: loadingEnvs } = useEnvironments(orgHandler, projectId);
  const env = environments.find((e) => !e.critical) ?? environments[0];
  const { trackId } = useSelectedTrack(agent);
  const { data: deployment, isLoading: loadingDeployment } = useComponentDeployment(orgHandler, orgUuid, agent?.id ?? '', trackId, env?.id ?? '');
  const releaseId = deployment?.releaseId ?? '';
  const { data: endpoints, isLoading: loadingEndpoints } = useEnvEndpoints(agent?.id ?? '', trackId, releaseId);

  if (!agent || loadingEnvs || loadingDeployment || (releaseId && loadingEndpoints)) return { status: 'loading' };
  if (!env) return { status: 'no-environment' };
  if (!releaseId) return { status: 'not-deployed', env };
  const url = agentVoiceWsUrl(endpoints);
  return url ? { status: 'ready', env, url } : { status: 'no-endpoint', env };
}
