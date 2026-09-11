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

import { Alert, Autocomplete, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, ListingTable, MenuItem, Select, Snackbar, Stack, TextField, Tooltip, Typography } from '@wso2/oxygen-ui';
import { Copy, Eye, Play, RefreshCw } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { resourceUrl, useScope } from '../../nav';
import SearchField from '../SearchField';
import SchemaFormFields from './SchemaFormFields';
import WorkflowDetailDrawer from './WorkflowDetailDrawer';
import StructuredValue from './StructuredValue';
import {
  buildFormResult,
  diffFormValues,
  displayWorkflowId,
  extractNodeExecutionDetail,
  formatTime,
  formValuesFromObject,
  gatewayScope,
  jsonPretty,
  ownerLabel,
  ownerScope,
  parseFormSchema,
  sectionTitleSx,
  sortByStartTimeDesc,
  splitQualifiedName,
  type PortalScope,
} from './helpers';
import { ActionCard, DetailDrawer, DetailRow, HeaderCell, IdText, ListFooter, NotProvided, RefreshingNote, SchemaDisclosure, SectionCard, StatusChip, SubmitError, WorkflowIdLink, type WorkflowScope, rowOpenProps } from './shared';
import Authorized from '../Authorized';
import { Permissions } from '../../constants/permissions';
import DateTime from '../DateTime';
import {
  distinctWorkflowTypes,
  fetchedAtOf,
  isPreparing,
  isRefreshing,
  useReviewActivity,
  useReviewDecision,
  useStartWorkflow,
  useWorkflowDefinitionsAcross,
  useWorkflowHistory,
  useWorkflowInstancesInfinite,
  valueOf,
  type Owned,
  type ReviewDecision,
  type WorkflowDefinition,
  type WorkflowTarget,
} from '../../api/workflows';

const WORKFLOW_STATUSES = ['All', 'RUNNING', 'COMPLETED', 'FAILED', 'TERMINATED', 'CANCELED', 'TIMED_OUT'];
const emptySx = { py: 4, textAlign: 'center', color: 'text.secondary' } as const;

const statusLabel = (s: string) => (s === 'All' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' '));

const localToIso = (v: string): string | undefined => {
  if (!v) return undefined;
  const d = new Date(v);
  return isNaN(d.getTime()) ? undefined : d.toISOString();
};

const toLocalInput = (d: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const ANY_TIME = 'Any time';
const CUSTOM_RANGE = 'Custom';
// Relative presets for the time-range dropdown (window length in milliseconds).
const TIME_PRESETS: { label: string; ms: number }[] = [
  { label: 'Past 10 minutes', ms: 10 * 60_000 },
  { label: 'Past 30 minutes', ms: 30 * 60_000 },
  { label: 'Past 1 hour', ms: 60 * 60_000 },
  { label: 'Past 24 hours', ms: 24 * 60 * 60_000 },
];

export type Toast = { severity: 'success' | 'error'; message: string } | null;

export type { PortalScope };

export function IntegrationFilter({ targets, value, onChange }: { targets: WorkflowTarget[]; value: WorkflowTarget | null; onChange: (v: WorkflowTarget | null) => void }) {
  return (
    <Autocomplete
      size="small"
      sx={{ width: 240 }}
      options={targets}
      value={value}
      getOptionLabel={(t) => t.componentName}
      isOptionEqualToValue={(a, b) => a.componentId === b.componentId}
      onChange={(_, v) => onChange(v)}
      renderInput={(params) => <TextField {...params} label="Integration" placeholder="All integrations" />}
    />
  );
}

function DefinitionsUnavailableNotice({ failed }: { failed: { componentName: string; message: string }[] }) {
  if (failed.length === 0) return null;
  return (
    <Alert severity="warning" sx={{ mb: 2 }}>
      {`Could not load workflow definitions from ${failed.map((f) => f.componentName).join(', ')}; some workflow names may be missing.`}
    </Alert>
  );
}

// ── Shared filter controls (used by the Workflows and Review Activities views) ─────

export function StatusFilter({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return <Autocomplete size="small" sx={{ width: 180 }} options={options} value={value} disableClearable getOptionLabel={statusLabel} onChange={(_, v) => onChange(v ?? 'All')} renderInput={(params) => <TextField {...params} label="Status" />} />;
}

export function WorkflowNameFilter({ definitions, value, onChange }: { definitions: WorkflowDefinition[]; value: WorkflowDefinition | null; onChange: (v: WorkflowDefinition | null) => void }) {
  return (
    <Autocomplete
      size="small"
      sx={{ width: 240 }}
      options={definitions}
      value={value}
      getOptionLabel={(d) => d.workflowType}
      isOptionEqualToValue={(a, b) => a.workflowType === b.workflowType}
      onChange={(_, v) => onChange(v)}
      renderInput={(params) => <TextField {...params} label="Workflow Name" placeholder="All workflows" />}
    />
  );
}

export function useTimeRangeFilter() {
  const [timeRange, setTimeRange] = useState(ANY_TIME);
  const [customStart, setCustomStart] = useState(() => toLocalInput(new Date(Date.now() - 24 * 3600_000)));
  const [customEnd, setCustomEnd] = useState(() => toLocalInput(new Date()));

  // Memoized so a relative preset snapshots "now" only when the selection changes —
  // recomputing every render would change the query key continuously and refetch in a loop.
  const bounds = useMemo<{ startTimeFrom?: string; startTimeTo?: string }>(() => {
    if (timeRange === ANY_TIME) return {};
    if (timeRange === CUSTOM_RANGE) return { startTimeFrom: localToIso(customStart), startTimeTo: localToIso(customEnd) };
    const preset = TIME_PRESETS.find((p) => p.label === timeRange);
    if (!preset) return {};
    const now = Date.now();
    return { startTimeFrom: new Date(now - preset.ms).toISOString(), startTimeTo: new Date(now).toISOString() };
  }, [timeRange, customStart, customEnd]);

  const controls = (
    <>
      <Select
        size="small"
        sx={{ minWidth: 170 }}
        value={timeRange}
        onChange={(e) => {
          const v = e.target.value as string;
          setTimeRange(v);
          if (v === CUSTOM_RANGE) {
            setCustomStart(toLocalInput(new Date(Date.now() - 24 * 3600_000)));
            setCustomEnd(toLocalInput(new Date()));
          }
        }}
        inputProps={{ 'aria-label': 'Time range' }}>
        <MenuItem value={ANY_TIME}>{ANY_TIME}</MenuItem>
        {TIME_PRESETS.map((p) => (
          <MenuItem key={p.label} value={p.label}>
            {p.label}
          </MenuItem>
        ))}
        <MenuItem value={CUSTOM_RANGE}>{CUSTOM_RANGE}</MenuItem>
      </Select>
      {timeRange === CUSTOM_RANGE && (
        <>
          <TextField label="Start From" type="datetime-local" size="small" value={customStart} onChange={(e) => setCustomStart(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField label="End On" type="datetime-local" size="small" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
        </>
      )}
    </>
  );

  return { bounds, controls, active: timeRange !== ANY_TIME, reset: () => setTimeRange(ANY_TIME) };
}

export default function AdminPortal({ targets, environmentId, taskQueue, initialWorkflowType, initialWorkflowId }: PortalScope & { initialWorkflowType?: string; initialWorkflowId?: string }) {
  const scope: PortalScope = { targets, environmentId, taskQueue };
  const [toast, setToast] = useState<Toast>(null);
  // WorkflowsAdmin's filters live here rather than inside it: deep-link params seed them once, at
  // initial mount, and the whole portal remounts when those params change.
  const [status, setStatus] = useState('All');
  // The Autocomplete matches options by workflowType, so a minimal {workflowType} object selects it.
  const [selectedType, setSelectedType] = useState<WorkflowDefinition | null>(initialWorkflowType ? { workflowType: initialWorkflowType } : null);
  const [search, setSearch] = useState(initialWorkflowId ?? '');
  const timeFilter = useTimeRangeFilter();

  return (
    <>
      <WorkflowsAdmin scope={scope} onToast={setToast} status={status} setStatus={setStatus} selectedType={selectedType} setSelectedType={setSelectedType} search={search} setSearch={setSearch} timeFilter={timeFilter} />

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

// ── Workflows ────────────────────────────────────────────────────────────────

type TimeRangeFilter = ReturnType<typeof useTimeRangeFilter>;

// Filter state is owned by AdminPortal (lifted so it survives switching views), passed in here.
function WorkflowsAdmin({
  scope,
  onToast,
  status,
  setStatus,
  selectedType,
  setSelectedType,
  search,
  setSearch,
  timeFilter,
}: {
  scope: PortalScope;
  onToast: (t: Toast) => void;
  status: string;
  setStatus: (v: string) => void;
  selectedType: WorkflowDefinition | null;
  setSelectedType: (v: WorkflowDefinition | null) => void;
  search: string;
  setSearch: (v: string) => void;
  timeFilter: TimeRangeFilter;
}) {
  const [startOpen, setStartOpen] = useState(false);
  // The drawer opens against the integration that owns the run, per the row's own task queue.
  const [detail, setDetail] = useState<{ workflowId: string; taskQueue?: string } | null>(null);
  const [integration, setIntegration] = useState<WorkflowTarget | null>(null);

  const multi = scope.targets.length > 1;
  // Narrowing by integration is just a task-queue filter on the same gateway request.
  const taskQueue = integration?.handler ?? scope.taskQueue;
  const definitions = useWorkflowDefinitionsAcross(scope.targets, scope.environmentId);

  const filters = {
    status: status === 'All' ? undefined : status,
    workflowType: selectedType?.workflowType || undefined,
    workflowId: search || undefined,
    taskQueue,
    startTimeFrom: timeFilter.bounds.startTimeFrom,
    startTimeTo: timeFilter.bounds.startTimeTo,
    limit: 50,
  };
  // Paged the way Temporal's visibility API pages — forward-only tokens — so "Load more" appends.
  const { data, isLoading, error, refetch, isFetching, hasNextPage, fetchNextPage, isFetchingNextPage } = useWorkflowInstancesInfinite(gatewayScope(scope), filters);
  const pages = (data?.pages ?? []).map((page) => valueOf(page)).filter((page) => page !== undefined);
  const items = sortByStartTimeDesc(pages.flatMap((page) => page?.items ?? []));
  const preparing = (data?.pages ?? []).some((page) => isPreparing(page));
  const refreshing = (data?.pages ?? []).some((page) => isRefreshing(page));
  const updatedAt = (data?.pages ?? []).map((page) => fetchedAtOf(page)).filter((t): t is number => !!t)[0];
  const hasFilters = status !== 'All' || !!selectedType || !!search || !!integration || timeFilter.active;

  return (
    <>
      <Stack direction="row" alignItems="center" gap={1.5} sx={{ mb: 2 }} flexWrap="wrap">
        <SearchField value={search} onChange={setSearch} placeholder="Search by workflow ID" sx={{ width: 280 }} />
        <Box sx={{ flex: 1 }} />
        <Tooltip title="Refresh">
          <IconButton size="small" onClick={() => refetch()} aria-label="Refresh">
            <RefreshCw size={16} style={{ animation: isFetching ? 'spin 1s linear infinite' : 'none' }} />
          </IconButton>
        </Tooltip>
        <Authorized permissions={[Permissions.WORKFLOW_MANAGE_WORKFLOWS]}>
          <Button variant="contained" size="small" startIcon={<Play size={14} />} onClick={() => setStartOpen(true)}>
            Start New Workflow
          </Button>
        </Authorized>
      </Stack>

      <Stack direction="row" gap={1.5} sx={{ mb: 2 }} flexWrap="wrap" alignItems="center">
        <StatusFilter options={WORKFLOW_STATUSES} value={status} onChange={setStatus} />
        <WorkflowNameFilter definitions={distinctWorkflowTypes(definitions.items)} value={selectedType} onChange={setSelectedType} />
        {multi && <IntegrationFilter targets={scope.targets} value={integration} onChange={setIntegration} />}
        {timeFilter.controls}
        {hasFilters && (
          <Button
            size="small"
            onClick={() => {
              setStatus('All');
              setSelectedType(null);
              setSearch('');
              setIntegration(null);
              timeFilter.reset();
            }}>
            Clear
          </Button>
        )}
      </Stack>

      <DefinitionsUnavailableNotice failed={definitions.failed} />

      <RefreshingNote show={refreshing} fetchedAt={updatedAt} />
      {isLoading ? (
        <CircularProgress size={24} sx={{ display: 'block', mx: 'auto', py: 4 }} />
      ) : error ? (
        <Typography sx={emptySx}>{error instanceof Error ? error.message : 'Failed to load workflows.'}</Typography>
      ) : preparing && items.length === 0 ? (
        <Typography sx={emptySx}>Fetching executions from the integration…</Typography>
      ) : items.length === 0 ? (
        <Typography sx={emptySx}>No workflows found.</Typography>
      ) : (
        <>
          <ListingTable>
            <ListingTable.Head>
              <ListingTable.Row>
                <HeaderCell label="Workflow ID" help="The unique identity of this instance — what searches, links, and management operations use." />
                <HeaderCell label="Run ID" help="One attempt of the instance. A retry or reset starts a new run under the same workflow ID; this names the latest attempt." />
                <HeaderCell label="Workflow Name" help="The workflow definition this instance executes." />
                {multi && <HeaderCell label="Integration" help="The integration whose runtime executes this instance, resolved from its task queue." />}
                <HeaderCell label="Status" help="The instance's current state." />
                <HeaderCell label="Started" help="When the instance started." />
              </ListingTable.Row>
            </ListingTable.Head>
            <ListingTable.Body>
              {items.map((wf) => (
                <ListingTable.Row key={`${wf.workflowId}:${wf.runId ?? ''}`} {...rowOpenProps(() => setDetail({ workflowId: wf.workflowId, taskQueue: wf.taskQueue }))}>
                  <ListingTable.Cell>
                    <IdText id={displayWorkflowId(wf.workflowId)} />
                  </ListingTable.Cell>
                  <ListingTable.Cell>
                    <IdText id={wf.runId} muted />
                  </ListingTable.Cell>
                  <ListingTable.Cell>{wf.workflowType ?? '—'}</ListingTable.Cell>
                  {multi && (
                    <ListingTable.Cell>
                      <Typography variant="body2">{ownerLabel(scope, wf.taskQueue)}</Typography>
                    </ListingTable.Cell>
                  )}
                  <ListingTable.Cell>
                    <StatusChip status={wf.status} />
                  </ListingTable.Cell>
                  <ListingTable.Cell>
                    <DateTime value={wf.startTime} />
                  </ListingTable.Cell>
                </ListingTable.Row>
              ))}
            </ListingTable.Body>
          </ListingTable>
          <ListFooter count={items.length} singular="instance" plural="instances" hasMore={hasNextPage} loadingMore={isFetchingNextPage || isPreparing(data?.pages[data.pages.length - 1])} onLoadMore={() => fetchNextPage()} />
        </>
      )}

      {startOpen && <StartWorkflowDialog scope={scope} onClose={() => setStartOpen(false)} onToast={onToast} />}
      {detail && <WorkflowDetailDrawer scope={ownerScope(scope, detail.taskQueue)} workflowId={detail.workflowId} onClose={() => setDetail(null)} />}
    </>
  );
}

export function StartWorkflowDialog({ scope, initialWorkflowType, onClose, onToast }: { scope: PortalScope; initialWorkflowType?: string; onClose: () => void; onToast: (t: Toast) => void }) {
  // `/definitions` is runtime-local, so each definition already names the runtime hosting it. That
  // makes the chosen workflow the choice of integration too — no separate target picker needed, and
  // at project scope the dropdown is the union over every integration.
  const definitions = useWorkflowDefinitionsAcross(scope.targets, scope.environmentId);
  const multi = scope.targets.length > 1;
  const [selected, setSelected] = useState<Owned<WorkflowDefinition> | null>(null);
  const targetScope: WorkflowScope = { componentId: selected?.componentId ?? '', environmentId: scope.environmentId };
  const start = useStartWorkflow(targetScope);
  const [workflowId, setWorkflowId] = useState('');
  const [timeout, setTimeoutVal] = useState('');
  const [formValues, setFormValues] = useState<Record<string, string | boolean>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [startError, setStartError] = useState<string | null>(null);
  const [started, setStarted] = useState<{ workflowType: string; workflowId: string } | null>(null);
  const navigate = useNavigate();
  const navScope = useScope();

  // A deep link (e.g. Overview → "Start Workflow") names a workflow type only; bind it to a concrete
  // definition — and thereby to its runtime — once the definitions have loaded.
  useEffect(() => {
    if (!initialWorkflowType || selected) return;
    const match = definitions.items.find((d) => d.workflowType === initialWorkflowType);
    if (match) setSelected(match);
  }, [initialWorkflowType, selected, definitions.items]);

  // When the input schema parses into fields, a generated form replaces the raw JSON input.
  const formFields = selected ? parseFormSchema(selected.inputSchema) : null;

  const setFormValue = (name: string, value: string | boolean) => {
    setFormValues((prev) => ({ ...prev, [name]: value }));
    setFieldErrors((prev) => {
      if (!(name in prev)) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  };

  const submit = () => {
    if (!selected) return;
    setStartError(null);
    let parsedInput: unknown;
    if (formFields) {
      const { result, errors } = buildFormResult(formFields, formValues);
      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        return;
      }
      parsedInput = Object.keys(result).length > 0 ? result : undefined;
    }
    start.mutate(
      {
        workflowType: selected.workflowType,
        input: parsedInput,
        workflowId: workflowId.trim() || undefined,
        timeoutSeconds: timeout.trim() ? Number(timeout) : undefined,
      },
      {
        onSuccess: (wf) => {
          if (wf?.workflowId) {
            setStarted({ workflowType: selected.workflowType, workflowId: wf.workflowId });
          } else {
            onToast({ severity: 'success', message: `Started ${selected.workflowType}.` });
            onClose();
          }
        },
        onError: (e) => setStartError(e instanceof Error && e.message ? e.message : 'Failed to start workflow.'),
      },
    );
  };

  const copyWorkflowId = async () => {
    if (!started) return;
    try {
      await navigator.clipboard.writeText(started.workflowId);
      onToast({ severity: 'success', message: 'Workflow ID copied to clipboard.' });
    } catch {
      onToast({ severity: 'error', message: 'Failed to copy workflow ID.' });
    }
  };

  const viewInstance = () => {
    if (!started) return;
    onClose();
    navigate(`${resourceUrl(navScope, 'workflows')}?tab=management&workflowId=${encodeURIComponent(started.workflowId)}&env=${encodeURIComponent(scope.environmentId)}`);
  };

  if (started) {
    return (
      <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle sx={sectionTitleSx}>Workflow Started</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mt: 1 }}>
            <strong>{started.workflowType}</strong> workflow started with workflow ID{' '}
            <Typography component="code" sx={{ fontFamily: 'monospace', fontSize: 13, bgcolor: 'action.hover', border: '1px solid', borderColor: 'divider', borderRadius: 0.5, px: 0.75, py: 0.25 }}>
              {started.workflowId}
            </Typography>
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Close</Button>
          <Button startIcon={<Copy size={14} />} onClick={copyWorkflowId}>
            Copy Workflow ID
          </Button>
          <Button variant="contained" startIcon={<Eye size={14} />} onClick={viewInstance}>
            View Running Workflow
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={sectionTitleSx}>Start Workflow</DialogTitle>
      <DialogContent>
        <Stack gap={2} sx={{ mt: 1 }}>
          <Autocomplete
            options={definitions.items}
            loading={definitions.isLoading}
            getOptionLabel={(d) => (multi ? `${d.workflowType} — ${d.componentName}` : d.workflowType)}
            value={selected}
            isOptionEqualToValue={(a, b) => a.workflowType === b.workflowType && a.componentId === b.componentId}
            onChange={(_, v) => {
              setSelected(v);
              // The input schema is per definition, so switching invalidates anything already typed.
              setFormValues({});
              setFieldErrors({});
              setStartError(null);
            }}
            renderInput={(params) => <TextField {...params} label="Workflow Name" required placeholder="Select a workflow" />}
          />
          <DefinitionsUnavailableNotice failed={definitions.failed} />
          <SubmitError message={startError} onClear={() => setStartError(null)} />
          {selected && (
            <SectionCard title="Input">
              {formFields ? (
                <SchemaFormFields fields={formFields} values={formValues} errors={fieldErrors} onChange={setFormValue} />
              ) : selected.inputSchema ? (
                <SchemaDisclosure schema={selected.inputSchema} />
              ) : (
                <Typography variant="caption" color="text.secondary">
                  This workflow takes no input.
                </Typography>
              )}
            </SectionCard>
          )}
          {selected && (
            <SectionCard title="Advanced" collapsible defaultOpen={false}>
              <Stack gap={2}>
                <TextField
                  label="Workflow ID"
                  fullWidth
                  size="small"
                  value={workflowId}
                  onChange={(e) => setWorkflowId(e.target.value)}
                  helperText="Names this run so it can be found or referenced later. Left empty, the runtime assigns one; a second start with the same ID is rejected while the first is running."
                />
                <TextField
                  label="Timeout (seconds)"
                  type="number"
                  size="small"
                  fullWidth
                  value={timeout}
                  onChange={(e) => setTimeoutVal(e.target.value)}
                  placeholder="e.g. 300"
                  slotProps={{ inputLabel: { shrink: true } }}
                  helperText="The longest this run may take end to end before it is timed out. Left empty, the workflow's own limit applies."
                />
              </Stack>
            </SectionCard>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!selected || start.isPending} onClick={submit}>
          {start.isPending ? 'Starting…' : 'Start'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Review activity detail (opened from the unified Human Tasks queue) ──────────

export function reviewTriggerLabel(trigger?: string): string {
  if (trigger === 'PRE_RUN') return 'Approval gate — review before the activity runs';
  if (trigger === 'ON_FAILURE') return 'Review failure — decide the failed activity\u2019s retry';
  return trigger || '—';
}

function reviewActivityDisplayName(taskName?: string, activityName?: string, fallback = ''): string {
  const { task } = splitQualifiedName(taskName ?? activityName);
  return task ?? fallback;
}

function reviewDecisionLabel(action: unknown): string | undefined {
  switch (action) {
    case 'proceed':
      return 'Proceeded — reran the activity with the original input';
    case 'proceed-with-input':
      return 'Proceeded with changes';
    case 'reject':
      return 'Rejected — the failure was surfaced to the workflow';
    default:
      return typeof action === 'string' && action ? action : undefined;
  }
}

export function ReviewActivityDetailDialog({ scope, taskId, onClose, onToast }: { scope: WorkflowScope; taskId: string; onClose: () => void; onToast: (t: Toast) => void }) {
  const [pausePolling, setPausePolling] = useState(false);
  const { data: activityResult, isLoading, error: loadError } = useReviewActivity(scope, taskId, pausePolling);
  const activity = valueOf(activityResult);
  // A decision form whose fields are still being prepared shows a spinner, not blank inputs.
  const waiting = isLoading || isPreparing(activityResult);
  const refreshing = isRefreshing(activityResult);
  const decide = useReviewDecision(scope);
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [confirmProceedOpen, setConfirmProceedOpen] = useState(false);
  const [reviewChangesOpen, setReviewChangesOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  // Polling pauses while deciding; mirrored into state because the hook call sits above these declarations.
  const editing = mode === 'edit' || confirmProceedOpen || reviewChangesOpen || rejectOpen;
  if (editing !== pausePolling) setPausePolling(editing);
  const [formValues, setFormValues] = useState<Record<string, string | boolean>>({});
  const [originalValues, setOriginalValues] = useState<Record<string, string | boolean>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [rawText, setRawText] = useState('{}');
  const [rawErr, setRawErr] = useState('');
  const [feedback, setFeedback] = useState('');
  // The input confirmed in the second step — built once when entering it.
  const [pendingInput, setPendingInput] = useState<unknown>(null);
  // Message from a rejected decision — shown inline; see SubmitError.
  const [decideError, setDecideError] = useState<string | null>(null);

  const formFields = parseFormSchema(activity?.formSchema);
  // Only a PENDING activity can be acted on; COMPLETED/CANCELED/TERMINATED are view-only.
  const canDecide = activity?.status === 'PENDING';
  const { workflow } = splitQualifiedName(activity?.taskName ?? activity?.activityName);
  const heading = activity?.title || reviewActivityDisplayName(activity?.taskName, activity?.activityName, taskId);
  const argsJson = activity?.activityArgs ? jsonPretty(activity.activityArgs) : null;

  // The decision is not in the activity detail: a review IS a workflow (id = taskId), so read its own result.
  const isCompleted = (activity?.status ?? '').toUpperCase() === 'COMPLETED';
  const { data: decisionHistory } = useWorkflowHistory(scope, isCompleted ? taskId : null);
  const decision = useMemo<Record<string, unknown> | null>(() => {
    const events = valueOf(decisionHistory) ?? [];
    if (!Array.isArray(events) || events.length === 0) return null;
    const raw = extractNodeExecutionDetail({ id: '', type: 'WORKFLOW' }, events as Array<Record<string, unknown>>).result;
    if (raw == null) return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }, [decisionHistory]);

  useEffect(() => {
    if (!activity) return;
    const fields = parseFormSchema(activity.formSchema);
    const seeded = fields ? formValuesFromObject(fields, activity.activityArgs ?? {}) : {};
    setFormValues(seeded);
    setOriginalValues(seeded);
    setRawText(jsonPretty(activity.activityArgs ?? {}) || '{}');
  }, [activity]);

  const setFormValue = (name: string, value: string | boolean) => {
    setFormValues((prev) => ({ ...prev, [name]: value }));
    setFieldErrors((prev) => {
      if (!(name in prev)) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  };

  const changes = formFields ? diffFormValues(formFields, originalValues, formValues) : [];

  const runDecision = (decision: ReviewDecision, input?: unknown, feedbackText?: string) => {
    setDecideError(null);
    decide.mutate(
      { taskId, decision, input, feedback: feedbackText },
      {
        onSuccess: () => {
          onToast({ severity: 'success', message: decision === 'reject' ? 'Activity rejected.' : 'Activity proceeded.' });
          onClose();
        },
        onError: (e) => {
          // The error banner lives in the drawer; an overlay left open would hide it.
          setConfirmProceedOpen(false);
          setReviewChangesOpen(false);
          setRejectOpen(false);
          setDecideError(e instanceof Error && e.message ? e.message : 'Action failed.');
        },
      },
    );
  };

  // Step one of the edited path: validate and stage; the review-changes step submits.
  const stageEdited = () => {
    if (formFields) {
      const { result, errors } = buildFormResult(formFields, formValues);
      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        return;
      }
      setPendingInput(result);
      setReviewChangesOpen(true);
      return;
    }
    try {
      setPendingInput(rawText.trim() ? JSON.parse(rawText) : {});
      setReviewChangesOpen(true);
    } catch {
      setRawErr('Arguments must be valid JSON.');
    }
  };

  const closeEdit = () => {
    setMode('view');
    setFieldErrors({});
    setRawErr('');
    setDecideError(null);
  };

  const busy = decide.isPending;

  const stepButtons = (...buttons: ReactNode[]) => (
    <Stack direction="row" justifyContent="flex-end" gap={1}>
      {buttons}
    </Stack>
  );

  return (
    <DetailDrawer title={heading} status={activity?.status} onClose={onClose}>
      {waiting ? (
        <CircularProgress size={24} sx={{ display: 'block', mx: 'auto', py: 4 }} />
      ) : loadError || !activity ? (
        <Typography sx={emptySx}>{loadError instanceof Error ? loadError.message : 'Failed to load activity details.'}</Typography>
      ) : (
        <Stack gap={2}>
          <SubmitError message={decideError} onClear={() => setDecideError(null)} />
          <RefreshingNote show={refreshing} />
          {activity.description && (
            <SectionCard title="Description">
              <Typography variant="body2" color="text.secondary">
                {activity.description}
              </Typography>
            </SectionCard>
          )}

          <SectionCard title="Activity" collapsible>
            <Stack gap={1.25}>
              <DetailRow label="Activity Name">{reviewActivityDisplayName(activity.taskName, activity.activityName, '') || <NotProvided />}</DetailRow>
              <DetailRow label="Workflow Name">{workflow ?? <NotProvided />}</DetailRow>
              <DetailRow label="Parent Workflow">
                <WorkflowIdLink workflowId={activity.parentWorkflowId} environmentId={scope.environmentId} onNavigate={onClose} truncate copy />
              </DetailRow>
              <DetailRow label="Trigger">{reviewTriggerLabel(activity.trigger)}</DetailRow>
              <DetailRow label="Created">
                <DateTime value={activity.startTime} />
              </DetailRow>
              {activity.errorMessage && <DetailRow label="Error">{activity.errorMessage}</DetailRow>}
            </Stack>
          </SectionCard>

          {mode !== 'edit' && argsJson && <StructuredValue title="Activity Arguments" readOnly raw={argsJson} environmentId={scope.environmentId} collapsible />}

          {isCompleted && (activity.decidedBy || activity.decidedAt || decision) && (
            <SectionCard title="Decision">
              <Stack gap={1.25}>
                <DetailRow label="Decision">{reviewDecisionLabel(decision?.['action']) ?? <NotProvided />}</DetailRow>
                <DetailRow label="Decided By">{activity.decidedBy ? <IdText id={activity.decidedBy} /> : <NotProvided />}</DetailRow>
                <DetailRow label="Decided At">{activity.decidedAt ? formatTime(activity.decidedAt) : <NotProvided />}</DetailRow>
                {typeof decision?.['feedback'] === 'string' && decision['feedback'] ? <DetailRow label="Feedback">{decision['feedback'] as string}</DetailRow> : null}
              </Stack>
            </SectionCard>
          )}
          {isCompleted && decision?.['input'] != null && <StructuredValue title="Submitted Input" raw={jsonPretty(decision['input']) || ''} environmentId={scope.environmentId} collapsible />}

          {/* Either manage permission can decide a review — the proxy accepts both. */}
          {canDecide && (
            <Authorized permissions={[Permissions.WORKFLOW_MANAGE_WORKFLOWS, Permissions.WORKFLOW_MANAGE_HUMAN_TASKS]}>
              <SectionCard title="Decisions">
                <Stack gap={2}>
                  <Stack direction="row" flexWrap="wrap" gap={1.5}>
                    <ActionCard
                      title="Proceed"
                      subtitle={activity.trigger === 'ON_FAILURE' ? 'Retry with the original arguments.' : 'Run with the original arguments.'}
                      info={
                        activity.trigger === 'ON_FAILURE'
                          ? 'Retries the failed activity with the arguments exactly as recorded above. Confirmed before anything runs.'
                          : 'Runs the activity with the arguments exactly as recorded above. Confirmed before anything runs.'
                      }
                      disabled={busy}
                      onClick={() => {
                        // Only one decision open at a time: close any open editor first.
                        closeEdit();
                        setConfirmProceedOpen(true);
                      }}
                    />
                    <ActionCard
                      title="Proceed with Changes"
                      subtitle="Edit the arguments first."
                      info="Opens the arguments for editing; what changed is shown side by side before the retry is confirmed."
                      selected={mode === 'edit'}
                      disabled={busy}
                      onClick={() => (mode === 'edit' ? closeEdit() : setMode('edit'))}
                    />
                    <ActionCard
                      title="Reject"
                      subtitle="Fail the activity instead."
                      info="Completes the review as a failure and propagates it to the workflow, which decides what happens next. This cannot be undone."
                      selected={rejectOpen}
                      disabled={busy}
                      onClick={() => {
                        closeEdit();
                        setRejectOpen(true);
                      }}
                    />
                  </Stack>

                  {mode === 'edit' && (
                    <Stack gap={2} sx={{ borderTop: '1px solid', borderColor: 'divider', pt: 2 }}>
                      <Typography variant="body2" color="text.secondary">
                        {formFields ? (changes.length === 0 ? 'No changes yet — edit the values to use.' : `Changed: ${changes.map((c) => c.label).join(', ')}`) : 'This activity declares no schema; edit the raw JSON to use.'}
                      </Typography>
                      {formFields ? (
                        <SchemaFormFields fields={formFields} values={formValues} errors={fieldErrors} onChange={setFormValue} />
                      ) : (
                        <TextField
                          label="Arguments (JSON)"
                          fullWidth
                          multiline
                          minRows={5}
                          value={rawText}
                          onChange={(e) => {
                            setRawText(e.target.value);
                            setRawErr('');
                          }}
                          error={!!rawErr}
                          helperText={rawErr}
                          slotProps={{ input: { sx: { fontFamily: 'monospace', fontSize: 13 } } }}
                        />
                      )}
                      {stepButtons(
                        <Button key="b" disabled={busy} onClick={closeEdit}>
                          Cancel
                        </Button>,
                        <Button key="r" variant="contained" disabled={busy} onClick={stageEdited}>
                          Review Changes
                        </Button>,
                      )}
                    </Stack>
                  )}
                </Stack>
              </SectionCard>
            </Authorized>
          )}

          <Dialog open={confirmProceedOpen} onClose={() => !busy && setConfirmProceedOpen(false)} maxWidth="sm" fullWidth>
            <DialogTitle>Confirm Proceed</DialogTitle>
            <DialogContent>
              <Stack gap={2} sx={{ pt: 0.5 }}>
                <Alert severity="info">The activity {activity.trigger === 'ON_FAILURE' ? 'retries' : 'runs'} with the original arguments below. This cannot be undone.</Alert>
                <StructuredValue title="Arguments" raw={argsJson || '{}'} environmentId={scope.environmentId} />
              </Stack>
            </DialogContent>
            <DialogActions>
              <Button disabled={busy} onClick={() => setConfirmProceedOpen(false)}>
                Back
              </Button>
              <Button variant="contained" disabled={busy} onClick={() => runDecision('proceed-with-input', activity?.activityArgs ?? {})}>
                {busy ? 'Submitting…' : 'Proceed'}
              </Button>
            </DialogActions>
          </Dialog>

          <Dialog open={reviewChangesOpen} onClose={() => !busy && setReviewChangesOpen(false)} maxWidth="sm" fullWidth>
            <DialogTitle>Review Changes</DialogTitle>
            <DialogContent>
              <Stack gap={2} sx={{ pt: 0.5 }}>
                <Alert severity="info">The activity {activity.trigger === 'ON_FAILURE' ? 'retries' : 'runs'} with the edited arguments below. This cannot be undone.</Alert>
                {formFields ? (
                  changes.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                      Nothing was changed — this is the same as Proceed with the original arguments.
                    </Typography>
                  ) : (
                    <Stack gap={1}>
                      {changes.map((c) => (
                        <Stack key={c.path} direction="row" gap={1} alignItems="baseline" sx={{ flexWrap: 'wrap' }}>
                          <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 140 }}>
                            {c.label}
                          </Typography>
                          <Typography variant="body2" sx={{ color: 'text.disabled', textDecoration: 'line-through', wordBreak: 'break-word' }}>
                            {c.from}
                          </Typography>
                          <Typography variant="body2" sx={{ color: 'success.main', wordBreak: 'break-word' }}>
                            {c.to}
                          </Typography>
                        </Stack>
                      ))}
                    </Stack>
                  )
                ) : (
                  <StructuredValue title="Arguments to Submit" raw={jsonPretty(pendingInput) || '{}'} environmentId={scope.environmentId} />
                )}
              </Stack>
            </DialogContent>
            <DialogActions>
              <Button disabled={busy} onClick={() => setReviewChangesOpen(false)}>
                Back
              </Button>
              <Button variant="contained" disabled={busy} onClick={() => runDecision('proceed-with-input', pendingInput)}>
                {busy ? 'Submitting…' : 'Proceed with Changes'}
              </Button>
            </DialogActions>
          </Dialog>

          <Dialog open={rejectOpen} onClose={() => !busy && setRejectOpen(false)} maxWidth="sm" fullWidth>
            <DialogTitle>Reject Activity</DialogTitle>
            <DialogContent>
              <Stack gap={2} sx={{ pt: 0.5 }}>
                <Alert severity="warning">Rejecting is a fail operation: the review completes, and the failure is propagated to the workflow — the workflow decides what happens next. This cannot be undone.</Alert>
                <TextField label="Feedback (optional)" fullWidth multiline minRows={2} value={feedback} onChange={(e) => setFeedback(e.target.value)} helperText="Relayed to the workflow as the rejection reason." />
              </Stack>
            </DialogContent>
            <DialogActions>
              <Button disabled={busy} onClick={() => setRejectOpen(false)}>
                Back
              </Button>
              <Button variant="contained" color="error" disabled={busy} onClick={() => runDecision('reject', undefined, feedback.trim() || undefined)}>
                {busy ? 'Submitting…' : 'Reject Activity'}
              </Button>
            </DialogActions>
          </Dialog>
        </Stack>
      )}
    </DetailDrawer>
  );
}
