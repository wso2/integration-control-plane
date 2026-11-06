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

import { Alert, Box, Button, CircularProgress, MenuItem, Select, Snackbar, Tooltip, Typography } from '@wso2/oxygen-ui';
import { ListChecks } from '@wso2/oxygen-ui-icons-react';
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useMemo, useState, type JSX } from 'react';
import { useSearchParams } from 'react-router';
import SearchField from '../../SearchField';
import { retryWorkflowRead } from '../api/http';
import { workflowKeys } from '../api/queryKeys';
import { markSettling } from '../api/settleRegistry';
import type { BulkRetryResult, Page, TaskStatus } from '../api/types';
import { useWorkflowRoutes, WORK_ITEM_TYPE_PARAM, WORK_ITEM_WORKFLOW_TYPE_PARAM, type WorkItemTypeFilter } from '../routing/useWorkflowRoutes';
import { whenAutoRefresh } from '../shared/autoRefresh';
import type { WorkflowPageSlotProps } from '../shared/WorkflowPageShell';
import { stepStatusLabel } from '../shared/workflowStepStatus';
import BulkReviewActions from './BulkReviewActions';
import { filterWorkItems, mergeWorkItems } from './mergeWorkItems';
import ReviewDetailDrawer from './ReviewDetailDrawer';
import TaskDetailDrawer from './TaskDetailDrawer';
import WorkItemTable from './WorkItemTable';
import { countOf, errorText, humanTaskToWorkItem, isBulkSelectable, reviewToWorkItem, type TaskNotice, type WorkItem } from './workItem';
import * as styles from './HumanTasksPage.styles';

/**
 * The work queue for a workflow integration: everything waiting on a person.
 *
 * Two engine resources back this one table, `/human-tasks` and `/review-activities`, because there
 * is no unified work-items route. They are fetched separately and merged client-side; see
 * `mergeWorkItems` for what that costs.
 *
 * The kind of work item and the definition are held in the URL (`?type=`, `?workflowType=`), which
 * the overview's figures link with, so the page opens on what the figure counted and follows a new
 * link; the environment is the shell's `?env=`.
 */

const PAGE_SIZE = 50;

const STATUS_OPTIONS: TaskStatus[] = ['PENDING', 'COMPLETED', 'FAILED', 'CANCELED', 'TERMINATED'];

/** The cursor for a source's next page, or `undefined` when it has none. */
function nextPageOf<T>(page: Page<T> | null): string | undefined {
  return (page?.hasMore && page.nextPageToken) || undefined;
}

function workItemTypeOf(value: string | null): WorkItemTypeFilter {
  return value === 'task' || value === 'review' ? value : '';
}

/** What a bulk decision did, item by item: the engine answers 200 even when items failed. */
function bulkResultMessage(result: BulkRetryResult): string {
  const errored = result.failed > 0 ? `, ${result.failed} errored` : '';
  return `${countOf(result.requested, 'review')}: ${result.applied} ${result.action === 'retry' ? 'retried' : 'failed'}, ${result.skipped} skipped${errored}.`;
}

export default function HumanTasksPage({ environment, api }: WorkflowPageSlotProps): JSX.Element {
  const { client, connection } = api;
  const { scopeId } = connection;

  const [params, setParams] = useSearchParams();
  const typeFilter = workItemTypeOf(params.get(WORK_ITEM_TYPE_PARAM));
  const workflowTypeFilter = params.get(WORK_ITEM_WORKFLOW_TYPE_PARAM) ?? '';
  const setFilterParam = (key: string, value: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );

  const [search, setSearch] = useState('');
  // Pending is the default because this is a queue: what still needs doing.
  const [statusFilter, setStatusFilter] = useState<TaskStatus | ''>('PENDING');
  const [selected, setSelected] = useState<WorkItem | null>(null);
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState<'retry' | 'fail' | null>(null);
  // Kept through the snackbar's exit, so its text does not vanish as it closes.
  const [notice, setNotice] = useState<TaskNotice & { open: boolean }>({ open: false, message: '', severity: 'success' });
  const notify = (next: TaskNotice) => setNotice({ ...next, open: true });
  const dismissNotice = () => setNotice((current) => ({ ...current, open: false }));

  const { goToWorkflowRuns } = useWorkflowRoutes();
  // A task's parent workflow opens in the Workflows page, on the environment this queue shows.
  const openWorkflow = (workflowId: string) => goToWorkflowRuns({ envId: environment.id, workflowId });

  const { data: definitions = [] } = useQuery({
    queryKey: workflowKeys.definitions(scopeId),
    queryFn: () => client.definitions.list(),
    staleTime: 5 * 60_000,
    retry: retryWorkflowRead,
  });

  // Each source pages on its own cursor; "Load more" asks for the next page of each that has one.
  const tasks = useInfiniteQuery({
    queryKey: workflowKeys.humanTasks(scopeId, { statusFilter, workflowTypeFilter }),
    queryFn: ({ pageParam }) => client.humanTasks.list({ status: statusFilter, parentWorkflowType: workflowTypeFilter, limit: PAGE_SIZE, pageToken: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextPageOf,
    placeholderData: keepPreviousData,
    refetchInterval: () => whenAutoRefresh(15_000),
    retry: retryWorkflowRead,
  });

  // Reviews cannot be listed by definition, so `filterWorkItems` narrows them instead.
  const reviews = useInfiniteQuery({
    queryKey: workflowKeys.reviews(scopeId, { statusFilter }),
    queryFn: ({ pageParam }) => client.reviews.list({ status: statusFilter, limit: PAGE_SIZE, pageToken: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextPageOf,
    placeholderData: keepPreviousData,
    refetchInterval: () => whenAutoRefresh(15_000),
    retry: retryWorkflowRead,
  });

  // An empty answer reads as null (`workflowFetch`), so a page is not assumed to hold `items`.
  const items = useMemo(() => mergeWorkItems((tasks.data?.pages ?? []).flatMap((page) => page?.items ?? []).map(humanTaskToWorkItem), (reviews.data?.pages ?? []).flatMap((page) => page?.items ?? []).map(reviewToWorkItem)), [tasks.data, reviews.data]);
  const hasMore = tasks.hasNextPage || reviews.hasNextPage;
  const loadingMore = tasks.isFetchingNextPage || reviews.isFetchingNextPage;
  const loadMore = () => {
    if (tasks.hasNextPage) void tasks.fetchNextPage();
    if (reviews.hasNextPage) void reviews.fetchNextPage();
  };

  const visible = filterWorkItems(items, { type: typeFilter, search, workflowType: workflowTypeFilter });
  // Only a kind, definition or search narrows the queue; the status picks which part of it is shown.
  const narrowed = !!typeFilter || !!workflowTypeFilter || !!search.trim();
  let emptyMessage = 'No tasks match these filters.';
  if (!narrowed && statusFilter === 'PENDING') emptyMessage = 'Nothing is waiting on a person: no task or review is pending in this environment.';
  else if (!narrowed && !statusFilter) emptyMessage = 'No task or review has been raised in this environment yet.';
  const bulkEligible = visible.filter(isBulkSelectable);
  // Only ids still on screen can be acted on, so a filter change cannot submit a hidden selection.
  const activeSelection = selectedIds.filter((id) => bulkEligible.some((item) => item.taskId === id));
  // A linked definition is offered even before the definitions load, or when this runtime lacks it.
  const definitionOptions = workflowTypeFilter && !definitions.some((d) => d.workflowType === workflowTypeFilter) ? [workflowTypeFilter, ...definitions.map((d) => d.workflowType)] : definitions.map((d) => d.workflowType);

  const leaveBulkMode = () => {
    setSelectedIds([]);
    setBulkMode(false);
  };

  const bulkDone = (result: BulkRetryResult) => {
    const outcomes = result.items ?? [];
    // What errored stays selected, so it can be tried again; the rest has been decided.
    const errored = outcomes.filter((item) => item.outcome === 'FAILED').map((item) => item.taskId);
    // The decided reviews' runs move on; their views keep polling until the engine catches up.
    outcomes
      .filter((item) => item.outcome === 'APPLIED')
      .forEach((outcome) => {
        const parent = items.find((item) => item.taskId === outcome.taskId)?.parentWorkflowId;
        if (parent) markSettling(parent);
      });
    setSelectedIds(errored);
    if (errored.length === 0) setBulkMode(false);
    notify({ message: bulkResultMessage(result), severity: result.failed > 0 ? 'error' : 'success' });
  };

  const sourceError = (source: string, error: Error, retry: () => void) => (
    <Alert
      severity="error"
      sx={styles.alert}
      action={
        <Button color="inherit" size="small" onClick={retry}>
          Retry
        </Button>
      }>
      {`Could not load ${source}. ${errorText(error, '')}`.trim()}
    </Alert>
  );

  const bothFailed = !!tasks.error && !!reviews.error && items.length === 0;

  return (
    <Box>
      <Box sx={styles.searchRow}>
        <SearchField value={search} onChange={setSearch} placeholder="Search by task, workflow ID or task ID" sx={styles.searchField} />
      </Box>

      <Box sx={styles.toolbar}>
        <Select size="small" value={typeFilter} onChange={(event) => setFilterParam(WORK_ITEM_TYPE_PARAM, event.target.value)} displayEmpty inputProps={{ 'aria-label': 'Type' }} sx={styles.filterSelect}>
          <MenuItem value="">All</MenuItem>
          <MenuItem value="task">Tasks</MenuItem>
          <MenuItem value="review">Reviews</MenuItem>
        </Select>
        <Select size="small" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as TaskStatus | '')} displayEmpty inputProps={{ 'aria-label': 'Status' }} sx={styles.filterSelect}>
          <MenuItem value="">Any status</MenuItem>
          {STATUS_OPTIONS.map((status) => (
            <MenuItem key={status} value={status}>
              {stepStatusLabel(status)}
            </MenuItem>
          ))}
        </Select>
        <Select size="small" value={workflowTypeFilter} onChange={(event) => setFilterParam(WORK_ITEM_WORKFLOW_TYPE_PARAM, event.target.value)} displayEmpty inputProps={{ 'aria-label': 'Workflow definition' }} sx={styles.filterSelect}>
          <MenuItem value="">All workflow definitions</MenuItem>
          {definitionOptions.map((workflowType) => (
            <MenuItem key={workflowType} value={workflowType}>
              {workflowType}
            </MenuItem>
          ))}
        </Select>
        <Box sx={styles.spacer} />
        {!bulkMode && (
          <Tooltip placement="top" title={bulkEligible.length > 0 ? `Choose several pending reviews and retry or fail them together. ${bulkEligible.length} can be selected.` : 'Bulk decisions apply to pending reviews; there are none in this list.'}>
            <span>
              <Button
                variant="outlined"
                size="small"
                startIcon={<ListChecks size={16} />}
                disabled={bulkEligible.length === 0}
                onClick={() => {
                  setSelectedIds([]);
                  setBulkMode(true);
                }}>
                Select reviews
              </Button>
            </span>
          </Tooltip>
        )}
      </Box>

      {/* Bulk decisions are a mode you enter: the bar says what is chosen and acts on it,
          and Done leaves the mode. */}
      {bulkMode && (
        <Box sx={styles.bulkBar}>
          <Typography variant="body2" sx={styles.bulkBarText}>
            {activeSelection.length > 0 ? `${activeSelection.length} of ${countOf(bulkEligible.length, 'pending review')} selected.` : `Choose the pending reviews to decide together; ${bulkEligible.length} can be selected.`}{' '}
            <Typography component="span" variant="body2" sx={styles.placeholder}>
              Human tasks are completed one at a time, through their own form.
            </Typography>
          </Typography>
          <Button variant="contained" size="small" disabled={activeSelection.length === 0} onClick={() => setBulkAction('retry')}>
            Retry Selected
          </Button>
          <Button variant="outlined" color="error" size="small" disabled={activeSelection.length === 0} onClick={() => setBulkAction('fail')}>
            Fail Selected
          </Button>
          <Button variant="text" color="inherit" size="small" onClick={leaveBulkMode}>
            Done
          </Button>
        </Box>
      )}

      {/* One source failing leaves the other's rows on screen. */}
      {tasks.error && sourceError('human tasks', tasks.error, () => void tasks.refetch())}
      {reviews.error && sourceError('reviews', reviews.error, () => void reviews.refetch())}

      {!bothFailed && (
        <WorkItemTable
          items={visible}
          selectable={bulkMode}
          selectedIds={activeSelection}
          onToggleAll={() => setSelectedIds(activeSelection.length === bulkEligible.length ? [] : bulkEligible.map((item) => item.taskId))}
          onToggleSelect={(taskId) => setSelectedIds((current) => (current.includes(taskId) ? current.filter((id) => id !== taskId) : [...current, taskId]))}
          loading={tasks.isPending || reviews.isPending}
          emptyMessage={emptyMessage}
          onOpen={setSelected}
        />
      )}

      {hasMore && (
        <Box sx={styles.loadMore}>
          <Button variant="outlined" size="small" onClick={loadMore} disabled={loadingMore} startIcon={loadingMore ? <CircularProgress size={14} color="inherit" /> : undefined}>
            Load more
          </Button>
        </Box>
      )}

      {bulkAction && <BulkReviewActions action={bulkAction} taskIds={activeSelection} api={api} onClose={() => setBulkAction(null)} onDone={bulkDone} />}

      <TaskDetailDrawer item={selected} api={api} onOpenWorkflow={openWorkflow} onNotify={notify} onClose={() => setSelected(null)} />
      <ReviewDetailDrawer item={selected} api={api} onOpenWorkflow={openWorkflow} onNotify={notify} onClose={() => setSelected(null)} />

      <Snackbar open={notice.open} autoHideDuration={5000} onClose={dismissNotice} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        <Alert onClose={dismissNotice} severity={notice.severity} variant="filled">
          {notice.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
