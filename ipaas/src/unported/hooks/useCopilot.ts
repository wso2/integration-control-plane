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

import { useContext, useRef, useState } from 'react';
import { useComponentByHandler } from '../../hooks/useComponents';
import { getAiCopilotAnswer } from '#api/copilot';
import { COPILOT_CONNECTION_ERROR, COPILOT_CONNECTION_URL_ERROR, COPILOT_PROCESSING_ERROR } from '../../constants/copilot';
import { CopilotContext } from '../contexts/CopilotContext';
import { hasComponent, hasProject, useScope } from '../../nav';
import type { ApiChatExecutionResult } from '../../types/copilot';
import { useProjectId } from '../../hooks/useProjects';

function useCopilot() {
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [answer, setAnswer] = useState<string[]>([]);
  const [apiChatExecutionResult, setApiChatExecutionResult] = useState<ApiChatExecutionResult | null>(null);
  const [trackingId, setTrackingId] = useState('');
  const apiChatResultsCounterRef = useRef(0);
  const abortControllerRef = useRef(new AbortController());
  const messageBufferRef = useRef('');

  const { copilotUrl, setMessageSendingError } = useContext(CopilotContext);
  const scope = useScope();

  const projectHandle = hasProject(scope) ? scope.project : '';
  const componentHandle = hasComponent(scope) ? scope.component : '';
  const { projectId: projectUuid } = useProjectId(projectHandle);
  const { data: componentData } = useComponentByHandler(projectUuid, componentHandle || undefined);

  const buildChatContext = () => ({
    project: { handle: projectHandle, uuid: projectUuid },
    component: { handle: componentHandle, uuid: componentData?.id ?? '' },
  });

  const sendMessage = async (nlQuery: string, messageId: string): Promise<boolean> => {
    if (abortControllerRef.current.signal.aborted) {
      abortControllerRef.current = new AbortController();
    }

    setIsLoading(true);
    setAnswer([]);
    setApiChatExecutionResult(null);
    setMessageSendingError('');
    setTrackingId('');

    if (!copilotUrl) {
      setMessageSendingError(COPILOT_CONNECTION_URL_ERROR);
      setIsLoading(false);
      return false;
    }

    try {
      const response = await getAiCopilotAnswer(copilotUrl, nlQuery, abortControllerRef.current.signal, messageId, buildChatContext());

      if (!response.ok) {
        throw new Error(COPILOT_CONNECTION_ERROR);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder('utf-8');
      setIsStreaming(true);

      if (!reader) {
        throw new Error('Error while fetching answer from Copilot. Reader is undefined.');
      }
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          messageBufferRef.current = '';
          setIsLoading(false);
          setIsStreaming(false);
          break;
        }
        const rawChunk = decoder.decode(value, { stream: true });
        // Prepend any incomplete line from previous chunk, then split
        const fullText = messageBufferRef.current + rawChunk;
        const lines = fullText.split('\n');
        // Keep the last (possibly incomplete) line in the buffer for next iteration
        messageBufferRef.current = lines[lines.length - 1];
        const completeLines = lines.slice(0, -1);
        try {
          const tempAnswer = completeLines.reduce((acc, line) => {
            const part = line.trim();
            if (part && part.startsWith('data: ')) {
              const json = JSON.parse(part.slice(5)) as Record<string, unknown>;
              if (json.assistant === 'TestAssistant') {
                apiChatResultsCounterRef.current += 1;
                setApiChatExecutionResult({
                  id: apiChatResultsCounterRef.current,
                  result: JSON.stringify(json.result, null, 2),
                });
              } else if (json.content) {
                return acc + (json.content as string);
              } else if (json.type === 'ERROR') {
                setTrackingId(json.tracking_id as string);
                setMessageSendingError(json.message as string);
              }
            }
            return acc;
          }, '');
          if (tempAnswer) {
            setAnswer((prev) => [...prev, tempAnswer]);
          }
        } catch {
          setMessageSendingError(COPILOT_PROCESSING_ERROR);
        }
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) {
        setMessageSendingError(COPILOT_CONNECTION_ERROR);
      }
      return false;
    } finally {
      messageBufferRef.current = '';
      setIsLoading(false);
      setIsStreaming(false);
    }
    return true;
  };

  return {
    isAiCopilotLoading: isLoading,
    isStreaming,
    answer,
    apiChatExecutionResult,
    sendMessage,
    trackingId,
    abortControllerRef,
  };
}

export default useCopilot;
