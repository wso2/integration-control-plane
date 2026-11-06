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

import { Button } from '@wso2/oxygen-ui';
import { CircleCheck, Mic } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';
import { useAppNavigate } from '../../../hooks/useAppNavigate';
import { useLinkedVoiceAgent } from '../../../hooks/useVoiceAgents';
import { useScope } from '../../../nav';
import { componentOverviewUrl, createVoiceAgentUrl } from '../../../paths';
import type { Component } from '../../../types/component';

interface EnableVoiceAgentButtonProps {
  component: Component;
  orgHandler: string;
  projectId: string;
}

/**
 * AI agent overview action: opens the voice agent wizard with this agent fixed as the target,
 * or, once a voice agent speaks for it, links to that voice agent (Devant's EnableVoiceAgentButton).
 */
export default function EnableVoiceAgentButton({ component, orgHandler, projectId }: EnableVoiceAgentButtonProps): JSX.Element | null {
  const navigate = useAppNavigate();
  const scope = useScope();
  const { voiceAgent, isLoading, isError } = useLinkedVoiceAgent(orgHandler, projectId, component.handler);

  // A failed lookup is not "no voice agent": offering to create one could make a duplicate.
  if (scope.level !== 'components' || isLoading || isError) return null;
  const projectHandler = scope.project;

  if (voiceAgent) {
    return (
      <Button variant="text" size="small" startIcon={<CircleCheck size={16} />} onClick={() => navigate(componentOverviewUrl(orgHandler, projectHandler, voiceAgent.handler))}>
        Voice agent enabled
      </Button>
    );
  }
  return (
    <Button variant="text" size="small" startIcon={<Mic size={16} />} onClick={() => navigate(createVoiceAgentUrl(orgHandler, projectHandler, { handler: component.handler, name: component.displayName || component.handler }))}>
      Enable voice agents
    </Button>
  );
}
