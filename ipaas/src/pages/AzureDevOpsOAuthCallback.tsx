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

import { Box, CircularProgress, Typography } from '@wso2/oxygen-ui';
import { useEffect, type JSX } from 'react';
import { AZURE_DEVOPS_AUTH } from '../constants/azureDevOps';

export default function AzureDevOpsOAuthCallback(): JSX.Element {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const channel = new BroadcastChannel(AZURE_DEVOPS_AUTH.BROADCAST_CHANNEL);
    channel.postMessage({
      authCode: params.get('code'),
      state: params.get('state'),
      error: params.get('error'),
      errorDescription: params.get('error_description'),
    });
    channel.close();
    window.close();
  }, []);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 2 }}>
      <CircularProgress size={32} />
      <Typography color="text.secondary">Completing Azure DevOps authentication…</Typography>
      <Typography variant="body2" color="text.secondary">
        If this window does not close automatically, return to the Integration import page.
      </Typography>
    </Box>
  );
}
