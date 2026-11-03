/*
 * Copyright (c) 2026, WSO2 LLC. (http://www.wso2.com). All Rights Reserved.
 *
 * This software is the property of WSO2 LLC. and its suppliers, if any.
 * Dissemination of any information or reproduction of any material contained
 * herein is strictly forbidden, unless permitted by WSO2 in accordance with
 * the WSO2 Commercial License available at http://wso2.com/licenses.
 * For specific language governing the permissions and limitations under
 * this license, please see the license as well as any agreement you've
 * entered into with WSO2 governing the purchase of this software and any
 * associated services.
 */

import { Alert, Badge, Button, IconButton, ListingTable, MenuItem, Select, Stack, Tab, Tabs, Tooltip, Typography } from '@wso2/oxygen-ui';
import { CircleCheckBig, History, Play, RefreshCw } from '@wso2/oxygen-ui-icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { useWorkItems, type WorkItem } from '../../hooks/useTasks';
import { currentLanguage } from '../../i18n';
import { managedTracks, managementEndpoint, useRuns } from '../../hooks/useWorkflows';
import type { Integration } from '../../types/portal';
import { RUN_STATUS_FILTERS, type RunStatusFilter, type RunSummary } from '../../types/workflow';
import { formatDateTime, formatDuration, formatRelative, humanize } from '../../utils/time';
import { ListFooter, rowOpenProps, StatusChip } from '../detail';
import EmptyListing from '../EmptyListing';
import IntegrationHeader, { PILL_SELECT_SX, TrackSelect } from '../IntegrationHeader';
import { useToast } from '../Toast';
import RunDrawer from './RunDrawer';
import StartDrawer from './StartDrawer';
import TaskDrawer from './TaskDrawer';
import WorkItemsTable from './WorkItemsTable';
import { TableSkeleton } from '../../pages/TasksPage';

type TabId = 'runs' | 'tasks';

function RunsTable({ runs, onOpen }: { runs: RunSummary[]; onOpen: (run: RunSummary) => void }) {
  const { t } = useTranslation();
  return (
    <ListingTable.Container disablePaper>
      <ListingTable variant="card" density="compact" sx={{ '& .MuiTableBody-root .MuiTableCell-root': { py: 1.5 } }}>
        <ListingTable.Head>
          <ListingTable.Row>
            <ListingTable.Cell>{t('workflow.columns.workflow')}</ListingTable.Cell>
            <ListingTable.Cell>{t('workflow.columns.status')}</ListingTable.Cell>
            <ListingTable.Cell>{t('workflow.columns.started')}</ListingTable.Cell>
            <ListingTable.Cell>{t('workflow.columns.duration')}</ListingTable.Cell>
          </ListingTable.Row>
        </ListingTable.Head>
        <ListingTable.Body>
          {runs.map((run) => (
            <ListingTable.Row key={run.runId} variant="card" {...rowOpenProps(() => onOpen(run))} aria-label={t('workflow.view.openRun', { id: run.workflowId })}>
              <ListingTable.Cell>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  {humanize(run.workflowType)}
                </Typography>
              </ListingTable.Cell>
              <ListingTable.Cell>
                <StatusChip status={run.status} />
              </ListingTable.Cell>
              <ListingTable.Cell>
                <Typography variant="body2" title={formatDateTime(run.startTime)}>
                  {formatRelative(run.startTime)}
                </Typography>
              </ListingTable.Cell>
              <ListingTable.Cell>
                <Typography variant="body2" color="text.secondary">
                  {formatDuration(run.startTime, run.closeTime)}
                </Typography>
              </ListingTable.Cell>
            </ListingTable.Row>
          ))}
        </ListingTable.Body>
      </ListingTable>
    </ListingTable.Container>
  );
}

/** A workflow: start it, follow its runs, and act on what they wait for. */
export default function WorkflowView({ integration }: { integration: Integration }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const tracks = managedTracks(integration);
  const [trackId, setTrackId] = useState(tracks[0]?.id);
  const url = managementEndpoint(integration, trackId);
  const [tab, setTab] = useState<TabId>('runs');
  const [status, setStatus] = useState<RunStatusFilter | ''>('');
  const runs = useRuns(url, status);
  const { items: waiting } = useWorkItems([integration]);
  const [starting, setStarting] = useState(false);
  const [task, setTask] = useState<WorkItem | null>(null);

  const openWorkflowId = params.get('workflow');
  const openRunId = params.get('run') ?? undefined;
  const list = runs.data?.pages.flatMap((p) => p.items) ?? [];
  const openRun = (workflowId: string, runId?: string) => setParams(runId ? { workflow: workflowId, run: runId } : { workflow: workflowId });
  const closeRun = () => setParams({});
  const statusLabel = (s: RunStatusFilter) => t(`workflow.runStatus.${s}`);

  if (!url) return <Alert severity="info">{t('workflow.view.noEndpoint')}</Alert>;

  return (
    <>
      <IntegrationHeader
        integration={integration}
        actions={
          <>
            <TrackSelect tracks={tracks} value={trackId} onChange={setTrackId} />
            <Button variant="contained" startIcon={<Play size={16} />} onClick={() => setStarting(true)}>
              {t('common.actions.start')}
            </Button>
          </>
        }
      />

      <Tabs value={tab} onChange={(_, v: TabId) => setTab(v)} sx={{ mb: 2.5, borderBottom: 1, borderColor: 'divider' }}>
        <Tab value="runs" label={t('workflow.view.executions')} />
        <Tab
          value="tasks"
          label={
            <Badge badgeContent={waiting.length} color="primary" sx={{ '& .MuiBadge-badge': { right: -14, top: 2 } }}>
              {t('workflow.view.tasks')}
            </Badge>
          }
        />
      </Tabs>

      {tab === 'runs' ? (
        <>
          <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 2 }}>
            <Select size="small" value={status} displayEmpty onChange={(e) => setStatus(e.target.value as RunStatusFilter | '')} sx={{ ...PILL_SELECT_SX, minWidth: 150 }} inputProps={{ 'aria-label': t('workflow.view.statusFilter') }}>
              <MenuItem value="">{t('workflow.view.allRuns')}</MenuItem>
              {RUN_STATUS_FILTERS.map((s) => (
                <MenuItem key={s} value={s}>
                  {statusLabel(s)}
                </MenuItem>
              ))}
            </Select>
            <Tooltip title={t('common.actions.refresh')}>
              <IconButton size="small" aria-label={t('common.actions.refresh')} onClick={() => void runs.refetch()} disabled={runs.isFetching}>
                <RefreshCw size={16} style={{ animation: runs.isFetching ? 'spin 1s linear infinite' : undefined }} />
              </IconButton>
            </Tooltip>
            {runs.dataUpdatedAt > 0 && (
              <Typography variant="caption" color="text.secondary">
                {t('workflow.view.updatedAt', { time: new Date(runs.dataUpdatedAt).toLocaleTimeString(currentLanguage(), { hour: 'numeric', minute: '2-digit', second: '2-digit' }) })}
              </Typography>
            )}
          </Stack>
          {runs.isLoading ? (
            <TableSkeleton />
          ) : runs.isError ? (
            <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => void runs.refetch()}>{t('common.actions.retry')}</Button>}>
              {runs.error.message}
            </Alert>
          ) : list.length === 0 ? (
            <EmptyListing
              icon={<History size={48} />}
              title={status ? t(`workflow.view.noRunsWithStatus.${status}`) : t('workflow.view.noRuns')}
              description={status ? t('workflow.view.chooseAnotherStatus') : t('workflow.view.startFirstRun')}
              actionLabel={status ? t('workflow.view.showAllRuns') : t('common.actions.start')}
              onAction={() => (status ? setStatus('') : setStarting(true))}
            />
          ) : (
            <>
              <RunsTable runs={list} onOpen={(run) => openRun(run.workflowId, run.runId)} />
              <ListFooter summary={t(runs.hasNextPage ? 'common.list.runsMore' : 'common.list.runs', { count: list.length })} hasMore={!!runs.hasNextPage} loadingMore={runs.isFetchingNextPage} onLoadMore={() => void runs.fetchNextPage()} />
            </>
          )}
        </>
      ) : waiting.length === 0 ? (
        <EmptyListing icon={<CircleCheckBig size={48} />} title={t('workflow.view.nothingWaiting.title')} description={t('workflow.view.nothingWaiting.description')} />
      ) : (
        <WorkItemsTable items={waiting} onOpen={setTask} />
      )}

      {openWorkflowId && (
        <RunDrawer
          key={`${openWorkflowId}:${openRunId ?? ''}`}
          integration={integration}
          url={url}
          workflowId={openWorkflowId}
          runId={openRunId}
          startTime={list.find((r) => r.runId === openRunId)?.startTime}
          onClose={closeRun}
          onOpenTask={setTask}
        />
      )}
      {starting && (
        <StartDrawer
          name={integration.displayName}
          url={url}
          onClose={() => setStarting(false)}
          onStarted={(run) => {
            setStarting(false);
            setTab('runs');
            toast(t('workflow.view.runStarted'));
            openRun(run.workflowId, run.runId);
          }}
        />
      )}
      {task && (
        <TaskDrawer
          item={task}
          onClose={() => setTask(null)}
          onDone={(message) => toast(message)}
          onOpenRun={(workflowId) => {
            setTask(null);
            openRun(workflowId);
          }}
        />
      )}
    </>
  );
}
