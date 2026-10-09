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

import { Stack } from '@wso2/oxygen-ui';
import { useContext } from 'react';
import type { JSX } from 'react';
import { CopilotContext } from '../../contexts/CopilotContext';
import { MessageType, type QueryData } from '../../../types/copilot';
import { generateUUID } from '../../../utils/string';
import CopilotSampleQueryCard from './CopilotSampleQueryCard';

const SAMPLE_QUERIES: QueryData[] = [
  {
    query: 'Take me to the RAG ingestion page.',
    description: 'Jump straight to the pages for configuring RAG pipelines, vector stores, and GenAI service providers.',
  },
  {
    query: 'Explain how can I build an AI agent integration?',
    description: 'Design autonomous AI agents that connect LLMs, MCP tools, and vector databases.',
  },
  {
    query: 'How can I build an integration and expose it as a managed API?',
    description: 'Compose services with prebuilt connectors and publish them as secured, discoverable APIs with full lifecycle management.',
  },
];

interface CopilotSampleQueryPanelProps {
  isAiCopilotLoading: boolean;
  isStreaming: boolean;
  sendMessage: (message: string, messageId: string) => void;
}

export default function CopilotSampleQueryPanel({ isAiCopilotLoading, isStreaming, sendMessage }: CopilotSampleQueryPanelProps): JSX.Element {
  const { setMessages, selectedRegion } = useContext(CopilotContext);
  const isDisabled = isAiCopilotLoading || isStreaming || !selectedRegion;

  const handleSend = (query: string) => {
    const messageId = generateUUID();
    setMessages((prev) => [...prev, { id: messageId, content: { data: query }, fromUser: true, type: MessageType.REGULAR }]);
    sendMessage(query, messageId);
  };

  return (
    <Stack spacing={1} alignItems="flex-end" sx={{ px: 1, pb: 1, mb: 2 }}>
      {SAMPLE_QUERIES.map((queryData) => (
        <CopilotSampleQueryCard key={queryData.query} queryData={queryData} onExecuteClick={handleSend} disabled={isDisabled} />
      ))}
    </Stack>
  );
}
