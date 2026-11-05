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

import { useAccessControl } from '../contexts/AccessControlContext';

/** Whether the user's role allows an action that needs `scope`. */
export function useCan(): (scope: string) => boolean {
  const { hasAllPermissions } = useAccessControl();
  return (scope) => hasAllPermissions([scope]);
}

export const AGENT_REFUSAL = "Your role doesn't allow this for AI agents.";

export const CONNECT_REFUSAL = "Your role can't connect a GitHub or Azure DevOps account. You can still import from a public repository, or from an account already connected.";

/** Why the role may not make an AI-agent write that agent-manager checks against `agentScope`; empty when it may. */
export function useAgentRefusal(): (agentScope: string) => string {
  const can = useCan();
  return (agentScope) => (can(agentScope) ? '' : AGENT_REFUSAL);
}
