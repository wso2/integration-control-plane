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
import { useAgentVoiceEndpoint, type AgentVoiceEndpointState } from '../../../hooks/useAgentVoiceEndpoint';
import { useAppNavigate } from '../../../hooks/useAppNavigate';
import { useLinkedVoiceAgents } from '../../../hooks/useVoiceAgents';
import { useScope } from '../../../nav';
import { componentOverviewUrl, enableVoiceAgentUrl } from '../../../paths';
import type { HeaderActionsProps } from '../../../types/integration';

const BLOCKED_REASON: Record<AgentVoiceEndpointState['status'], string> = {
  error: "Couldn't check this AI agent's endpoints. Reload the page to try again.",
  loading: "Checking the agent's endpoints…",
  'no-environment': 'Deploy this AI agent to enable its voice agent.',
  'not-deployed': 'Deploy this AI agent to enable its voice agent.',
  'no-endpoint': 'Add a WebSocket endpoint to this AI agent to enable its voice agent.',
  ready: '',
};

export default function EnableVoiceAgentButton({ component, orgHandler, projectId }: HeaderActionsProps): JSX.Element | null {
  const navigate = useAppNavigate();
  const scope = useScope();
  const { voiceAgents, isLoading, isError } = useLinkedVoiceAgents(orgHandler, projectId, component.handler);
  const endpoint = useAgentVoiceEndpoint(orgHandler, projectId, component);

  if (scope.level !== 'components' || isLoading || isError) return null;
  const projectHandler = scope.project;

  const voiceAgent = voiceAgents.at(0);
  if (voiceAgent) {
    return (
      <Button variant="text" size="small" startIcon={<CircleCheck size={16} />} onClick={() => navigate(componentOverviewUrl(orgHandler, projectHandler, voiceAgent.handler))}>
        Voice agent enabled
      </Button>
    );
  }
  return (
    <Tooltip title={BLOCKED_REASON[endpoint.status]} placement="left">
      <span>
        <Button variant="text" size="small" startIcon={<Mic size={16} />} disabled={endpoint.status !== 'ready'} onClick={() => navigate(enableVoiceAgentUrl(orgHandler, projectHandler, component.handler))}>
          Enable voice agent
        </Button>
      </span>
    </Tooltip>
  );
}
