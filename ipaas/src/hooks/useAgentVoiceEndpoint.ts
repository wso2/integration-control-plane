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

import { skipToken, useQuery } from '@tanstack/react-query';
import { fetchComponentDeployment, fetchEnvEndpoints } from '../api/deployments';
import type { Component } from '../types/component';
import type { Environment } from '../types/environment';
import { agentVoiceWsUrl, voiceAgentEnvironment } from '../utils/voiceAgent';
import { useEnvironments } from './useEnvironments';
import { useOrgUuid } from './useOrgUuid';
import { useSelectedTrack } from './useSelectedTrack';

export type AgentVoiceEndpointState =
  | { status: 'loading' }
  | { status: 'error'; retry: () => void }
  | { status: 'no-environment' }
  | { status: 'not-deployed'; env: Environment }
  | { status: 'no-endpoint'; env: Environment }
  | { status: 'ready'; env: Environment; url: string };

type AgentDeployment = { deployed: false } | { deployed: true; url: string | null };

async function fetchAgentDeployment(orgHandler: string, orgUuid: string, agentId: string, trackId: string, envId: string): Promise<AgentDeployment> {
  const deployment = await fetchComponentDeployment(orgHandler, orgUuid, agentId, trackId, envId);
  if (!deployment?.releaseId) return { deployed: false };
  const endpoints = await fetchEnvEndpoints(agentId, trackId, deployment.releaseId);
  return { deployed: true, url: agentVoiceWsUrl(endpoints) };
}

export function useAgentVoiceEndpoint(orgHandler: string, projectId: string, agent: Component | undefined): AgentVoiceEndpointState {
  const orgUuid = useOrgUuid();
  const envQuery = useEnvironments(orgHandler, projectId);
  const env = envQuery.data && voiceAgentEnvironment(envQuery.data);
  const { trackId } = useSelectedTrack(agent);
  const deploymentQuery = useQuery({
    queryKey: ['agentVoiceEndpoint', orgHandler, orgUuid, agent?.id, trackId, env?.id],
    queryFn: orgUuid && agent && trackId && env ? () => fetchAgentDeployment(orgHandler, orgUuid, agent.id, trackId, env.id) : skipToken,
    staleTime: 30_000,
    retry: false,
  });

  if (envQuery.isError) return { status: 'error', retry: () => void envQuery.refetch() };
  if (deploymentQuery.isError) return { status: 'error', retry: () => void deploymentQuery.refetch() };
  if (!orgUuid || !agent || !envQuery.data) return { status: 'loading' };
  if (!env) return { status: 'no-environment' };
  if (!trackId) return { status: 'not-deployed', env };
  if (!deploymentQuery.data) return { status: 'loading' };
  if (!deploymentQuery.data.deployed) return { status: 'not-deployed', env };
  const { url } = deploymentQuery.data;
  return url ? { status: 'ready', env, url } : { status: 'no-endpoint', env };
}
