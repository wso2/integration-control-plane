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

import { Alert, Box, Button, Card, Grid, PageContent, PageTitle, Stack, Typography } from '@wso2/oxygen-ui';
import { ArrowRight, CircleCheckBig, PlugZap } from '@wso2/oxygen-ui-icons-react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useAuth, VIEW_SCOPES } from '../auth';
import EmptyListing from '../components/EmptyListing';
import IntegrationCard from '../components/integrations/IntegrationCard';
import { useToast } from '../components/Toast';
import TaskDrawer from '../components/workflow/TaskDrawer';
import WorkItemsTable from '../components/workflow/WorkItemsTable';
import { usePortalConfig } from '../config/portalConfig';
import { useAllIntegrations, useIntegrationPages } from '../hooks/useIntegrations';
import { useWorkItems, type WorkItem } from '../hooks/useTasks';
import { integrationUrl, runUrl, tasksUrl } from '../paths';
import { CardsSkeleton } from './IntegrationsPage';
import { TableSkeleton } from './TasksPage';

const INBOX_PREVIEW = 5;
/** How many integrations the overview shows; the kind pages list the rest. */
const OVERVIEW_PAGE = 12;

function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
      <Typography variant="h6" component="h2" sx={{ fontWeight: 600 }}>
        {title}
      </Typography>
      {action}
    </Stack>
  );
}

/** Where the user lands: what is waiting on them, then everything published to them. */
export default function OverviewPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const { user, hasScope } = useAuth();
  const canView = (kind: 'aiAgent' | 'automation' | 'workflow') => hasScope(VIEW_SCOPES[kind]);
  const config = usePortalConfig();
  const { data, isLoading, isError, refetch } = useIntegrationPages({ limit: OVERVIEW_PAGE });
  const integrations = data?.pages[0]?.items ?? [];
  const { data: workflows = [] } = useAllIntegrations('workflow', canView('workflow'));
  const { items: waiting, isLoading: loadingWork } = useWorkItems(workflows);
  const [open, setOpen] = useState<WorkItem | null>(null);
  const firstName = user.displayName.split(/\s+/)[0];

  return (
    <PageContent>
      <PageTitle>
        <PageTitle.Header>{t('overview.welcome', { name: firstName })}</PageTitle.Header>
        <PageTitle.SubHeader>{t('overview.subtitle', { org: config.orgName || config.orgHandle })}</PageTitle.SubHeader>
      </PageTitle>

      {isError ? (
        <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => void refetch()}>{t('common.actions.retry')}</Button>}>
          {t('overview.loadError')}
        </Alert>
      ) : (
        <Stack gap={4}>
          <Box component="section">
            <SectionHeader
              title={t('overview.waitingOnYou')}
              action={
                waiting.length > 0 && (
                  <Button size="small" endIcon={<ArrowRight size={16} />} onClick={() => navigate(tasksUrl())}>
                    {t('common.actions.viewAll')}
                  </Button>
                )
              }
            />
            {isLoading || loadingWork ? (
              <TableSkeleton rows={2} />
            ) : waiting.length === 0 ? (
              <Card variant="outlined">
                <EmptyListing compact icon={<CircleCheckBig size={40} />} title={t('overview.caughtUp.title')} description={t('overview.caughtUp.description')} />
              </Card>
            ) : (
              <WorkItemsTable items={waiting.slice(0, INBOX_PREVIEW)} onOpen={setOpen} showIntegration />
            )}
          </Box>

          <Box component="section">
            <SectionHeader title={t('overview.yourIntegrations')} />
            {isLoading ? (
              <CardsSkeleton />
            ) : integrations.length === 0 ? (
              <EmptyListing icon={<PlugZap size={48} />} title={t('overview.nothingPublished.title')} description={t('overview.nothingPublished.description')} />
            ) : (
              <Grid container spacing={2}>
                {integrations.map((i) => (
                  <Grid key={i.id} size={{ xs: 12, sm: 6, lg: 4 }}>
                    <IntegrationCard integration={i} waiting={waiting.filter((w) => w.integration.id === i.id).length} onOpen={() => navigate(integrationUrl(i.id))} />
                  </Grid>
                ))}
              </Grid>
            )}
          </Box>
        </Stack>
      )}

      {open && (
        <TaskDrawer
          item={open}
          onClose={() => setOpen(null)}
          onDone={(message) => toast(message)}
          onOpenRun={(workflowId) => {
            setOpen(null);
            navigate(runUrl(open.integration.id, workflowId));
          }}
        />
      )}
    </PageContent>
  );
}
