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

import { useEffect, useState } from 'react';
import { Alert, PageContent, PageTitle, Stack } from '@wso2/oxygen-ui';
import type { OrgScope } from '../nav';
import { trackEvent } from '../services/tracking/tracking';
import { configuredMoesifOrigin } from '../utils/moesif';
import MoesifEmbed from '../components/Insights/MoesifEmbed';

const pageStyle = { height: 'calc(100dvh - 13rem)', minHeight: 480 } as const;

export default function ApiInsights({ org }: OrgScope) {
  const [attempt, setAttempt] = useState(0);
  useEffect(() => trackEvent('visit-moesif-dashboard'), []);
  const origin = configuredMoesifOrigin();
  const apiBase = window.API_CONFIG?.choreoBaseApiUrl;
  return (
    <PageContent>
      <Stack spacing={3} sx={pageStyle}>
        <PageTitle>
          <PageTitle.Header>API Insights</PageTitle.Header>
          <PageTitle.SubHeader>Explore API usage and traffic insights powered by Moesif.</PageTitle.SubHeader>
        </PageTitle>
        {origin && apiBase ? (
          <MoesifEmbed key={`${org}:${origin}:${apiBase}:${attempt}`} origin={origin} apiBase={apiBase} onRetry={() => setAttempt((value) => value + 1)} />
        ) : (
          <Alert severity="info">API Insights is not configured for this deployment. Contact your administrator to enable it.</Alert>
        )}
      </Stack>
    </PageContent>
  );
}
