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

import { Alert, Button, PageContent, PageTitle, Skeleton, Stack } from '@wso2/oxygen-ui';
import { useTranslation } from '../i18n';
import { Link, useParams } from 'react-router';
import AgentView from '../components/agent/AgentView';
import AutomationView from '../components/automation/AutomationView';
import NotFound from '../components/NotFound';
import WorkflowView from '../components/workflow/WorkflowView';
import { isNotFound, useIntegration } from '../hooks/useIntegrations';
import { kindUrl, overviewUrl } from '../paths';

function IntegrationSkeleton() {
  const { t } = useTranslation();
  return (
    <PageContent aria-busy="true" aria-label={t('common.loading')}>
      <Skeleton variant="text" width={120} sx={{ mb: 2 }} />
      <Stack direction="row" alignItems="center" gap={2} sx={{ mb: 3 }}>
        <Skeleton variant="rounded" width={48} height={48} />
        <Stack gap={0.5}>
          <Skeleton variant="text" width={300} height={44} />
          <Skeleton variant="text" width={180} />
        </Stack>
      </Stack>
      <Skeleton variant="rounded" height={380} />
    </PageContent>
  );
}

/** One integration: its header, then what the user can do with it. */
export default function IntegrationPage() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const { data: integration, isLoading, isError, error, refetch } = useIntegration(id);

  if (isLoading) return <IntegrationSkeleton />;
  if (isNotFound(error) || (!isError && !integration))
    return <NotFound message={t('integrations.page.notFound')} backTo={overviewUrl()} backLabel={t('integrations.page.backToOverview')} />;
  if (isError || !integration)
    return (
      <PageContent>
        <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => void refetch()}>{t('common.actions.retry')}</Button>}>
          {t('integrations.page.loadError')}
        </Alert>
      </PageContent>
    );

  return (
    <PageContent>
      <PageTitle>
        <Link to={kindUrl(integration.kind)} style={{ textDecoration: 'none' }}>
          <PageTitle.BackButton>{t(`integrations.listing.${integration.kind}.title`)}</PageTitle.BackButton>
        </Link>
      </PageTitle>
      {integration.kind === 'aiAgent' && <AgentView key={integration.id} integration={integration} />}
      {integration.kind === 'automation' && <AutomationView key={integration.id} integration={integration} />}
      {integration.kind === 'workflow' && <WorkflowView key={integration.id} integration={integration} />}
    </PageContent>
  );
}
