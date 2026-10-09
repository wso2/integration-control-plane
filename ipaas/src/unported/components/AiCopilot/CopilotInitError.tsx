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

import { Box, Button, CircularProgress, Stack, Typography } from '@wso2/oxygen-ui';
import { useContext } from 'react';
import type { JSX } from 'react';
import CopilotErrorIcon from '../../assets/icons/ai/CopilotErrorIcon';
import { CopilotContext } from '../../contexts/CopilotContext';

export default function CopilotInitError(): JSX.Element {
  const { isDataPlanesLoading, refetchDataPlanes } = useContext(CopilotContext);

  return (
    <Stack alignItems="center" gap={2} sx={{ flexGrow: 1, justifyContent: 'center' }}>
      <CopilotErrorIcon width={106} height={106} />
      <Typography variant="h5" fontWeight={600}>
        Copilot Error
      </Typography>
      <Typography variant="body2" textAlign="center">
        Copilot could not connect to the server.
      </Typography>
      <Box sx={{ height: 36, display: 'flex', alignItems: 'center' }}>
        {isDataPlanesLoading ? (
          <CircularProgress size={24} />
        ) : (
          <Button variant="outlined" size="small" onClick={refetchDataPlanes}>
            Retry
          </Button>
        )}
      </Box>
    </Stack>
  );
}
