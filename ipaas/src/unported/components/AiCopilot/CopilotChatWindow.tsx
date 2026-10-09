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

import { Alert, Box, Button, CircularProgress, IconButton, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { CircleStop, Copy } from '@wso2/oxygen-ui-icons-react';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { JSX } from 'react';
import { CopilotContext } from '../../contexts/CopilotContext';
import useCopilot from '../../hooks/useCopilot';
import { COPILOT_SESSION_ERROR_IDS_KEY } from '../../../constants/copilot';
import { generateUUID } from '../../../utils/string';
import { MessageType, type ApiChatExecutionResult } from '../../../types/copilot';
import CopilotChatInput from './CopilotChatInput';
import CopilotChatBody from './CopilotChatBody';
import CopilotInitError from './CopilotInitError';
import CopilotNotificationBanner from './CopilotNotificationBanner';
import CopilotSampleQueryPanel from './CopilotSampleQueryPanel';
import CopilotWelcomeBanner from './CopilotWelcomeBanner';

const SCROLL_BUFFER = 10;
function loadErrorIdsFromSession(): Set<string> {
  try {
    const raw = sessionStorage.getItem(COPILOT_SESSION_ERROR_IDS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) return new Set(parsed as string[]);
    }
  } catch {
    // ignore
  }
  return new Set();
}

export default function CopilotChatWindow(): JSX.Element {
  const [isCopilotTerminating, setIsCopilotTerminating] = useState(false);
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);
  const [trackingIdCopied, setTrackingIdCopied] = useState(false);
  const [errorMessageIds, setErrorMessageIds] = useState<Set<string>>(loadErrorIdsFromSession);

  const { messages, setMessages, dataPlanesError, messageSendingError, setMessageSendingError } = useContext(CopilotContext);
  const scrollParent = useRef<HTMLDivElement>(null);

  const { isAiCopilotLoading, isStreaming, answer, apiChatExecutionResult, sendMessage, trackingId, abortControllerRef } = useCopilot();
  const isStreamingRef = useRef(isStreaming);
  isStreamingRef.current = isStreaming;
  const autoScrollEnabledRef = useRef(autoScrollEnabled);
  autoScrollEnabledRef.current = autoScrollEnabled;

  const handleStopGenerating = () => {
    setIsCopilotTerminating(true);
    abortControllerRef.current.abort();
  };

  // Sync streaming answer chunks into messages
  useEffect(() => {
    if (!abortControllerRef.current.signal.aborted && answer.length > 0) {
      setMessages((prev) => {
        if (prev.length === 0) return prev;
        const last = prev[prev.length - 1];
        if (!last.fromUser && last.type === MessageType.REGULAR) {
          const next = [...prev];
          next[next.length - 1] = { ...next[next.length - 1], content: { data: answer.join('') } };
          return next;
        }
        if (!autoScrollEnabledRef.current) setAutoScrollEnabled(true);
        return [...prev, { id: generateUUID(), content: { data: answer.join('') }, fromUser: false, type: MessageType.REGULAR }];
      });
    }
  }, [answer, abortControllerRef, setMessages]);

  // Sync API chat execution results into messages
  useEffect(() => {
    if (!abortControllerRef.current.signal.aborted && apiChatExecutionResult) {
      const capturedResult = apiChatExecutionResult;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && !last.fromUser && last.type === MessageType.APICHAT) {
          const next = structuredClone(prev);
          next[next.length - 1].content.data = [...(next[next.length - 1].content.data as ApiChatExecutionResult[]), capturedResult];
          return next;
        }
        if (!autoScrollEnabledRef.current) setAutoScrollEnabled(true);
        return [...prev, { id: generateUUID(), content: { data: [capturedResult] }, fromUser: false, type: MessageType.APICHAT }];
      });
    }
  }, [apiChatExecutionResult, abortControllerRef, setMessages]);

  // Auto-scroll to bottom as new messages arrive
  useEffect(() => {
    if (autoScrollEnabled && scrollParent.current) {
      scrollParent.current.scrollTo({
        top: scrollParent.current.scrollHeight,
        behavior: isStreamingRef.current ? 'instant' : 'smooth',
      });
    }
  }, [messages, autoScrollEnabled]);

  const handleScroll = useCallback(() => {
    if (!scrollParent.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollParent.current;
    if (scrollTop < scrollHeight - clientHeight - SCROLL_BUFFER && autoScrollEnabled) {
      setAutoScrollEnabled(false);
    }
    if (scrollTop >= scrollHeight - clientHeight - SCROLL_BUFFER && !autoScrollEnabled) {
      setAutoScrollEnabled(true);
    }
  }, [autoScrollEnabled]);

  useEffect(() => {
    const el = scrollParent.current;
    if (el) el.addEventListener('scroll', handleScroll);
    return () => el?.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  useEffect(() => {
    if (isCopilotTerminating && !isAiCopilotLoading && !isStreaming) {
      setIsCopilotTerminating(false);
    }
  }, [isCopilotTerminating, isAiCopilotLoading, isStreaming]);

  // When an error occurs, record the ID of the last user message so we can mark it with an error icon
  const lastUserMessageId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].fromUser) return messages[i].id;
    }
    return null;
  }, [messages]);

  useEffect(() => {
    if (messageSendingError && lastUserMessageId) {
      setErrorMessageIds((prev) => {
        if (prev.has(lastUserMessageId)) return prev;
        const next = new Set(prev);
        next.add(lastUserMessageId);
        return next;
      });
    }
  }, [messageSendingError, lastUserMessageId]);

  // Persist error IDs to sessionStorage whenever they change
  useEffect(() => {
    sessionStorage.setItem(COPILOT_SESSION_ERROR_IDS_KEY, JSON.stringify([...errorMessageIds]));
  }, [errorMessageIds]);

  // Clear error IDs from sessionStorage when messages are cleared (org change)
  useEffect(() => {
    if (messages.length === 0) {
      setErrorMessageIds(new Set());
      sessionStorage.removeItem(COPILOT_SESSION_ERROR_IDS_KEY);
    }
  }, [messages.length]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden', pt: 1 }}>
      {!dataPlanesError && <CopilotNotificationBanner isAiCopilotLoading={isAiCopilotLoading} isStreaming={isStreaming} />}
      <Box ref={scrollParent} sx={{ flexGrow: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', px: 2 }}>
        {dataPlanesError ? (
          <CopilotInitError />
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
            {messages.length === 0 && <CopilotWelcomeBanner />}
            <CopilotSampleQueryPanel isAiCopilotLoading={isAiCopilotLoading} isStreaming={isStreaming} sendMessage={sendMessage} />
            <CopilotChatBody isStreaming={isStreaming} messages={messages} errorMessageIds={errorMessageIds} />
            {isAiCopilotLoading && (
              <Stack direction="row" alignItems="center" gap={1} justifyContent="center" sx={{ pb: 1 }}>
                <CircularProgress size={12} />
                <Typography variant="caption" color="primary.main">
                  Working on it...
                </Typography>
              </Stack>
            )}
          </Box>
        )}
      </Box>
      <Box sx={{ flexShrink: 0, px: 2, pb: 2 }}>
        {messageSendingError && (
          <Alert severity="error" onClose={() => setMessageSendingError('')} sx={{ mb: 1 }}>
            <Typography variant="body2">{messageSendingError}</Typography>
            {trackingId && (
              <Stack direction="row" alignItems="center" gap={0.5} sx={{ mt: 0.5 }}>
                <Typography variant="caption" sx={{ flex: 1, wordBreak: 'break-all' }}>
                  Tracking ID: {trackingId}
                </Typography>
                <Tooltip title={trackingIdCopied ? 'Copied!' : 'Copy'}>
                  <IconButton
                    size="small"
                    onClick={() => {
                      navigator.clipboard
                        .writeText(trackingId)
                        .then(() => {
                          setTrackingIdCopied(true);
                          setTimeout(() => setTrackingIdCopied(false), 2000);
                        })
                        .catch(() => {});
                    }}
                    sx={{ p: 0.25, flexShrink: 0 }}
                    aria-label="Copy tracking ID">
                    <Copy size={12} />
                  </IconButton>
                </Tooltip>
              </Stack>
            )}
          </Alert>
        )}
        {(isAiCopilotLoading || isStreaming) && (
          <Stack alignItems="center" sx={{ mb: 1 }}>
            <Button variant="contained" color="secondary" size="small" onClick={handleStopGenerating} disabled={isCopilotTerminating} startIcon={<CircleStop size={14} />}>
              Stop Generating
            </Button>
          </Stack>
        )}
        {!dataPlanesError && <CopilotChatInput sendMessage={sendMessage} isAiCopilotLoading={isAiCopilotLoading} isStreaming={isStreaming} />}
        <Typography variant="caption" color="text.secondary" display="block" textAlign="center" sx={{ mt: 0.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          Use Copilot mindfully as AI can make mistakes.
        </Typography>
      </Box>
    </Box>
  );
}
