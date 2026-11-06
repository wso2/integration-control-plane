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

import { Button, Tooltip } from '@wso2/oxygen-ui';
import { CircleCheck, Mic } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';
import { useAppNavigate } from '../../../hooks/useAppNavigate';
import { useDeploymentStatus } from '../../../hooks/useDeployments';
import { useSelectedTrack } from '../../../hooks/useSelectedTrack';
import { useLinkedVoiceAgent } from '../../../hooks/useVoiceAgents';
import { useScope } from '../../../nav';
import { componentOverviewUrl, enableVoiceAgentUrl } from '../../../paths';
import type { Component } from '../../../types/component';

interface EnableVoiceAgentButtonProps {
  component: Component;
  orgHandler: string;
  projectId: string;
}

export default function EnableVoiceAgentButton({ component, orgHandler, projectId }: EnableVoiceAgentButtonProps): JSX.Element | null {
  const navigate = useAppNavigate();
  const scope = useScope();
  const { voiceAgent, isLoading, isError } = useLinkedVoiceAgent(orgHandler, projectId, component.handler);
  const { trackId } = useSelectedTrack(component);
  const { data: builds, isPending: loadingBuilds } = useDeploymentStatus(component.id, trackId);
  const latest = builds?.[0];

  if (scope.level !== 'components' || isLoading || isError) return null;
  const projectHandler = scope.project;

  if (voiceAgent) {
    return (
      <Button variant="text" size="small" startIcon={<CircleCheck size={16} />} onClick={() => navigate(componentOverviewUrl(orgHandler, projectHandler, voiceAgent.handler))}>
        Voice agent enabled
      </Button>
    );
  }
  const buildSucceeded = latest?.status === 'completed' && latest.conclusion === 'success';
  const blockedReason = loadingBuilds
    ? 'Checking the latest build…'
    : !latest
      ? 'Build this agent first. Voice agents can be enabled once a build succeeds.'
      : latest.status !== 'completed'
        ? 'Available once the running build succeeds.'
        : !buildSucceeded
          ? "The latest build failed. Fix it and rebuild to enable voice agents."
          : '';
  return (
    <Tooltip title={blockedReason} placement="left">
      <span>
        <Button
          variant="text"
          size="small"
          startIcon={<Mic size={16} />}
          disabled={!buildSucceeded}
          onClick={() => navigate(enableVoiceAgentUrl(orgHandler, projectHandler, component.handler))}>
          Enable voice agents
        </Button>
      </span>
    </Tooltip>
  );
}
