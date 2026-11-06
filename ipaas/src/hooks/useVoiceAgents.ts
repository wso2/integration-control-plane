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

import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query';
import { useComponents } from './useComponents';
import { deleteComponent, fetchComponents } from '../api/components';
import { checkNameAvailability } from '../api/prebuilt';
import { createVoiceAgentComponent, deployVoiceAgent, VOICE_AGENT_COMPONENT_TYPE } from '../api/voiceAgents';
import type { Component } from '../types/component';
import type { Project } from '../types/project';
import type { CreateVoiceAgentInput } from '../types/voiceAgent';
import { buildVoiceAgentDeployment, effectiveVoiceAgentHandler, linkedAgentHandlerOf, voiceTargetLabel } from '../utils/voiceAgent';

export interface VoiceAgentRow {
  component: Component;
  project: Project;
  /** The platform-hosted AI agent it speaks for; undefined for an externally hosted one. */
  targetAgent?: Component;
}

const isVoiceAgent = (c: Component): boolean => c.componentType === VOICE_AGENT_COMPONENT_TYPE && !c.deleting;

/**
 * Every voice agent in the given projects. Shares the per-project integration
 * lists' query keys, so the list is served from the same cache.
 */
export function useOrgVoiceAgents(orgHandler: string, projects: Project[]) {
  return useQueries({
    queries: projects.map((project) => ({
      queryKey: ['components', orgHandler, project.id],
      queryFn: () => fetchComponents(orgHandler, project.id),
      enabled: !!orgHandler,
    })),
    combine: (results) => ({
      rows: results.flatMap((r, i) => {
        const components = r.data ?? [];
        return components.filter(isVoiceAgent).map((component) => {
          const agentHandler = linkedAgentHandlerOf(component.labels);
          return { component, project: projects[i], targetAgent: agentHandler ? components.find((c) => c.handler === agentHandler) : undefined };
        });
      }),
      isLoading: results.some((r) => r.isLoading),
      isError: results.some((r) => r.isError),
      refetch: () => results.forEach((r) => r.refetch()),
    }),
  });
}

/**
 * Creates a voice agent and rolls it out. A deploy failure deletes the integration
 * it just created, so a failed attempt never leaves a voice agent with no image or
 * keys behind.
 */
export function useCreateVoiceAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orgHandler, projectId, settings }: CreateVoiceAgentInput): Promise<Component> => {
      const name = await checkNameAvailability(projectId, effectiveVoiceAgentHandler(settings));
      const labels = settings.targetMode === 'platform' && settings.targetAgentHandler ? [voiceTargetLabel(settings.targetAgentHandler)] : [];
      const component = await createVoiceAgentComponent({ projectId, name, displayName: settings.displayName.trim(), description: settings.description.trim(), labels });
      try {
        await deployVoiceAgent(component.id, buildVoiceAgentDeployment(settings));
      } catch (err) {
        try {
          await deleteComponent({ orgHandler, componentId: component.id, projectId });
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

/** The voice agent in the project that speaks for the given AI agent, if any; shares the integration list's cache. */
export function useLinkedVoiceAgent(orgHandler: string, projectId: string, agentHandler: string) {
  const { data, isLoading, isError } = useComponents(orgHandler, projectId);
  const voiceAgent = data?.find((c) => isVoiceAgent(c) && linkedAgentHandlerOf(c.labels) === agentHandler);
  return { voiceAgent, isLoading, isError };
}
