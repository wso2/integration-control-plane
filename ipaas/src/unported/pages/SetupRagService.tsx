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

import { Alert, Box, Button, CircularProgress, LinearProgress, PageContent, PageTitle, Stack, Typography } from '@wso2/oxygen-ui';
import { useEffect, useState, type JSX } from 'react';
import { useAppNavigate } from '../../hooks/useAppNavigate';
import { isRagIngestionEnabled, useCreateRagService } from '../../hooks/useRagIngestion';
import { useProjects } from '../../hooks/useProjects';
import { useSubscriptions } from '../../hooks/useSubscription';
import { useOrgUuid } from '../../hooks/useOrgUuid';
import { PAID_SUBSCRIPTION_TYPE } from '../../constants/subscription';
import { blankAutomation } from '../../constants/ragIngestion';
import { isAutomationValid } from '../../utils/ragIngestion';
import { componentOverviewUrl } from '../../paths';
import ComingSoon from '../../pages/ComingSoon';
import AutomationStep from '../components/RagIngestion/steps/AutomationStep';
import RagUpgradeRequired from '../components/RagIngestion/RagUpgradeRequired';
import type { OrgScope } from '../../nav';
import type { AutomationConfig } from '../../types/ragIngestion';

export default function SetupRagService(scope: OrgScope): JSX.Element {
  const navigate = useAppNavigate();
  const [automation, setAutomation] = useState<AutomationConfig>(blankAutomation());
  const create = useCreateRagService();
  const { data: projects } = useProjects();
  const orgUuid = useOrgUuid();
  const subscriptions = useSubscriptions(orgUuid ?? '');
  const isSubscribed = (subscriptions.data?.list ?? []).some((s) => s.subscriptionType === PAID_SUBSCRIPTION_TYPE);

  useEffect(() => {
    if (!create.isSuccess || !create.componentHandler) return;
    const handler = (projects ?? []).find((p) => p.id === automation.projectId)?.handler;
    if (handler) navigate(componentOverviewUrl(scope.org, handler, create.componentHandler));
  }, [create.isSuccess, create.componentHandler, projects, automation.projectId, navigate, scope.org]);

  if (!isRagIngestionEnabled()) {
    return <ComingSoon title="Coming Soon" description="RAG Service is currently under development." />;
  }

  const title = (
    <PageTitle>
      <PageTitle.Header>Service</PageTitle.Header>
    </PageTitle>
  );

  if (subscriptions.isLoading) {
    return (
      <PageContent>
        {title}
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 'calc(100vh - 120px)' }}>
          <CircularProgress />
        </Box>
      </PageContent>
    );
  }
  if (!isSubscribed) {
    return (
      <PageContent>
        {title}
        <RagUpgradeRequired orgUuid={orgUuid} />
      </PageContent>
    );
  }

  return (
    <PageContent>
      {title}
      <Box sx={{ maxWidth: 640, mt: 3 }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Deploy a shared retrieval service that other integrations can query for relevant context.
        </Typography>

        {create.error && (
          <Alert severity="error" variant="outlined" onClose={create.reset} sx={{ mb: 3 }}>
            {create.error}
          </Alert>
        )}

        <AutomationStep value={automation} onChange={setAutomation} heading="Create RAG Service" />

        {create.isDeploying ? (
          <Box sx={{ mt: 4 }}>
            <Typography variant="body2" sx={{ mb: 1 }}>
              {create.stepLabel}
            </Typography>
            <LinearProgress variant="determinate" value={create.progress} />
          </Box>
        ) : (
          <Stack direction="row" sx={{ mt: 4 }}>
            <Button variant="contained" disabled={!isAutomationValid(automation)} onClick={() => create.deploy({ orgHandler: scope.org, automation })}>
              Create Service
            </Button>
          </Stack>
        )}
      </Box>
    </PageContent>
  );
}
