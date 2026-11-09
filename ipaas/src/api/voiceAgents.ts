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

import { VOICE_AGENT_COMPONENT_TYPE } from '../constants/voiceAgent';
import type { Component } from '../types/component';
import type { VoiceAgentDeployment } from '../types/voiceAgent';
import { voiceAgentGetTokenUrl } from '../utils/voiceAgentConnect';
import { bff, seg } from './_client';

interface CreateVoiceAgentComponentInput {
  projectId: string;
  name: string;
  displayName: string;
  description: string;
  targetAgentHandler?: string;
}

export const createVoiceAgentComponent = (input: CreateVoiceAgentComponentInput): Promise<Component> =>
  bff.post<Component>(`/projects/${seg(input.projectId)}/components`, {
    metadata: {
      name: input.name,
      annotations: {
        'openchoreo.dev/display-name': input.displayName,
        'openchoreo.dev/description': input.description,
        'ipaas.wso2.com/component-type': VOICE_AGENT_COMPONENT_TYPE,
        ...(input.targetAgentHandler && { 'ipaas.wso2.com/voice-target-agent': input.targetAgentHandler }),
      },
    },
    spec: {
      owner: { projectName: input.projectId },
      componentType: { kind: 'ComponentType', name: 'deployment/service' },
      autoBuild: false,
      autoDeploy: false,
    },
  });

export const deployVoiceAgent = (componentName: string, deployment: VoiceAgentDeployment): Promise<{ environment: string; releaseName: string }> =>
  bff.post<{ environment: string; releaseName: string }>(`/components/${seg(componentName)}/deploy-voice-agent`, deployment);

export async function fetchVoiceAgentRoomToken(tokenServiceUrl: string, roomName: string, participantName: string): Promise<{ token: string; url: string }> {
  const params = new URLSearchParams({ roomName, participantName });
  const response = await fetch(`${voiceAgentGetTokenUrl(tokenServiceUrl)}?${params}`);
  if (!response.ok) throw new Error(`The token service answered ${response.status}.`);
  const body: { token?: unknown; url?: unknown } = await response.json();
  if (typeof body.token !== 'string' || typeof body.url !== 'string') throw new Error('The token service returned no room token.');
  return { token: body.token, url: body.url };
}
