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

import { Box, Button, Typography } from '@wso2/oxygen-ui';
import { AlertCircle } from '@wso2/oxygen-ui-icons-react';
import { lazy, Suspense, useContext, useEffect, useMemo, useState } from 'react';
import type { JSX } from 'react';
import { useAppNavigate } from '../../../hooks/useAppNavigate';
import { CopilotContext } from '../../contexts/CopilotContext';
import { useGetCopilotDataCollectionPermission, useSendCopilotFeedback } from '../../hooks/useDataCollector';
import { DataCollectorStatus, MessageType, type ApiChatExecutionResult, type IMessage, type NavigationResponse } from '../../../types/copilot';
const Markdown = lazy(() => import('../../../components/Markdown'));
const ApiChatMessage = lazy(() => import('./ApiChatMessage'));
import FeedbackButtons, { type FeedbackValue } from './FeedbackButtons';

interface CopilotMessageProps {
  message: IMessage;
  showFeedback: boolean;
  hasError?: boolean;
  isCurrentlyStreaming?: boolean;
}

export default function CopilotMessage({ message, showFeedback, hasError, isCurrentlyStreaming }: CopilotMessageProps): JSX.Element {
  const { orgId } = useContext(CopilotContext);
  const navigate = useAppNavigate();
  const [feedback, setFeedback] = useState<FeedbackValue>('none');

  const { data: permissionData } = useGetCopilotDataCollectionPermission(orgId);
  const dataCollectionEnabled = permissionData?.status === DataCollectorStatus.ENABLED;

  const { mutate: sendFeedback } = useSendCopilotFeedback(orgId, feedback === 'like', message.id);

  useEffect(() => {
    if (feedback !== 'none') sendFeedback();
  }, [feedback, sendFeedback]);

  const navigationData = useMemo((): NavigationResponse | null => {
    if (message.fromUser || !message.content.data) return null;
    try {
      const parsed = JSON.parse(String(message.content.data)) as unknown;
      if (
        parsed &&
        typeof parsed === 'object' &&
        'content' in parsed &&
        typeof (parsed as NavigationResponse).content === 'string' &&
        'navigate' in parsed &&
        typeof (parsed as NavigationResponse).navigate?.button_path === 'string' &&
        typeof (parsed as NavigationResponse).navigate?.path === 'string'
      ) {
        return parsed as NavigationResponse;
      }
    } catch {
      // not a navigation response
    }
    return null;
  }, [message.content.data, message.fromUser]);

  const showFeedbackButtons = dataCollectionEnabled && showFeedback;

  if (message.type === MessageType.APICHAT) {
    return (
      <Suspense fallback={null}>
        <ApiChatMessage executionResults={message.content.data as ApiChatExecutionResult[]} />
      </Suspense>
    );
  }

  if (!message.content.data || String(message.content.data).length === 0) {
    return <></>;
  }

  if (message.fromUser) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 1, mb: 2 }}>
        {hasError && <AlertCircle size={14} color="var(--oxygen-palette-error-main)" />}
        <Box
          sx={(theme) => ({
            maxWidth: '80%',
            bgcolor: theme.palette.warning.light + '33',
            borderRadius: '16px 16px 4px 16px',
            px: 2,
            py: 1,
          })}>
          <Typography variant="body2">{String(message.content.data)}</Typography>
        </Box>
      </Box>
    );
  }

  // Navigation response
  if (navigationData) {
    return (
      <Box sx={{ mb: 2, position: 'relative' }}>
        <Box sx={{ bgcolor: 'action.hover', borderRadius: 2, px: 2, pt: 1.5, pb: showFeedbackButtons ? 5 : 1.5, overflowX: 'auto' }}>
          <Typography variant="body2" component="div">
            <Suspense fallback={null}>
              <Markdown>{navigationData.content}</Markdown>
            </Suspense>
          </Typography>
          {navigationData.navigate.path && (
            <Box sx={{ mt: 1 }}>
              <Button variant="contained" size="small" onClick={() => navigate(navigationData.navigate.path)}>
                {navigationData.navigate.button_path}
              </Button>
            </Box>
          )}
          <FeedbackButtons feedback={feedback} onFeedback={setFeedback} visible={showFeedbackButtons} />
        </Box>
      </Box>
    );
  }

  // Regular bot message
  return (
    <Box sx={{ mb: 2, position: 'relative' }}>
      <Box sx={{ bgcolor: 'action.hover', borderRadius: 2, px: 2, pt: 1.5, pb: showFeedbackButtons ? 5 : 1.5, overflowX: 'auto' }}>
        <Typography variant="body2" component="div">
          <Suspense fallback={null}>
            <Markdown>{String(message.content.data)}</Markdown>
          </Suspense>
          {isCurrentlyStreaming && (
            <Box
              component="span"
              sx={{
                display: 'inline-block',
                width: '2px',
                height: '1em',
                bgcolor: 'text.primary',
                ml: '2px',
                verticalAlign: 'text-bottom',
                animation: 'copilot-cursor-blink 1s step-start infinite',
                '@keyframes copilot-cursor-blink': {
                  '0%, 49%': { opacity: 1 },
                  '50%, 100%': { opacity: 0 },
                },
              }}
            />
          )}
        </Typography>
      </Box>
      <FeedbackButtons feedback={feedback} onFeedback={setFeedback} visible={showFeedbackButtons} />
    </Box>
  );
}
