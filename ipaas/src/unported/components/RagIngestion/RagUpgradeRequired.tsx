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

import { Box, Button, Stack, Typography } from '@wso2/oxygen-ui';
import { Sparkles } from '@wso2/oxygen-ui-icons-react';
import type { JSX } from 'react';

interface RagUpgradeRequiredProps {
  orgUuid: string | null | undefined;
}

/**
 * Paywall shown to free-tier orgs on the RAG pages. Mirrors Devant's
 * RAGSubscriptionGate — RAG is a paid feature, so unsubscribed users get an
 * upgrade prompt instead of the wizard.
 */
export default function RagUpgradeRequired({ orgUuid }: RagUpgradeRequiredProps): JSX.Element {
  const billingConsoleUrl = window.API_CONFIG?.billingConsoleUrl;
  return (
    <Stack alignItems="center" textAlign="center" sx={{ maxWidth: 640, mx: 'auto', py: 8 }}>
      <Box sx={{ width: 88, height: 88, borderRadius: '50%', bgcolor: 'action.hover', display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 3, color: 'primary.main' }}>
        <Sparkles size={40} />
      </Box>
      <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
        Upgrade required
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Please upgrade your WSO2 Integration Platform subscription to access RAG features.
      </Typography>
      {billingConsoleUrl && orgUuid && (
        <Button variant="contained" onClick={() => window.open(`${billingConsoleUrl}/cloud/devant/upgrade?orgId=${encodeURIComponent(orgUuid)}`, '_blank', 'noopener,noreferrer')}>
          Upgrade
        </Button>
      )}
    </Stack>
  );
}
