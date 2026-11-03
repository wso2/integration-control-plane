/*
 * Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com). All Rights Reserved.
 *
 * This software is the property of WSO2 LLC. and its suppliers, if any.
 * Dissemination of any information or reproduction of any material contained
 * herein is strictly forbidden, unless permitted by WSO2 in accordance with
 * the WSO2 Commercial License available at http://wso2.com/licenses.
 * For specific language governing the permissions and limitations under
 * this license, please see the license as well as any agreement you've
 * entered into with WSO2 governing the purchase of this software and any
 * associated services.
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
