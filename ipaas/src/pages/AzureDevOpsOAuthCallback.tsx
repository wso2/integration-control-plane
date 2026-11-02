/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
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
    </Box>
  );
}
