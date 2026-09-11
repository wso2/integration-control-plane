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

import { Alert, Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, ListingTable, MenuItem, Snackbar, Stack, TextField, Tooltip, Typography } from '@wso2/oxygen-ui';
import SearchField from '../SearchField';
import { ListChecks, RefreshCw, UserCheck, Wrench } from '@wso2/oxygen-ui-icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import SchemaFormFields from './SchemaFormFields';
import StructuredValue from './StructuredValue';
import { buildFormResult, displayWorkflowId, formatTime, gatewayScope, jsonPretty, ownerLabel, ownerScope, parseFormSchema, sortByStartTimeDesc, splitQualifiedName, unescapeRoleName, type PortalScope } from './helpers';
import { ActionCard, DetailDrawer, DetailRow, HeaderCell, IdText, ListFooter, NotProvided, RefreshingNote, SectionCard, StatusChip, SubmitError, WorkflowIdLink, type WorkflowScope, rowOpenProps } from './shared';
import { IntegrationFilter, ReviewActivityDetailDialog, StatusFilter, useTimeRangeFilter, WorkflowNameFilter } from './AdminPortal';
import Authorized from '../Authorized';
import { Permissions } from '../../constants/permissions';
import DateTime from '../DateTime';
import {
  bulkRetryReviewsRequest,
  distinctWorkflowTypes,
  fetchedAtOf,
  invalidateWorkflowQueries,
  isPreparing,
  isRefreshing,
  useCompleteHumanTask,
  useFailHumanTask,
  useHumanTask,
  useWorkflowDefinitionsAcross,
  useWorkItemsInfinite,
  valueOf,
  type HumanTask,
  type WorkItemRow,
  type WorkflowDefinition,
  type WorkflowTarget,
} from '../../api/workflows';

const emptySx = { py: 4, textAlign: 'center', color: 'text.secondary' } as const;

// A pending task's child workflow reports RUNNING at runtime; the queue shows that as PENDING.
const taskDisplayStatus = (s?: string) => (s === 'RUNNING' ? 'PENDING' : s);

// Task names arrive qualified as `<workflowType>.<taskName>`; the display name drops the qualifier.
function taskDisplayName(t?: HumanTask): string {
  if (!t) return '';
  if (t.title) return t.title;
  if (t.taskName) {
    const prefix = t.parentWorkflowType ? `${t.parentWorkflowType}.` : '';
    return prefix && t.taskName.startsWith(prefix) ? t.taskName.slice(prefix.length) : t.taskName;
  }
  return t.taskId;
}

type Toast = { severity: 'success' | 'error'; message: string } | null;

// ── The unified work queue: reviews and human tasks share one queue and one filter row ──

type WorkKind = 'task' | 'review';

export interface WorkItem {
  kind: WorkKind;
  id: string;
  title: string;
  workflowName?: string;
  parentWorkflowId?: string;
  taskQueue?: string;
  status?: string;
  startTime?: string;
  // Review only: PRE_RUN (approval gate) or ON_FAILURE (rerun decision).
  trigger?: string;
  // Task only: pending but the caller holds no completing role.
  readOnly?: boolean;
  // Project inbox only: the integration that answered for this row, so its own drawer can open.
  componentId?: string;
}

const WORK_TYPE_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'task', label: 'Tasks' },
  { value: 'review', label: 'Reviews' },
] as const;
type WorkTypeFilter = (typeof WORK_TYPE_OPTIONS)[number]['value'];

// Union of both kinds' statuses; FAILED is task-only — a rejected review completes, the failure goes to the workflow.
const WORK_STATUSES = ['All', 'PENDING', 'COMPLETED', 'FAILED', 'CANCELED', 'TERMINATED'];

const triggerChipLabel = (trigger?: string): string => (trigger === 'ON_FAILURE' ? 'Review failure' : trigger === 'PRE_RUN' ? 'Approval gate' : 'Review');

export function toWorkItem(t: WorkItemRow): WorkItem {
  const kind: WorkKind = t.kind === 'REVIEW_ACTIVITY' ? 'review' : 'task';
  const { workflow, task } = splitQualifiedName(t.taskName);
  return {
    kind,
    id: t.taskId,
    title: t.title || task || t.taskId,
    workflowName: t.parentWorkflowType ?? workflow,
    parentWorkflowId: t.parentWorkflowId,
    taskQueue: t.taskQueue,
    status: t.status,
    startTime: t.startTime,
    trigger: t.trigger,
    readOnly: kind === 'task' && t.status === 'PENDING' && t.canComplete === false,
  };
}

export default function UserPortal({
  targets,
  environmentId,
  taskQueue,
  canViewTasks,
  canViewReviews,
  initialKind,
  initialTaskId,
  initialReviewId,
}: PortalScope & { canViewTasks: boolean; canViewReviews: boolean; initialKind?: 'reviews'; initialTaskId?: string; initialReviewId?: string }) {
  const scope: PortalScope = { targets, environmentId, taskQueue };
  const [toast, setToast] = useState<Toast>(null);

  return (
    <>
      <WorkQueue scope={scope} onToast={setToast} canViewTasks={canViewTasks} canViewReviews={canViewReviews} initialKind={initialKind} initialTaskId={initialTaskId} initialReviewId={initialReviewId} />

      <Snackbar open={toast !== null} autoHideDuration={4000} onClose={() => setToast(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        {toast ? (
          <Alert severity={toast.severity} onClose={() => setToast(null)} sx={{ width: '100%' }}>
            {toast.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </>
  );
}

interface WorkItemSelection {
  selectable: (w: WorkItem) => boolean;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  allSelected: boolean;
}

export function WorkItemTable({ items, onOpen, environmentId, integrationLabel, selection }: { items: WorkItem[]; onOpen: (w: WorkItem) => void; environmentId: string; integrationLabel?: (taskQueue?: string) => string; selection?: WorkItemSelection }) {
  return (
    <ListingTable>
      <ListingTable.Head>
        <ListingTable.Row>
          {selection && (
            <ListingTable.Cell sx={{ width: 40, px: 1 }}>
              <Checkbox size="small" checked={selection.allSelected} indeterminate={!selection.allSelected && selection.selected.size > 0} onChange={selection.onToggleAll} inputProps={{ 'aria-label': 'select all pending reviews' }} />
            </ListingTable.Cell>
          )}
          <HeaderCell label="Task" help="The work waiting for a person: a human task (generated form), or a review activity — a fixed decision the workflow feature provides, marked with a wrench." />
          <HeaderCell label="Workflow Name" help="The workflow definition the parent instance executes." />
          {integrationLabel && <HeaderCell label="Integration" help="The integration whose runtime owns this item, resolved from its task queue." />}
          <HeaderCell label="Task ID" help="The work item's own identifier — what the management API and audit records name it by." />
          <HeaderCell label="Workflow ID" help="The parent workflow instance waiting on this item — click to open it." />
          <HeaderCell label="Status" help="The item's current state. A rejected review completes — its failure travels to the workflow." />
          <HeaderCell label="Started" help="When the item was created." />
        </ListingTable.Row>
      </ListingTable.Head>
      <ListingTable.Body>
        {items.map((w) => {
          const Icon = w.kind === 'review' ? Wrench : UserCheck;
          return (
            <ListingTable.Row key={`${w.kind}:${w.id}`} {...rowOpenProps(() => onOpen(w))}>
              {selection && (
                <ListingTable.Cell sx={{ width: 40, px: 1 }} onClick={(e) => e.stopPropagation()}>
                  {selection.selectable(w) ? (
                    <Checkbox size="small" checked={selection.selected.has(w.id)} onChange={() => selection.onToggle(w.id)} inputProps={{ 'aria-label': `select ${w.title}` }} />
                  ) : (
                    <Tooltip title={w.kind === 'task' ? 'Human tasks are completed one at a time, through their own form.' : 'Only pending reviews can be decided in bulk.'}>
                      <span>
                        <Checkbox size="small" disabled inputProps={{ 'aria-label': `${w.title} cannot be selected` }} />
                      </span>
                    </Tooltip>
                  )}
                </ListingTable.Cell>
              )}
              <ListingTable.Cell>
                <Stack direction="row" alignItems="center" gap={1}>
                  <Tooltip title={w.kind === 'review' ? 'Review activity — a fixed decision the workflow feature provides' : 'Human task'}>
                    <Box sx={{ display: 'flex', color: 'text.secondary', flexShrink: 0 }}>
                      <Icon size={14} />
                    </Box>
                  </Tooltip>
                  <Typography variant="body2">{w.title}</Typography>
                  {w.kind === 'review' && <Chip label={triggerChipLabel(w.trigger)} size="small" variant="outlined" sx={{ fontSize: 10, height: 18 }} />}
                  {w.readOnly && (
                    <Tooltip title="You do not have a matching role to complete this task">
                      <Chip label="Read-only" size="small" variant="outlined" sx={{ fontSize: 10, height: 18 }} />
                    </Tooltip>
                  )}
                </Stack>
              </ListingTable.Cell>
              <ListingTable.Cell>
                <Typography variant="body2">{w.workflowName ?? '—'}</Typography>
              </ListingTable.Cell>
              {integrationLabel && (
                <ListingTable.Cell>
                  <Typography variant="body2">{integrationLabel(w.taskQueue)}</Typography>
                </ListingTable.Cell>
              )}
              <ListingTable.Cell>
                <IdText id={w.id} muted />
              </ListingTable.Cell>
              <ListingTable.Cell>
                <WorkflowIdLink workflowId={w.parentWorkflowId} environmentId={environmentId} truncate copy />
              </ListingTable.Cell>
              <ListingTable.Cell>
                <StatusChip status={w.status} />
              </ListingTable.Cell>
              <ListingTable.Cell>
                <DateTime value={w.startTime} />
              </ListingTable.Cell>
            </ListingTable.Row>
          );
        })}
      </ListingTable.Body>
    </ListingTable>
  );
}

function WorkQueue({
  scope,
  onToast,
  canViewTasks,
  canViewReviews,
  initialKind,
  initialTaskId,
  initialReviewId,
}: {
  scope: PortalScope;
  onToast: (t: Toast) => void;
  canViewTasks: boolean;
  canViewReviews: boolean;
  initialKind?: 'reviews';
  initialTaskId?: string;
  initialReviewId?: string;
}) {
  // Each kind opens against the integration that owns it, per the row's own task queue.
  const [openTask, setOpenTask] = useState<{ taskId: string; taskQueue?: string; status?: string } | null>(null);
  const [openReview, setOpenReview] = useState<{ taskId: string; taskQueue?: string } | null>(null);
  // A deep link may name an item this list does not hold, so it is fetched directly and opened on arrival.
  const { data: linkedTaskResult } = useHumanTask(gatewayScope(scope), initialTaskId ?? null);
  const linkedTask = valueOf(linkedTaskResult);
  useEffect(() => {
    if (linkedTask) setOpenTask({ taskId: linkedTask.taskId, taskQueue: linkedTask.taskQueue, status: linkedTask.status });
  }, [linkedTask]);
  useEffect(() => {
    if (initialReviewId) setOpenReview({ taskId: initialReviewId });
  }, [initialReviewId]);

  const [workType, setWorkType] = useState<WorkTypeFilter>(initialKind === 'reviews' ? 'review' : 'all');
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkAction, setBulkAction] = useState<'retry' | 'fail'>('retry');
  const [bulkFeedback, setBulkFeedback] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const qc = useQueryClient();
  const [status, setStatus] = useState('PENDING');
  const [search, setSearch] = useState('');
  const [selectedType, setSelectedType] = useState<WorkflowDefinition | null>(null);
  const [integration, setIntegration] = useState<WorkflowTarget | null>(null);
  const timeFilter = useTimeRangeFilter();

  const multi = scope.targets.length > 1;

  const taskQueue = integration?.handler ?? scope.taskQueue;
  const definitions = useWorkflowDefinitionsAcross(scope.targets, scope.environmentId);

  // The proxy already narrows kinds to the caller's permissions; the Type filter only narrows further.
  const query = useWorkItemsInfinite(gatewayScope(scope), {
    kind: workType === 'task' ? 'HUMAN_TASK' : workType === 'review' ? 'REVIEW_ACTIVITY' : undefined,
    status: status === 'All' ? undefined : status,
    parentWorkflowId: search || undefined,
    parentWorkflowType: selectedType?.workflowType || undefined,
    taskQueue,
    startTimeFrom: timeFilter.bounds.startTimeFrom,
    startTimeTo: timeFilter.bounds.startTimeTo,
    limit: 50,
  });
  const queuePreparing = (query.data?.pages ?? []).some((p) => isPreparing(p));
  const queueRefreshing = (query.data?.pages ?? []).some((p) => isRefreshing(p));
  const queueUpdatedAt = (query.data?.pages ?? []).map((p) => fetchedAtOf(p)).filter((ts): ts is number => !!ts)[0];
  const items: WorkItem[] = sortByStartTimeDesc(
    (query.data?.pages ?? [])
      .map((p) => valueOf(p))
      .filter((p) => p !== undefined)
      .flatMap((p) => p?.items ?? [])
      .map(toWorkItem),
  );

  const isLoading = query.isLoading;
  const error = query.error;
  const isFetching = query.isFetching;
  const refetchAll = () => void query.refetch();
  const hasMore = query.hasNextPage;

  const selectable = items.filter((w) => w.kind === 'review' && taskDisplayStatus(w.status) === 'PENDING');
  // Selection is pruned against on-screen rows so a decided or filtered-out row is never acted on blind.
  const selected = new Set(selectedIds.filter((id) => selectable.some((w) => w.id === id)));
  const toggleSelected = (id: string) => setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const toggleAll = () => setSelectedIds(selected.size === selectable.length ? [] : selectable.map((w) => w.id));

  const submitBulk = async () => {
    setBulkBusy(true);
    // One request per owning integration, run concurrently; outcomes are summed.
    const chosen = selectable.filter((w) => selected.has(w.id));
    const byQueue = new Map<string | undefined, string[]>();
    for (const w of chosen) byQueue.set(w.taskQueue, [...(byQueue.get(w.taskQueue) ?? []), w.id]);
    const feedback = bulkAction === 'fail' ? bulkFeedback.trim() || undefined : undefined;
    const outcomes = await Promise.all(
      [...byQueue].map(async ([queue, ids]) => {
        try {
          return { result: await bulkRetryReviewsRequest(ownerScope(scope, queue), { taskIds: ids, action: bulkAction, feedback }) };
        } catch (e) {
          return { error: `${ownerLabel(scope, queue)}: ${e instanceof Error && e.message ? e.message : 'bulk decision failed'}` };
        }
      }),
    );
    let applied = 0;
    let skipped = 0;
    let failed = 0;
    for (const o of outcomes) {
      if (!o.result) continue;
      applied += o.result.applied;
      skipped += o.result.skipped;
      failed += o.result.failed;
    }
    const errors = outcomes.flatMap((o) => (o.error ? [o.error] : []));
    const errored = errors.length ? errors.join('; ') : null;
    setBulkBusy(false);
    setBulkOpen(false);
    setSelectedIds([]);
    setSelecting(false);
    invalidateWorkflowQueries(qc, scope.environmentId);
    onToast(
      errored
        ? { severity: 'error', message: errored }
        : {
            severity: failed > 0 ? 'error' : 'success',
            message: `${chosen.length} review(s): ${applied} ${bulkAction === 'retry' ? 'retried' : 'failed'}, ${skipped} skipped${failed > 0 ? `, ${failed} errored` : ''}.`,
          },
    );
  };

  const loadMore = () => query.fetchNextPage();
  const hasFilters = status !== 'PENDING' || workType !== (initialKind === 'reviews' ? 'review' : 'all') || !!selectedType || !!search || !!integration || timeFilter.active;

  const openItem = (w: WorkItem) => {
    if (w.kind === 'review') setOpenReview({ taskId: w.id, taskQueue: w.taskQueue });
    else setOpenTask({ taskId: w.id, taskQueue: w.taskQueue, status: w.status });
  };

  return (
    <>
      <Stack direction="row" alignItems="center" gap={1.5} sx={{ mb: 2 }} flexWrap="wrap">
        <SearchField value={search} onChange={setSearch} placeholder="Search by workflow ID" sx={{ width: 320 }} />
        <Box sx={{ flex: 1 }} />
        <Tooltip title="Refresh">
          <IconButton size="small" onClick={refetchAll} aria-label="Refresh">
            <RefreshCw size={16} style={{ animation: isFetching ? 'spin 1s linear infinite' : 'none' }} />
          </IconButton>
        </Tooltip>
      </Stack>

      <Stack direction="row" gap={1.5} sx={{ mb: 2 }} flexWrap="wrap" alignItems="center">
        {canViewTasks && canViewReviews && (
          <TextField select size="small" label="Type" value={workType} onChange={(e) => setWorkType(e.target.value as WorkTypeFilter)} sx={{ width: 140 }}>
            {WORK_TYPE_OPTIONS.map((o) => (
              <MenuItem key={o.value} value={o.value}>
                {o.label}
              </MenuItem>
            ))}
          </TextField>
        )}
        <StatusFilter options={WORK_STATUSES} value={status} onChange={setStatus} />
        <WorkflowNameFilter definitions={distinctWorkflowTypes(definitions.items)} value={selectedType} onChange={setSelectedType} />
        {multi && <IntegrationFilter targets={scope.targets} value={integration} onChange={setIntegration} />}
        {timeFilter.controls}
        {hasFilters && (
          <Button
            size="small"
            onClick={() => {
              setWorkType(initialKind === 'reviews' ? 'review' : 'all');
              setStatus('PENDING');
              setSelectedType(null);
              setSearch('');
              setIntegration(null);
              timeFilter.reset();
            }}>
            Clear
          </Button>
        )}
        {!selecting && (
          <Tooltip title={selectable.length > 0 ? `Choose several pending reviews and retry or fail them together. ${selectable.length} can be selected.` : 'Bulk decisions apply to pending reviews; there are none in this list.'}>
            <span style={{ marginLeft: 'auto' }}>
              <Button size="small" variant="outlined" startIcon={<ListChecks size={14} />} disabled={selectable.length === 0} onClick={() => setSelecting(true)}>
                Select reviews…
              </Button>
            </span>
          </Tooltip>
        )}
      </Stack>

      <RefreshingNote show={queueRefreshing} fetchedAt={queueUpdatedAt} />
      {isLoading ? (
        <CircularProgress size={24} sx={{ display: 'block', mx: 'auto', py: 4 }} />
      ) : error ? (
        <Typography sx={emptySx}>{error instanceof Error ? error.message : 'Failed to load tasks.'}</Typography>
      ) : queuePreparing && items.length === 0 ? (
        <Typography sx={emptySx}>Fetching tasks from the integration…</Typography>
      ) : items.length === 0 ? (
        <Typography sx={emptySx}>{status === 'All' ? 'No tasks.' : `No ${status.toLowerCase()} tasks.`}</Typography>
      ) : (
        <>
          {selecting && (
            <Stack direction="row" alignItems="center" gap={1.5} flexWrap="wrap" sx={{ px: 1.5, py: 1, mb: 1, border: '1px solid', borderColor: 'primary.main', borderRadius: 1, bgcolor: 'action.selected' }}>
              <Typography variant="body2" sx={{ flex: 1, minWidth: 240 }}>
                {selected.size > 0 ? `${selected.size} of ${selectable.length} pending review${selectable.length === 1 ? '' : 's'} selected.` : `Choose the pending reviews to decide together — ${selectable.length} can be selected.`}{' '}
                <Typography component="span" variant="body2" color="text.secondary">
                  Human tasks are completed one at a time, through their own form.
                </Typography>
              </Typography>
              <Button
                size="small"
                variant="contained"
                disabled={bulkBusy || selected.size === 0}
                onClick={() => {
                  setBulkAction('retry');
                  setBulkOpen(true);
                }}>
                Retry Selected
              </Button>
              <Button
                size="small"
                variant="outlined"
                color="error"
                disabled={bulkBusy || selected.size === 0}
                onClick={() => {
                  setBulkAction('fail');
                  setBulkOpen(true);
                }}>
                Fail Selected
              </Button>
              <Button
                size="small"
                variant="text"
                disabled={bulkBusy}
                onClick={() => {
                  setSelectedIds([]);
                  setSelecting(false);
                }}>
                Done
              </Button>
            </Stack>
          )}
          <WorkItemTable
            items={items}
            onOpen={openItem}
            environmentId={scope.environmentId}
            integrationLabel={multi ? (q) => ownerLabel(scope, q) : undefined}
            selection={
              selecting ? { selectable: (w) => w.kind === 'review' && taskDisplayStatus(w.status) === 'PENDING', selected, onToggle: toggleSelected, onToggleAll: toggleAll, allSelected: selectable.length > 0 && selected.size === selectable.length } : undefined
            }
          />
          <ListFooter count={items.length} singular="item" plural="items" hasMore={hasMore} loadingMore={query.isFetchingNextPage || isPreparing(query.data?.pages[query.data.pages.length - 1])} onLoadMore={loadMore} />
        </>
      )}

      <Dialog open={bulkOpen} onClose={() => !bulkBusy && setBulkOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{bulkAction === 'retry' ? 'Retry Selected Reviews' : 'Fail Selected Reviews'}</DialogTitle>
        <DialogContent>
          <Stack gap={2} sx={{ pt: 0.5 }}>
            <Alert severity={bulkAction === 'retry' ? 'info' : 'warning'}>
              {bulkAction === 'retry'
                ? `Reruns the reviewed activity of each selected review with its original arguments — a bulk decision cannot edit them. ${selected.size} review${selected.size === 1 ? '' : 's'} will be decided; per-review outcomes are reported.`
                : `Rejects every selected review; each failure is propagated to its workflow, which decides what happens next. ${selected.size} review${selected.size === 1 ? '' : 's'} will be decided. This cannot be undone.`}
            </Alert>
            {bulkAction === 'fail' && <TextField label="Feedback (optional)" fullWidth multiline minRows={2} value={bulkFeedback} onChange={(e) => setBulkFeedback(e.target.value)} helperText="Relayed to each workflow as the rejection reason." />}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={bulkBusy} onClick={() => setBulkOpen(false)}>
            Back
          </Button>
          <Button variant="contained" color={bulkAction === 'fail' ? 'error' : 'primary'} disabled={bulkBusy} onClick={() => void submitBulk()}>
            {bulkBusy ? 'Submitting…' : bulkAction === 'retry' ? `Retry ${selected.size}` : `Fail ${selected.size}`}
          </Button>
        </DialogActions>
      </Dialog>

      {openTask && <TaskDetailDialog scope={ownerScope(scope, openTask.taskQueue)} taskId={openTask.taskId} actionable={taskDisplayStatus(openTask.status) === 'PENDING'} onClose={() => setOpenTask(null)} onToast={onToast} />}
      {openReview && <ReviewActivityDetailDialog scope={ownerScope(scope, openReview.taskQueue)} taskId={openReview.taskId} onClose={() => setOpenReview(null)} onToast={onToast} />}
    </>
  );
}

export function TaskDetailDialog({ scope, taskId, actionable, onClose, onToast }: { scope: WorkflowScope; taskId: string; actionable?: boolean; onClose: () => void; onToast: (t: Toast) => void }) {
  const [pausePolling, setPausePolling] = useState(false);
  const { data: taskResult, isLoading, error: taskError } = useHumanTask(scope, taskId, pausePolling);
  const task = valueOf(taskResult);
  const waiting = isLoading || isPreparing(taskResult);
  const refreshing = isRefreshing(taskResult);
  const complete = useCompleteHumanTask(scope);
  const fail = useFailHumanTask(scope);
  const [mode, setMode] = useState<'view' | 'complete'>('view');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [failOpen, setFailOpen] = useState(false);
  // Polling pauses while deciding; mirrored into state because the hook call sits above these declarations.
  const editing = mode === 'complete' || confirmOpen || failOpen;
  if (editing !== pausePolling) setPausePolling(editing);
  const [rawMode, setRawMode] = useState(false);
  const [resultText, setResultText] = useState('{}');
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const [formValues, setFormValues] = useState<Record<string, string | boolean>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  // The result confirmed in step two — built once when entering the confirmation.
  const [pendingResult, setPendingResult] = useState<unknown>(null);

  const busy = complete.isPending || fail.isPending;
  const canComplete = task?.canComplete !== false;
  const eligibleRoles = task?.eligibleRoles ?? (Array.isArray(task?.roles) ? (task.roles as string[]) : undefined) ?? task?.userRoles;
  const formFields = parseFormSchema(task?.formSchema);
  const taskInputJson = task?.taskInput !== undefined && task?.taskInput !== null ? jsonPretty(task.taskInput) : null;

  const setFormValue = (name: string, value: string | boolean) => {
    setFormValues((prev) => ({ ...prev, [name]: value }));
    setFieldErrors((prev) => {
      if (!(name in prev)) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  };

  // Step one: validate and stage the result; step two actually submits it.
  const stageComplete = () => {
    if (formFields && !rawMode) {
      const { result, errors } = buildFormResult(formFields, formValues);
      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        return;
      }
      setPendingResult(result);
      setConfirmOpen(true);
      return;
    }
    try {
      setPendingResult(resultText.trim() ? JSON.parse(resultText) : {});
      setConfirmOpen(true);
    } catch {
      setErr('Result must be valid JSON.');
    }
  };

  const submitComplete = () => {
    setSubmitError(null);
    complete.mutate(
      { taskId, result: pendingResult },
      {
        onSuccess: () => {
          onClose();
          onToast({ severity: 'success', message: 'Task completed.' });
        },
        onError: (e) => {
          setConfirmOpen(false);
          setSubmitError(e instanceof Error && e.message ? e.message : 'Failed to complete task.');
        },
      },
    );
  };

  const submitFail = () => {
    if (!reason.trim()) {
      setErr('Reason is required.');
      return;
    }
    setSubmitError(null);
    fail.mutate(
      { taskId, reason: reason.trim() },
      {
        onSuccess: () => {
          onClose();
          onToast({ severity: 'success', message: 'Task marked as failed.' });
        },
        onError: (e) => {
          setFailOpen(false);
          setSubmitError(e instanceof Error && e.message ? e.message : 'Failed to fail the task.');
        },
      },
    );
  };

  const closeComplete = () => {
    setMode('view');
    setErr('');
    setFieldErrors({});
    setSubmitError(null);
  };

  const stepButtons = (...buttons: ReactNode[]) => (
    <Stack direction="row" justifyContent="flex-end" gap={1}>
      {buttons}
    </Stack>
  );

  return (
    <DetailDrawer title={task ? taskDisplayName(task) : displayWorkflowId(taskId)} status={taskDisplayStatus(task?.status)} onClose={onClose}>
      {waiting ? (
        <CircularProgress size={24} sx={{ display: 'block', mx: 'auto', py: 4 }} />
      ) : taskError || !task ? (
        <Typography sx={emptySx}>{taskError instanceof Error ? taskError.message : 'Failed to load task details.'}</Typography>
      ) : (
        <Stack gap={2}>
          <SubmitError message={submitError} onClear={() => setSubmitError(null)} />
          <RefreshingNote show={refreshing} />
          {task?.description && (
            <SectionCard title="Description">
              <Typography variant="body2" color="text.secondary">
                {task.description}
              </Typography>
            </SectionCard>
          )}

          <SectionCard title="Task" collapsible>
            <Stack gap={1.25}>
              <DetailRow label="Task Name">{taskDisplayName(task)}</DetailRow>
              <DetailRow label="Workflow Name">{task.parentWorkflowType ?? <NotProvided />}</DetailRow>
              <DetailRow label="Parent Workflow">
                <WorkflowIdLink workflowId={task.parentWorkflowId} environmentId={scope.environmentId} onNavigate={onClose} truncate copy />
              </DetailRow>
              <DetailRow label="Created">
                <DateTime value={task?.startTime} />
              </DetailRow>
              <DetailRow label="Eligible Roles">
                {eligibleRoles?.length ? (
                  <Stack direction="row" gap={0.5} flexWrap="wrap">
                    {eligibleRoles.map((role) => (
                      <Chip key={role} label={unescapeRoleName(role)} size="small" variant="outlined" />
                    ))}
                  </Stack>
                ) : (
                  <NotProvided />
                )}
              </DetailRow>
            </Stack>
          </SectionCard>

          {taskInputJson && <StructuredValue title="Task Input" readOnly raw={taskInputJson} environmentId={scope.environmentId} collapsible />}

          {/* Blank for tasks decided before the runtime recorded the completer. */}
          {(task.completedBy || task.completedAt || (task.result !== undefined && task.result !== null)) && (
            <SectionCard title="Decision">
              <Stack gap={1.25}>
                <DetailRow label="Completed By">{task.completedBy ? <IdText id={task.completedBy} /> : <NotProvided />}</DetailRow>
                <DetailRow label="Completed At">{task.completedAt ? formatTime(task.completedAt) : <NotProvided />}</DetailRow>
              </Stack>
            </SectionCard>
          )}
          {task.result !== undefined && task.result !== null && <StructuredValue title="Result Submitted" raw={jsonPretty(task.result) || 'null'} environmentId={scope.environmentId} collapsible />}

          {actionable && (
            <Authorized permissions={[Permissions.WORKFLOW_MANAGE_HUMAN_TASKS]}>
              <SectionCard title="Actions">
                <Stack gap={2}>
                  <Stack direction="row" flexWrap="wrap" gap={1.5}>
                    <ActionCard
                      title="Complete Task"
                      subtitle="Submit a result; the waiting workflow resumes with it."
                      selected={mode === 'complete'}
                      disabled={busy || !canComplete}
                      disabledReason={canComplete ? undefined : 'You do not have a matching role to complete this task'}
                      onClick={() => (mode === 'complete' ? closeComplete() : setMode('complete'))}
                    />
                    <ActionCard
                      title="Mark as Failed"
                      subtitle="Fail the task instead."
                      info="Records the task as FAILED and propagates the failure to the workflow, which decides what happens next. This cannot be undone."
                      selected={failOpen}
                      disabled={busy}
                      onClick={() => {
                        // Only one decision open at a time: close the completion editor first.
                        closeComplete();
                        setFailOpen(true);
                      }}
                    />
                  </Stack>

                  {mode === 'complete' && (
                    <Stack gap={2} sx={{ borderTop: '1px solid', borderColor: 'divider', pt: 2 }}>
                      <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2}>
                        <Typography variant="body2" color="text.secondary">
                          The result the workflow resumes with.
                        </Typography>
                        {formFields && (
                          <Button
                            size="small"
                            variant="text"
                            onClick={() => {
                              // Raw mode carries the form's values across; it never converts back.
                              if (!rawMode) {
                                const { result } = buildFormResult(formFields, formValues);
                                setResultText(jsonPretty(result) || '{}');
                              }
                              setRawMode((v) => !v);
                              setErr('');
                            }}>
                            {rawMode ? 'Back to form' : 'Edit as JSON'}
                          </Button>
                        )}
                      </Stack>
                      {formFields && !rawMode ? (
                        <SchemaFormFields fields={formFields} values={formValues} errors={fieldErrors} onChange={setFormValue} />
                      ) : (
                        <TextField
                          label="Result (JSON)"
                          fullWidth
                          multiline
                          minRows={5}
                          value={resultText}
                          onChange={(e) => {
                            setResultText(e.target.value);
                            setErr('');
                          }}
                          error={!!err}
                          helperText={err || (formFields ? 'Raw mode: submitted exactly as typed — the form is bypassed.' : 'This task declares no result schema; the JSON is submitted as the result.')}
                          slotProps={{ input: { sx: { fontFamily: 'monospace', fontSize: 13 } } }}
                        />
                      )}
                      {stepButtons(
                        <Button key="b" disabled={busy} onClick={closeComplete}>
                          Cancel
                        </Button>,
                        <Button key="r" variant="contained" disabled={busy} onClick={stageComplete}>
                          Review before completion
                        </Button>,
                      )}
                    </Stack>
                  )}
                </Stack>
              </SectionCard>
            </Authorized>
          )}

          <Dialog open={confirmOpen} onClose={() => !busy && setConfirmOpen(false)} maxWidth="sm" fullWidth>
            <DialogTitle>Confirm Completion</DialogTitle>
            <DialogContent>
              <Stack gap={2} sx={{ pt: 0.5 }}>
                <Alert severity="info">The task completes with the result below, and the waiting workflow resumes with it. This cannot be undone.</Alert>
                <StructuredValue title="Result to Submit" raw={jsonPretty(pendingResult) || '{}'} environmentId={scope.environmentId} />
              </Stack>
            </DialogContent>
            <DialogActions>
              <Button disabled={busy} onClick={() => setConfirmOpen(false)}>
                Back
              </Button>
              <Button variant="contained" disabled={busy} onClick={submitComplete}>
                {complete.isPending ? 'Completing…' : 'Complete Task'}
              </Button>
            </DialogActions>
          </Dialog>

          <Dialog open={failOpen} onClose={() => !busy && setFailOpen(false)} maxWidth="sm" fullWidth>
            <DialogTitle>Mark Task as Failed</DialogTitle>
            <DialogContent>
              <Stack gap={2} sx={{ pt: 0.5 }}>
                <Alert severity="warning">Failing is a fail operation: the task is recorded as FAILED and the failure is propagated to the workflow — the workflow decides what happens next. This cannot be undone.</Alert>
                <TextField
                  label="Reason"
                  fullWidth
                  required
                  value={reason}
                  onChange={(e) => {
                    setReason(e.target.value);
                    setErr('');
                  }}
                  error={!!err}
                  helperText={err || 'Relayed to the workflow as the failure reason.'}
                />
              </Stack>
            </DialogContent>
            <DialogActions>
              <Button disabled={busy} onClick={() => setFailOpen(false)}>
                Back
              </Button>
              <Button variant="contained" color="warning" disabled={busy} onClick={submitFail}>
                {fail.isPending ? 'Submitting…' : 'Mark as Failed'}
              </Button>
            </DialogActions>
          </Dialog>
        </Stack>
      )}
    </DetailDrawer>
  );
}
