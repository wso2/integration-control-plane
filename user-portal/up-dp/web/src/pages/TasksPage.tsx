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

import { Alert, IconButton, MenuItem, PageContent, PageTitle, Select, Skeleton, Stack, Tab, Tabs } from '@wso2/oxygen-ui';
import { CircleCheckBig, Inbox, Lock, RefreshCw } from '@wso2/oxygen-ui-icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useAuth, VIEW_SCOPES } from '../auth';
import EmptyListing from '../components/EmptyListing';
import SearchField, { FILTER_SELECT_SX } from '../components/SearchField';
import { useToast } from '../components/Toast';
import TaskDrawer from '../components/workflow/TaskDrawer';
import WorkItemsTable from '../components/workflow/WorkItemsTable';
import { useAllIntegrations } from '../hooks/useIntegrations';
import { useWorkItems, type WorkItem, type WorkItemStatus } from '../hooks/useTasks';
import { runUrl } from '../paths';

type TypeFilter = 'all' | 'task' | 'review';

export function TableSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <Stack gap={1} aria-busy="true">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} variant="rounded" height={56} />
      ))}
    </Stack>
  );
}

/** Every task and approval waiting on the user, across all workflows. */
export default function TasksPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const { hasScope } = useAuth();
  const allowed = hasScope(VIEW_SCOPES.workflow);
  const { data: workflows = [], isLoading: loadingIntegrations } = useAllIntegrations('workflow', allowed);
  const [status, setStatus] = useState<WorkItemStatus>('PENDING');
  const { items, isLoading, isFetching, unreachable, refetch } = useWorkItems(workflows, status);
  const [query, setQuery] = useState('');
  const [type, setType] = useState<TypeFilter>('all');
  const [workflow, setWorkflow] = useState('all');
  const [open, setOpen] = useState<WorkItem | null>(null);

  const q = query.trim().toLowerCase();
  const shown = items.filter(
    (item) =>
      (type === 'all' || item.kind === type) &&
      (workflow === 'all' || item.integration.id === workflow) &&
      (!q || `${item.title} ${item.name} ${item.workflowId} ${item.integration.displayName}`.toLowerCase().includes(q)),
  );

  const loading = loadingIntegrations || isLoading;

  if (!allowed)
    return (
      <PageContent>
        <EmptyListing icon={<Lock size={48} />} title={t('workflow.tasksPage.noAccess.title')} description={t('workflow.tasksPage.noAccess.description')} />
      </PageContent>
    );

  return (
    <PageContent>
      <PageTitle>
        <PageTitle.Header>
          <Stack direction="row" alignItems="center" gap={1}>
            {t('workflow.tasksPage.title')}
            <IconButton size="small" aria-label={t('common.actions.refresh')} onClick={() => void refetch()} disabled={isFetching}>
              <RefreshCw size={18} style={{ animation: isFetching && !loading ? 'spin 1s linear infinite' : undefined }} />
            </IconButton>
          </Stack>
        </PageTitle.Header>
        <PageTitle.SubHeader>{t('workflow.tasksPage.subtitle')}</PageTitle.SubHeader>
      </PageTitle>

      <Tabs value={status} onChange={(_, v: WorkItemStatus) => setStatus(v)} sx={{ mb: 2 }}>
        <Tab value="PENDING" label={t('workflow.tasksPage.waitingOnYou')} />
        <Tab value="COMPLETED" label={t('workflow.tasksPage.completed')} />
      </Tabs>

      <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} alignItems={{ sm: 'center' }} sx={{ mb: 2.5 }}>
        <SearchField value={query} onChange={setQuery} placeholder={t('workflow.tasksPage.searchPlaceholder')} fullWidth />
        <Select size="small" value={type} onChange={(e) => setType(e.target.value as TypeFilter)} sx={{ ...FILTER_SELECT_SX, minWidth: 140 }} inputProps={{ 'aria-label': t('workflow.tasksPage.typeFilter') }}>
          <MenuItem value="all">{t('workflow.tasksPage.allTypes')}</MenuItem>
          <MenuItem value="task">{t('workflow.tasksPage.tasks')}</MenuItem>
          <MenuItem value="review">{t('workflow.tasksPage.approvals')}</MenuItem>
        </Select>
        {workflows.length > 1 && (
          <Select size="small" value={workflow} onChange={(e) => setWorkflow(e.target.value)} sx={{ ...FILTER_SELECT_SX, minWidth: 180 }} inputProps={{ 'aria-label': t('workflow.tasksPage.workflowFilter') }}>
            <MenuItem value="all">{t('workflow.tasksPage.allWorkflows')}</MenuItem>
            {workflows.map((w) => (
              <MenuItem key={w.id} value={w.id}>
                {w.displayName}
              </MenuItem>
            ))}
          </Select>
        )}
      </Stack>

      {unreachable.map((i) => (
        <Alert key={i.id} severity="warning" sx={{ mb: 2 }}>
          {t('workflow.tasksPage.unreachable', { name: i.displayName })}
        </Alert>
      ))}

      {loading ? (
        <TableSkeleton />
      ) : shown.length === 0 ? (
        q || type !== 'all' || workflow !== 'all' ? (
          <EmptyListing icon={<Inbox size={48} />} title={t('workflow.tasksPage.noMatches.title')} description={t('workflow.tasksPage.noMatches.description')} />
        ) : status === 'PENDING' ? (
          <EmptyListing icon={<CircleCheckBig size={48} />} title={t('workflow.tasksPage.caughtUp.title')} description={t('workflow.tasksPage.caughtUp.description')} />
        ) : (
          <EmptyListing icon={<Inbox size={48} />} title={t('workflow.tasksPage.nothingCompleted.title')} description={t('workflow.tasksPage.nothingCompleted.description')} />
        )
      ) : (
        <WorkItemsTable items={shown} onOpen={setOpen} showIntegration completed={status === 'COMPLETED'} />
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
