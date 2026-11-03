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
import { sendChatMessage } from '../api/agents';
import i18n from '../i18n';

export interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  content: string;
  time: number;
  failed?: boolean;
}

/** One conversation with an agent endpoint. A new endpoint, or `reset`, starts a new session. */
export function useAgentChat(endpointUrl: string | undefined) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const session = useRef(crypto.randomUUID());
  const generation = useRef(0);

  const reset = useCallback(() => {
    generation.current += 1;
    session.current = crypto.randomUUID();
    setMessages([]);
    setSending(false);
  }, []);

  useEffect(reset, [endpointUrl, reset]);

  const send = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || !endpointUrl || sending) return;
      const mine = generation.current;
      setMessages((all) => [...all, { id: crypto.randomUUID(), role: 'user', content: message, time: Date.now() }]);
      setSending(true);
      let reply: ChatMessage;
      try {
        reply = { id: crypto.randomUUID(), role: 'agent', content: await sendChatMessage(endpointUrl, session.current, message), time: Date.now() };
      } catch (error) {
        reply = { id: crypto.randomUUID(), role: 'agent', content: error instanceof Error ? error.message : i18n.t('agent.noAnswer'), time: Date.now(), failed: true };
      }
      if (generation.current !== mine) return;
      setMessages((all) => [...all, reply]);
      setSending(false);
    },
    [endpointUrl, sending],
  );

  return { messages, sending, send, reset };
}
