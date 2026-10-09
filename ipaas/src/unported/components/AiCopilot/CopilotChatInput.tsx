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

import { Box, IconButton, InputAdornment } from '@wso2/oxygen-ui';
import TextField from '../../../components/common/TextField';
import { SendHorizontal } from '@wso2/oxygen-ui-icons-react';
import { useContext } from 'react';
import type { JSX, KeyboardEvent } from 'react';
import { CopilotContext } from '../../contexts/CopilotContext';
import { MessageType } from '../../../types/copilot';
import { generateUUID } from '../../../utils/string';

interface CopilotChatInputProps {
  sendMessage: (message: string, messageId: string) => void;
  isAiCopilotLoading: boolean;
  isStreaming: boolean;
}

export default function CopilotChatInput({ sendMessage, isAiCopilotLoading, isStreaming }: CopilotChatInputProps): JSX.Element {
  const { messages, setMessages, selectedRegion, chatInputValue: inputValue, setChatInputValue: setInputValue } = useContext(CopilotContext);

  const isSendDisabled = !inputValue.trim() || isAiCopilotLoading || isStreaming || !selectedRegion;

  const handleSend = () => {
    if (isSendDisabled) return;
    const trimmed = inputValue.trim();
    const messageId = generateUUID();
    setMessages([...messages, { id: messageId, content: { data: trimmed }, fromUser: true, type: MessageType.REGULAR }]);
    sendMessage(trimmed, messageId);
    setInputValue('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !isSendDisabled) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Box sx={{ pr: 1 }}>
      <TextField
        fullWidth
        multiline
        maxRows={4}
        size="small"
        placeholder="Enter your message here"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={isAiCopilotLoading || isStreaming || !selectedRegion}
        inputProps={{ maxLength: 500 }}
        InputProps={{
          endAdornment: (
            <InputAdornment position="end">
              <IconButton size="small" onClick={handleSend} disabled={isSendDisabled} edge="end" aria-label="Send message">
                <SendHorizontal size={18} color={isSendDisabled ? undefined : 'var(--oxygen-palette-primary-main)'} />
              </IconButton>
            </InputAdornment>
          ),
        }}
      />
    </Box>
  );
}
