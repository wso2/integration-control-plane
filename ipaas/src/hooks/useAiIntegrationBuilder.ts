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

import { useCallback, useEffect, useRef, useState } from 'react';
import { getAccessToken } from '#auth';
import { usePrebuiltIntegrations } from './usePrebuiltIntegrations';
import { runAiIntegrationPipeline, clearChatHistory } from '../services/aiIntegrationBuilder';
import type { AiIntegrationBuilderResponse, ConversationTurn, PipelineStage, StepEvent } from '../types/aiBuilder';

interface UseAiIntegrationBuilder {
  turns: ConversationTurn[];
  activeQuery: string;
  isLoading: boolean;
  currentStage: PipelineStage | null;
  submitQuery: (query: string) => void;
  clearHistory: () => void;
}

// The copilot token-exchange requires the Choreo STS token (choreo:*/apim:* scopes),
// which is the Bearer tokenManager already issues — not the raw Asgardeo OIDC token.
async function getToken(): Promise<string> {
  const token = await getAccessToken();
  if (!token) throw new Error('Not authenticated');
  return token;
}

export function useAiIntegrationBuilder(projectId: string, initialQuery: string): UseAiIntegrationBuilder {
  const { data: prebuiltData } = usePrebuiltIntegrations();
  const prebuiltRef = useRef(prebuiltData?.prebuiltIntegrations ?? []);
  if (prebuiltData?.prebuiltIntegrations) {
    prebuiltRef.current = prebuiltData.prebuiltIntegrations;
  }

  const abortRef = useRef<AbortController | null>(null);
  const [turns, setTurns] = useState<ConversationTurn[]>([]);
  const [activeQuery, setActiveQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentStage, setCurrentStage] = useState<PipelineStage | null>(null);

  const submitQuery = useCallback(
    (query: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setActiveQuery(query);
      setIsLoading(true);
      setCurrentStage(null);

      runAiIntegrationPipeline(query, projectId, getToken, prebuiltRef.current, (step: StepEvent) => setCurrentStage(step.status === 'started' ? step.stage : null), controller.signal)
        .then((response: AiIntegrationBuilderResponse) => {
          setTurns((prev) => [...prev, { id: crypto.randomUUID(), query, response }]);
          setActiveQuery('');
          setIsLoading(false);
        })
        .catch((err: Error) => {
          if (err.name === 'AbortError') return;
          const message = err.name === 'UsageLimitError' ? 'Usage limit exceeded. Please try again later.' : err.message || 'Something went wrong. Please try again.';
          setTurns((prev) => [...prev, { id: crypto.randomUUID(), query, response: { type: 'error', message } }]);
          setActiveQuery('');
          setIsLoading(false);
        });
    },
    [projectId],
  );

  // Fire the initial query once, after projectId resolves. Superseding is handled
  // inside submitQuery; there is deliberately no abort-on-unmount (StrictMode would
  // cancel the initial run and the one-shot guard would then block the resubmit).
  const didInitRef = useRef(false);
  useEffect(() => {
    if (!initialQuery || didInitRef.current || !projectId) return;
    didInitRef.current = true;
    submitQuery(initialQuery);
  }, [initialQuery, projectId, submitQuery]);

  const clearHistory = useCallback(() => clearChatHistory(projectId), [projectId]);

  return { turns, activeQuery, isLoading, currentStage, submitQuery, clearHistory };
}
