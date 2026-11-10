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
import { useComponents, useOrgComponents } from './useComponents';
import { deleteComponent } from '../api/components';
import { checkNameAvailability } from '../api/prebuilt';
import { createVoiceAgentComponent, deployVoiceAgent } from '../api/voiceAgents';
import { VOICE_AGENT_COMPONENT_TYPE } from '../constants/voiceAgent';
import type { Component } from '../types/component';
import type { Project } from '../types/project';
import type { CreateVoiceAgentInput } from '../types/voiceAgent';
import { buildVoiceAgentDeployment, effectiveVoiceAgentHandler } from '../utils/voiceAgent';

export interface VoiceAgentRow {
  component: Component;
  project: Project;
  targetAgent?: Component;
}

const isVoiceAgent = (c: Component): boolean => c.componentType === VOICE_AGENT_COMPONENT_TYPE && !c.deleting;

export function useOrgVoiceAgents(orgHandler: string, projects: Project[]) {
  const { byProject, isLoading, isError, refetch } = useOrgComponents(
    orgHandler,
    projects.map((p) => p.id),
  );
  const rows = projects.flatMap((project) => {
    const components = byProject.get(project.id) ?? [];
    return components.filter(isVoiceAgent).map((component) => {
      const agentHandler = component.voiceTargetAgent;
      return { component, project, targetAgent: agentHandler ? components.find((c) => c.handler === agentHandler) : undefined };
    });
  });
  return { rows, isLoading, isError, refetch };
}

export function useCreateVoiceAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orgHandler, projectId, settings }: CreateVoiceAgentInput): Promise<Component> => {
      const name = await checkNameAvailability(projectId, effectiveVoiceAgentHandler(settings));
      const targetAgentHandler = settings.targetMode === 'platform' && settings.targetAgentHandler ? settings.targetAgentHandler : undefined;
      const component = await createVoiceAgentComponent({ projectId, name, displayName: settings.displayName.trim(), description: settings.description.trim(), targetAgentHandler });
      try {
        await deployVoiceAgent(component.id, buildVoiceAgentDeployment(settings));
      } catch (err) {
        try {
          const rollback = await deleteComponent({ orgHandler, componentId: component.id, projectId });
          if (!rollback.canDelete) console.error('Failed to remove the voice agent after its deploy failed', { componentId: component.id, projectId }, rollback.message);
        } catch (rollbackErr) {
          console.error('Failed to remove the voice agent after its deploy failed', { componentId: component.id, projectId }, rollbackErr);
        }
        throw err;
      }
      return component;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['components'] }),
  });
}

export function useLinkedVoiceAgents(orgHandler: string, projectId: string, agentHandler: string) {
  const { data, isLoading, isError, refetch } = useComponents(orgHandler, projectId);
  const voiceAgents = (data ?? []).filter((c) => isVoiceAgent(c) && c.voiceTargetAgent === agentHandler);
  return { voiceAgents, isLoading, isError, refetch };
}

export function voicedAgentHandlers(components: readonly Component[]): Set<string> {
  return new Set(components.flatMap((c) => (isVoiceAgent(c) && c.voiceTargetAgent ? [c.voiceTargetAgent] : [])));
}
