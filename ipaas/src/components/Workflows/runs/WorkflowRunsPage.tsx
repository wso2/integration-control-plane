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

import { Alert, Box, Button, CircularProgress, InputAdornment, ListingTable, MenuItem, Skeleton, TextField, Tooltip, Typography } from '@wso2/oxygen-ui';
import { Search, Workflow } from '@wso2/oxygen-ui-icons-react';
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useEffect, useState, type JSX, type ReactNode } from 'react';
import { useParams, useSearchParams } from 'react-router';
import EmptyListing from '../../EmptyListing';
import { formatDateTime } from '../../../utils/time';
import { retryWorkflowRead } from '../api/http';
import { workflowKeys } from '../api/queryKeys';
import { DEFAULT_SETTLE_MS, isSettling } from '../api/settleRegistry';
import type { WorkflowInstanceSummary, WorkflowStatusFilter } from '../api/types';
import { COUNT_PAGE } from '../overview/workflowStats';
import { useWorkflowRoutes, WORKFLOW_CLOSED_PARAM, WORKFLOW_ID_PARAM, WORKFLOW_STATUS_PARAM, WORKFLOW_TYPE_PARAM } from '../routing/useWorkflowRoutes';
import { whenAutoRefresh } from '../shared/autoRefresh';
import { sortByStartTimeDesc } from '../shared/sortByStartTime';
import StatusChip from '../shared/StatusChip';
import type { WorkflowPageSlotProps } from '../shared/WorkflowPageShell';
import { WORKFLOW_STATUS_CHIP_COLOR, WORKFLOW_STATUS_LABEL, WORKFLOW_STATUS_OPTIONS, WORKFLOW_STATUS_ROW_STATUS } from '../shared/workflowStatus';
import { WORKFLOW_TIME_RANGE_OPTIONS, workflowTimeRangeFrom, type WorkflowTimeRange } from '../shared/workflowTimeRangeFilter';
import StartWorkflowDialog from './StartWorkflowDialog';
import UserPortalPrompt from '../../UserPortal/UserPortalPrompt';
import { useUserPortalServed } from '../../../hooks/useUserPortal';
import WorkflowRunDetailDrawer from './WorkflowRunDetailDrawer';
import * as styles from './WorkflowRunsPage.styles';

const PAGE_SIZE = 20;
/** How often the list polls while a run in it is open, or while a linked run has not appeared. */
const OPEN_RUNS_POLL_MS = 10_000;
const LINKED_RUN_POLL_MS = 3000;

const COLUMNS = ['Workflow ID', 'Run ID', 'Workflow Definition Name', 'Status', 'Started'];
const SKELETON_ROWS = [0, 1, 2, 3, 4];

/** The newest of a workflow's runs: the one a link to the workflow means. */
const newest = (runs: WorkflowInstanceSummary[]) => sortByStartTimeDesc(runs)[0];

/** The time select's value for a window of closed runs, kept apart from the start-time windows. */
const CLOSED_PREFIX = 'closed:';

/** A table row holding one message across every column. */
function MessageRow({ children }: { children: ReactNode }): JSX.Element {
  return (
    <ListingTable.Row>
      <ListingTable.Cell colSpan={COLUMNS.length} sx={styles.emptyCell}>
        <Typography variant="body2" color="text.secondary">
          {children}
        </Typography>
      </ListingTable.Cell>
    </ListingTable.Row>
  );
}

/**
 * Workflow executions list for a workflow integration.
 * It renders inside `WorkflowPageShell`, which owns the track bar, the environment, the auto-refresh
 * switch and the refresh button, and every state before the connection is ready.
 *
 * Data comes from the integration's own Management API: status and time-window filters and
 * `limit`/`pageToken` pagination are sent as real query params; the definition filter and the
 * free-text search box refine the runs loaded so far in the console, and Load more reaches further
 * back for both. The status and the definition are held in the URL (`?status=`, `?type=`), so an
 * overview figure links to them and the page follows a later link.
 */
export default function WorkflowRunsPage({ component, environment, api }: WorkflowPageSlotProps): JSX.Element {
  const portalServed = useUserPortalServed(environment.id);
  const { client } = api;
  const { scopeId } = api.connection;
  const { goToWorkflowRuns } = useWorkflowRoutes();

  const [params, setParams] = useSearchParams();
  const setParam = (key: string, value: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );
  const workflowNameFilter = params.get(WORKFLOW_TYPE_PARAM) ?? '';
  // Only a status the filter offers; anything else would select nothing in the dropdown.
  const statusParam = params.get(WORKFLOW_STATUS_PARAM);
  const statusFilter: WorkflowStatusFilter | '' = WORKFLOW_STATUS_OPTIONS.find((status) => status === statusParam) ?? '';
  const [timeRangeFilter, setTimeRangeFilter] = useState<WorkflowTimeRange>('');
  // A figure of closed runs (Failed (24h)) links its window; the list then filters on close time, as the figure counts.
  const closedParam = params.get(WORKFLOW_CLOSED_PARAM);
  const closedWithin = WORKFLOW_TIME_RANGE_OPTIONS.find((option) => option.value !== '' && option.value === closedParam);
  const selectTimeRange = (value: string) => {
    if (value.startsWith(CLOSED_PREFIX)) return;
    setParam(WORKFLOW_CLOSED_PARAM, '');
    setTimeRangeFilter(value as WorkflowTimeRange);
  };
  const [search, setSearch] = useState('');
  const [startOpen, setStartOpen] = useState(false);

  // `/workflows/:runId` opens that run directly, so a run is linkable; `?workflowId=` opens that
  // workflow's newest run, for a link that knows only the workflow (a task's parent). What is
  // remembered is which link was handled, not whether one was, so a later link is followed too.
  const { runId: deepLinkRunId } = useParams<{ runId?: string }>();
  const linkedWorkflowId = params.get(WORKFLOW_ID_PARAM) ?? '';
  let runLink: string | null = null;
  if (deepLinkRunId) {
    runLink = `run:${deepLinkRunId}`;
  } else if (linkedWorkflowId) {
    runLink = `workflow:${linkedWorkflowId}`;
  }
  const [handledRunLink, setHandledRunLink] = useState<string | null>(null);
  const runLinkPending = !!runLink && handledRunLink !== runLink;
  const [selectedRun, setSelectedRun] = useState<WorkflowInstanceSummary | null>(null);
  // A run belongs to one environment: switching to another closes its execution view.
  const [selectedIn, setSelectedIn] = useState(scopeId);
  if (selectedIn !== scopeId) {
    setSelectedIn(scopeId);
    setSelectedRun(null);
  }

  // A run just started is not listed until the visibility store catches up, so the list polls for
  // a linked run for as long as that lag lasts, and not forever for a run the first page never has.
  const waitKey = runLink ? `${scopeId}|${runLink}` : null;
  const [waitedFor, setWaitedFor] = useState<string | null>(null);
  useEffect(() => {
    if (!waitKey) {
      return undefined;
    }
    const timer = setTimeout(() => setWaitedFor(waitKey), DEFAULT_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [waitKey]);
  const runLinkWaited = waitKey !== null && waitedFor === waitKey;

  const { data: definitions = [], isPending: definitionsPending } = useQuery({
    queryKey: workflowKeys.definitions(scopeId),
    queryFn: () => client.definitions.list(),
    staleTime: 5 * 60 * 1000,
    retry: retryWorkflowRead,
  });
  const workflowNameOptions = definitions.map((d) => d.workflowType);
  // A link may name a definition this deployment no longer lists; it stays selectable as the filter.
  if (workflowNameFilter && !workflowNameOptions.includes(workflowNameFilter)) {
    workflowNameOptions.push(workflowNameFilter);
  }

  // The definition is filtered here, never sent: a type-filtered listing is a query shape some
  // workflow servers answer UNIMPLEMENTED, which leaves the engine unable to list at all. While a
  // definition is picked, the list reads the engine's largest page, the one the overview's figures
  // count, so a figure opens on the runs it counted.
  const pageSize = workflowNameFilter ? COUNT_PAGE : PAGE_SIZE;

  // Every page loaded is part of one query: a poll reads them all again together, and a filter
  // change starts over from the first page, so neither drops the runs loaded so far nor mixes
  // another filter's runs into them.
  const {
    data: runPages,
    isPending: firstPagePending,
    isPlaceholderData,
    error: listError,
    refetch: refetchRuns,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: workflowKeys.instances(scopeId, { statusFilter, timeRangeFilter, closedWithin: closedWithin?.value ?? '', pageSize }),
    queryFn: ({ pageParam }) =>
      client.instances.list({
        status: statusFilter || undefined,
        startTimeFrom: closedWithin ? undefined : workflowTimeRangeFrom(timeRangeFilter),
        closeTimeFrom: closedWithin ? workflowTimeRangeFrom(closedWithin.value) : undefined,
        limit: pageSize,
        pageToken: pageParam,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextPageToken ?? undefined,
    placeholderData: keepPreviousData,
    retry: retryWorkflowRead,
    // Poll only while something is actually in flight: this page is the kind that gets left open
    // for hours. A run just acted on or reset counts, for the window the engine's list lags it.
    refetchInterval: (query) => {
      if (runLinkPending && !runLinkWaited) {
        return whenAutoRefresh(LINKED_RUN_POLL_MS);
      }
      const inFlight = (query.state.data?.pages ?? []).some((page) => page.items.some((run) => run.status === 'RUNNING' || run.status === 'SUSPENDED' || isSettling(run.workflowId)));
      return whenAutoRefresh(inFlight ? OPEN_RUNS_POLL_MS : false);
    },
  });

  // Newest first: the engine pages open runs ahead of closed ones.
  const allRuns = sortByStartTimeDesc((runPages?.pages ?? []).flatMap((page) => page.items));
  const runs = workflowNameFilter ? allRuns.filter((run) => run.workflowType === workflowNameFilter) : allRuns;
  // The open run as the polled list has it now, so its status follows a close or a cancel; the row
  // stored when it was opened stands in once it is off the loaded pages.
  const shownRun = selectedRun ? (allRuns.find((run) => run.workflowId === selectedRun.workflowId && run.runId === selectedRun.runId) ?? selectedRun) : null;

  // A link to a workflow (a task's parent) may name one older than the runs loaded, so it is also
  // looked up by its id. The lookup is a query of its own: a server that cannot filter by workflow
  // id fails the lookup, never the list.
  const { data: linkedWorkflowRuns, isFetching: isLookingUpLinkedWorkflow } = useQuery({
    queryKey: workflowKeys.instances(scopeId, { workflowId: linkedWorkflowId }),
    queryFn: () => client.instances.list({ workflowId: linkedWorkflowId, limit: PAGE_SIZE }),
    enabled: runLinkPending && !deepLinkRunId && !!linkedWorkflowId,
    retry: false,
  });

  // Open the linked run once, when it first appears; not on every render, or closing the drawer
  // would immediately reopen it. Any loaded run, filtered out or not: the link names a run, not a
  // view. A workflow's newest run is the one a link to the workflow means.
  if (runLinkPending) {
    const match = deepLinkRunId ? allRuns.find((run) => run.runId === deepLinkRunId) : newest([...allRuns, ...(linkedWorkflowRuns?.items ?? [])].filter((run) => run.workflowId === linkedWorkflowId));
    if (match) {
      setSelectedRun(match);
      setHandledRunLink(runLink);
    }
  }
  // Still not found once the list has caught up: say so, rather than open nothing silently.
  const runLinkNotFound = runLinkPending && runLinkWaited && !!runPages && !isPlaceholderData && !isLookingUpLinkedWorkflow;

  const query = search.trim().toLowerCase();
  const visibleRuns = query ? runs.filter((run) => run.workflowId.toLowerCase().includes(query) || run.runId.toLowerCase().includes(query) || run.workflowType.toLowerCase().includes(query)) : runs;
  const narrowed = !!query || !!statusFilter || !!workflowNameFilter || !!timeRangeFilter || !!closedWithin;

  // An error with runs on screen is shown beneath them; only one with nothing to show replaces them.
  const listErrorMessage = listError instanceof Error ? listError.message : 'Could not load workflow executions.';
  const retryList = (
    <Button color="inherit" size="small" onClick={() => void refetchRuns()}>
      Retry
    </Button>
  );

  let startHelp = '';
  if (!definitionsPending && definitions.length === 0) {
    startHelp = 'The workflow engine lists no workflow definitions to start.';
  }

  let listing: ReactNode;
  if (listError && (!runPages || isPlaceholderData)) {
    listing = (
      <Alert severity="error" action={retryList}>
        {listErrorMessage}
      </Alert>
    );
  } else if (!firstPagePending && allRuns.length === 0 && !narrowed && !hasNextPage) {
    listing = <EmptyListing icon={<Workflow size={48} />} title="No workflow runs" description="No workflow has run in this environment yet." showAction={definitions.length > 0} actionLabel="Start New Workflow" onAction={() => setStartOpen(true)} />;
  } else {
    let rows: ReactNode;
    if (firstPagePending) {
      rows = SKELETON_ROWS.map((row) => (
        <ListingTable.Row key={row}>
          {COLUMNS.map((column) => (
            <ListingTable.Cell key={column}>{column === 'Status' ? <Skeleton variant="rounded" width={72} height={20} /> : <Skeleton width="80%" />}</ListingTable.Cell>
          ))}
        </ListingTable.Row>
      ));
    } else if (visibleRuns.length === 0) {
      // The definition and the search only see the runs loaded so far.
      let message = 'No workflow runs found.';
      if (allRuns.length > 0 && hasNextPage) {
        message = 'None of the runs loaded so far match. Load more to look further back.';
      } else if (narrowed) {
        message = 'No workflow runs match these filters.';
      }
      rows = <MessageRow>{message}</MessageRow>;
    } else {
      rows = visibleRuns.map((run) => (
        <ListingTable.Row
          key={run.runId}
          hover
          clickable
          tabIndex={0}
          aria-label={`Open run ${run.runId} of ${run.workflowId}`}
          sx={styles.runRow(WORKFLOW_STATUS_ROW_STATUS[run.status] === 'error')}
          onClick={() => setSelectedRun(run)}
          onKeyDown={(event) => {
            if (event.target === event.currentTarget && event.key === 'Enter') setSelectedRun(run);
          }}>
          <ListingTable.Cell sx={styles.idCell}>{run.workflowId}</ListingTable.Cell>
          <ListingTable.Cell sx={styles.idCell}>{run.runId}</ListingTable.Cell>
          <ListingTable.Cell>{run.workflowType}</ListingTable.Cell>
          <ListingTable.Cell>
            <StatusChip label={WORKFLOW_STATUS_LABEL[run.status] ?? run.status} color={WORKFLOW_STATUS_CHIP_COLOR[run.status] ?? 'default'} />
          </ListingTable.Cell>
          <ListingTable.Cell>
            <Typography variant="body2" noWrap>
              {formatDateTime(run.startTime)}
            </Typography>
          </ListingTable.Cell>
        </ListingTable.Row>
      ));
    }
    listing = (
      <>
        <ListingTable.Container>
          <ListingTable density="compact" aria-label="Workflow runs" aria-busy={firstPagePending}>
            <ListingTable.Head>
              <ListingTable.Row>
                {COLUMNS.map((column) => (
                  <ListingTable.Cell key={column} sx={styles.headerCell}>
                    {column}
                  </ListingTable.Cell>
                ))}
              </ListingTable.Row>
            </ListingTable.Head>
            <ListingTable.Body>{rows}</ListingTable.Body>
          </ListingTable>
        </ListingTable.Container>

        {listError && (
          <Alert severity="error" action={retryList} sx={styles.listError}>
            {listErrorMessage}
          </Alert>
        )}

        {hasNextPage && !isPlaceholderData && (
          <Box sx={styles.footer}>
            <Button variant="outlined" size="small" onClick={() => void fetchNextPage()} disabled={isFetchingNextPage} startIcon={isFetchingNextPage ? <CircularProgress size={14} color="inherit" /> : undefined}>
              Load more
            </Button>
          </Box>
        )}
      </>
    );
  }

  return (
    <Box>
      {/* The search, and the page's own action at the far end of the same row. */}
      <Box sx={styles.searchActionRow}>
        <TextField
          size="small"
          placeholder="Search by workflow ID"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          sx={styles.searchField}
          slotProps={{
            htmlInput: { 'aria-label': 'Search by workflow ID' },
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <Search size={18} />
                </InputAdornment>
              ),
            },
          }}
        />
        <Box sx={styles.toolbarSpacer} />
        <Tooltip title={startHelp}>
          <span>
            <Button variant="contained" disabled={definitions.length === 0} onClick={() => setStartOpen(true)}>
              Start New Workflow
            </Button>
          </span>
        </Tooltip>
      </Box>

      <Box sx={styles.toolbar}>
        <TextField select size="small" sx={styles.filterSelect} value={statusFilter} onChange={(event) => setParam(WORKFLOW_STATUS_PARAM, event.target.value)} slotProps={{ select: { displayEmpty: true }, htmlInput: { 'aria-label': 'Status' } }}>
          <MenuItem value="">All</MenuItem>
          {WORKFLOW_STATUS_OPTIONS.map((status) => (
            <MenuItem key={status} value={status}>
              {WORKFLOW_STATUS_LABEL[status]}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          sx={styles.filterSelect}
          value={workflowNameFilter}
          onChange={(event) => setParam(WORKFLOW_TYPE_PARAM, event.target.value)}
          slotProps={{ select: { displayEmpty: true }, htmlInput: { 'aria-label': 'Workflow definition' } }}>
          <MenuItem value="">All workflow definitions</MenuItem>
          {workflowNameOptions.map((workflowType) => (
            <MenuItem key={workflowType} value={workflowType}>
              {workflowType}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          sx={styles.filterSelect}
          value={closedWithin ? `${CLOSED_PREFIX}${closedWithin.value}` : timeRangeFilter}
          onChange={(event) => selectTimeRange(event.target.value)}
          slotProps={{ select: { displayEmpty: true }, htmlInput: { 'aria-label': closedWithin ? 'Closed within' : 'Started within' } }}>
          {closedWithin && <MenuItem value={`${CLOSED_PREFIX}${closedWithin.value}`}>Closed in the {closedWithin.label.toLowerCase()}</MenuItem>}
          {WORKFLOW_TIME_RANGE_OPTIONS.map((option) => (
            <MenuItem key={option.value || 'any'} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </TextField>
      </Box>

      {runLinkNotFound && (
        <Typography variant="body2" color="text.secondary" sx={styles.notice}>
          {hasNextPage ? 'The linked run is not among the runs loaded. Load more to look further back.' : 'The linked run could not be found in this environment.'}
        </Typography>
      )}

      {listing}

      <StartWorkflowDialog open={startOpen} api={client} scopeId={scopeId} definitions={definitions} onClose={() => setStartOpen(false)} onViewRun={({ workflowType, runId }) => goToWorkflowRuns({ workflowType, envId: environment.id, runId })} />

      <WorkflowRunDetailDrawer run={shownRun} api={api} onClose={() => setSelectedRun(null)} comingSoonAction={portalServed ? <UserPortalPrompt componentId={component.id} environment={environment} /> : undefined} />
    </Box>
  );
}
