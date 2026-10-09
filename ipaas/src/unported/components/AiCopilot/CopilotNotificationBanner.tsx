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

import { Alert, Box, Button } from '@wso2/oxygen-ui';
import { useContext } from 'react';
import type { JSX } from 'react';
import { CopilotContext } from '../../contexts/CopilotContext';

interface CopilotNotificationBannerProps {
  isAiCopilotLoading: boolean;
  isStreaming: boolean;
}

export default function CopilotNotificationBanner({ isAiCopilotLoading, isStreaming }: CopilotNotificationBannerProps): JSX.Element {
  const { selectedRegion, messages, isMultiRegionAvailable, clearChat } = useContext(CopilotContext);

  const handleNewChat = () => {
    clearChat();
  };

  if (!isMultiRegionAvailable || !selectedRegion || messages.length === 0) {
    return <></>;
  }

  return (
    <Box sx={{ mx: 1, mb: 1 }}>
      <Alert severity="info" sx={{ py: 0.5 }}>
        Copilot&apos;s responses are based on the <strong>{selectedRegion.name}</strong> Region. To query from another region,{' '}
        <Button variant="text" size="small" onClick={handleNewChat} disabled={isAiCopilotLoading || isStreaming} sx={{ p: 0, minWidth: 'unset', textDecoration: 'underline', verticalAlign: 'baseline' }}>
          start a new chat
        </Button>
        .
      </Alert>
    </Box>
  );
}
