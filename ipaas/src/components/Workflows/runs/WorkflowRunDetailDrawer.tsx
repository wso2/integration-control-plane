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

import { Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, DrawerPanel, IconButton, Skeleton, Snackbar, Stack, TextField, Tooltip, Typography } from '@wso2/oxygen-ui';
import { Bug, Rows3, Workflow } from '@wso2/oxygen-ui-icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState, type JSX, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import CodeViewer from '../../CodeViewer';
import ConfirmDeleteDialog from '../../ConfirmDeleteDialog';
import CopyButton from '../../Overview/integration-as-api/CopyButton';
import { formatDateTime } from '../../../utils/time';
import { retryWorkflowRead } from '../api/http';
import { workflowKeys } from '../api/queryKeys';
import { isSettling, markSettling } from '../api/settleRegistry';
import type { WorkflowInstanceSummary, WorkflowLifecycleAction, WorkflowStatus } from '../api/types';
import type { ReadyWorkflowApi } from '../api/useWorkflowApi';
import { descriptorChecksum, useWorkflowMetadata, workflowGraphFor } from '../api/workflowMetadataApi';
import FlowRail from '../flow/FlowRail';
import { flowUnavailable } from '../flow/flowAvailability';
import { composeInstanceGraph } from '../flow/instanceGraph';
import { jsonPretty } from '../forms/schemaForm';
import type { InstanceGraph, TimelineSpan, UnmatchedNode } from '../model/workflowFlow';
import { buildTimeline, extractNodeExecutionDetail, extractWorkflowInput } from '../model/workflowHistory';
import { whenAutoRefresh } from '../shared/autoRefresh';
import { DetailList, DetailRow, NotProvided, SectionCard } from '../shared/DetailSections';
import StatusChip from '../shared/StatusChip';
import { retryAction } from '../shared/retryAction';
import StructuredValue from '../shared/StructuredValue';
import { useOpenMaximized } from '../shared/useOpenMaximized';
import { formatDurationBetween } from '../shared/workflowDuration';
import { WORKFLOW_STATUS_CHIP_COLOR, WORKFLOW_STATUS_LABEL } from '../shared/workflowStatus';
import { ComingSoonInline } from '../../../pages/ComingSoon';
import { CALLS_CARRY_ROLES } from '../connection/workflowCredential';
import ResetWorkflowDialog from './ResetWorkflowDialog';
import { invalidateRun } from './runQueries';
import WorkflowNodeDetailPanel from './WorkflowNodeDetailPanel';
import WorkflowTimeline from './WorkflowTimeline';
import * as styles from './WorkflowRunDetailDrawer.styles';

interface WorkflowRunDetailDrawerProps {
  /** The run to show, as its list row has it; null closes the drawer. */
  run: WorkflowInstanceSummary | null;
  api: ReadyWorkflowApi;
  onClose: () => void;
  /**
   * What the run's views the console can't serve yet offer meanwhile: the way to them in the User Portal. Without one,
   * the drawer doesn't point to the User Portal.
   */
  comingSoonAction?: ReactNode;
}

/** What the drawer says of the run's views the console can't serve yet; with a way to them, that the User Portal has them. */
const RUN_VIEWS_COMING_SOON = 'The execution graph, activity tree and timeline are coming to the console.';

const LIFECYCLE_ACTIONS: {
  action: WorkflowLifecycleAction;
  label: string;
  color: 'primary' | 'warning' | 'error';
  /** The statuses this action is meaningful from; the engine 409s from any other. */
  from: WorkflowStatus[];
}[] = [
  // Ends an in-progress sleep tool call early; offered for agent runs only.
  { action: 'wake', label: 'Wake', color: 'primary', from: ['RUNNING'] },
  { action: 'suspend', label: 'Suspend', color: 'warning', from: ['RUNNING'] },
  { action: 'resume', label: 'Resume', color: 'primary', from: ['SUSPENDED'] },
  { action: 'cancel', label: 'Cancel', color: 'error', from: ['RUNNING', 'SUSPENDED'] },
  { action: 'terminate', label: 'Terminate', color: 'error', from: ['RUNNING', 'SUSPENDED'] },
];

const OPEN_STATUSES: WorkflowStatus[] = ['RUNNING', 'SUSPENDED'];

/** How often an open run's reads poll, so its timeline, rail and details stay live. */
const LIVE_POLL_MS = 3000;

/** What the detail card shows: one execution, named by the id of the event that opened it. */
interface DetailTarget {
  id: string;
  label: string;
  type: string;
  status?: string;
}

interface Notice {
  open: boolean;
  message: string;
  severity: 'success' | 'error';
}

/** An id in full, with a button that copies it. */
function FullId({ id }: { id: string }): JSX.Element {
  return (
    <Box sx={styles.idRow}>
      <Box component="span" sx={styles.summaryId}>
        {id}
      </Box>
      <CopyButton value={id} label="Copy ID" />
    </Box>
  );
}

/**
 * One line per step that ran but could not be placed. A step may be unplaced more than once (a
 * review task reached twice), so a repeat is numbered in its key.
 */
function unplacedLines(unplaced: UnmatchedNode[]): { key: string; line: string }[] {
  const seen = new Map<string, number>();
  return unplaced.map((u) => {
    const name = u.label ?? u.stepId ?? 'A step';
    let line = name;
    if (u.status) {
      line = u.reason ? `${name} · ${u.status}: ${u.reason}` : `${name} · ${u.status}`;
    } else if (u.reason) {
      line = `${name}: ${u.reason}`;
    }
    const repeat = (seen.get(line) ?? 0) + 1;
    seen.set(line, repeat);
    return { key: `${line}#${repeat}`, line };
  });
}

function railCaption(graph: InstanceGraph | undefined): string {
  if (graph?.graphSource === 'history') {
    return 'Drawn from the steps this run executed, in order. The integration does not report its workflow’s structure (it needs a workflow module that serves it), so steps that never ran are not shown.';
  }
  if (graph?.graphKind === 'agent') {
    return 'The agent as declared. Reference only.';
  }
  return 'Approximation of execution flow using checkpoints. Reference only.';
}

/** Rows shaped like the rail's, while the run's steps load. */
function RailSkeleton(): JSX.Element {
  return (
    <Box sx={styles.railSkeleton} aria-busy="true">
      {[72, 60, 84, 66].map((width) => (
        <Skeleton key={width} variant="rounded" width={`${width}%`} height={28} />
      ))}
    </Box>
  );
}

/**
 * A run's execution view. It opens maximized over the page, with the lifecycle actions, the run's summary with
 * its input and result, then the flow rail beside the timeline.
 *
 * Both panes read the run's history. The timeline is rebuilt from it, so running spans are live,
 * and a selected step's input, result and failure are decoded from it. The rail draws the
 * instance graph, folded from the activity tree against the workflow's descriptor when the engine
 * serves one, or against the steps that ran when it does not (`chainFromExecutions`).
 *
 * The two panes steer each other. Picking a rail step filters the timeline to that
 * step's executions and opens the first one's details. Picking a span highlights its step on the
 * rail and opens that span's details.
 */
export default function WorkflowRunDetailDrawer({ run, api, onClose, comingSoonAction }: WorkflowRunDetailDrawerProps): JSX.Element {
  const { client } = api;
  const { scopeId } = api.connection;
  const maximized = useOpenMaximized(run?.runId);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [railHighlight, setRailHighlight] = useState<string | null>(null);
  const [target, setTarget] = useState<DetailTarget | null>(null);
  // The flow opens as the activity diagram; the compact list (`chart`) is one toggle away.
  const [railVariant, setRailVariant] = useState<'chart' | 'uml'>('uml');
  // The flow's share of the flow + timeline pair: a percentage, so both cards
  // give way together when the detail card opens beside them, and take the room back on close.
  const [railPct, setRailPct] = useState(40);
  const splitRef = useRef<HTMLDivElement>(null);
  const startResize = (event: ReactPointerEvent) => {
    event.preventDefault();
    const move = (e: PointerEvent) => {
      const rect = splitRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) {
        return;
      }
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setRailPct(Math.min(70, Math.max(20, pct)));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const metadata = useWorkflowMetadata(api);
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<Notice>({ open: false, message: '', severity: 'success' });
  const notify = (message: string, severity: Notice['severity']) => setNotice({ open: true, message, severity });
  const [actionInFlight, setActionInFlight] = useState<WorkflowLifecycleAction | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [terminateOpen, setTerminateOpen] = useState(false);
  const [terminateReason, setTerminateReason] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);

  const workflowId = run?.workflowId ?? '';
  const runId = run?.runId;
  const enabled = !!run;
  // A run's own reads are served only to a caller with roles (CALLS_CARRY_ROLES): without them none
  // is sent, the list row stands in for the run, and nothing derived from those reads is shown.
  const readsDetails = enabled && CALLS_CARRY_ROLES;

  // A run opens with nothing selected, never with whatever the last one left behind.
  const [selectionFor, setSelectionFor] = useState(runId);
  if (selectionFor !== runId) {
    setSelectionFor(runId);
    setSelectedStepId(null);
    setRailHighlight(null);
    setTarget(null);
  }

  // Every read of an open run polls, so its timeline, rail and details stay live.
  const isLive = (current: WorkflowStatus | undefined) => OPEN_STATUSES.includes(current ?? 'UNKNOWN') || isSettling(workflowId);

  // The instance read keeps the status current while open; without it, the page passes the run's
  // current row from the polled list.
  const { data: info } = useQuery({
    queryKey: workflowKeys.instance(scopeId, workflowId, runId),
    queryFn: () => client.instances.get(workflowId, runId),
    enabled: readsDetails,
    retry: false,
    refetchInterval: (query) => whenAutoRefresh(isLive(query.state.data?.status ?? run?.status) ? LIVE_POLL_MS : false),
  });
  const status: WorkflowStatus = info?.status ?? run?.status ?? 'UNKNOWN';
  const live = isLive(status);
  const pollWhileLive = () => whenAutoRefresh(isLive(status) ? LIVE_POLL_MS : false);

  const {
    data: events,
    isPending: historyPending,
    isError: isHistoryError,
    refetch: refetchHistory,
  } = useQuery({
    queryKey: workflowKeys.history(scopeId, workflowId, runId),
    queryFn: () => client.instances.history(workflowId, runId),
    enabled: readsDetails,
    retry: retryWorkflowRead,
    refetchInterval: pollWhileLive,
  });
  const {
    data: activityNodes,
    isPending: treePending,
    isError: isTreeError,
    refetch: refetchTree,
  } = useQuery({
    queryKey: workflowKeys.activityTree(scopeId, workflowId, runId),
    queryFn: () => client.instances.activityTree(workflowId, runId),
    enabled: readsDetails,
    retry: retryWorkflowRead,
    refetchInterval: pollWhileLive,
  });
  // The reads stop polling as soon as the run is seen closed, so their last page can predate the
  // close: read both once more when it closes.
  const wasLive = useRef(live);
  useEffect(() => {
    if (wasLive.current && !live && enabled) {
      void queryClient.invalidateQueries({ queryKey: workflowKeys.history(scopeId, workflowId, runId) });
      void queryClient.invalidateQueries({ queryKey: workflowKeys.activityTree(scopeId, workflowId, runId) });
    }
    wasLive.current = live;
  }, [live, enabled, queryClient, scopeId, workflowId, runId]);

  const history = useMemo(() => events ?? [], [events]);
  const timeline = useMemo(() => buildTimeline(history), [history]);
  // The list row was read when the run was opened, so a run that closes while open takes its close time from its history.
  const workflowSpan = timeline.spans.find((span) => span.key === 'workflow');
  const closeTime = run?.closeTime ?? (workflowSpan && !workflowSpan.running ? new Date(workflowSpan.end).toISOString() : null);
  const workflowInput = useMemo(() => extractWorkflowInput(history), [history]);
  const workflowResult = useMemo(() => {
    if (info && info.result !== null && info.result !== undefined) {
      return info.result;
    }
    // The instance read reports null for some results; the terminal event does not.
    return extractNodeExecutionDetail({ id: '', type: 'WORKFLOW' }, history).result;
  }, [info, history]);

  const instanceGraph = useMemo(() => {
    if (!run || !activityNodes) {
      return undefined;
    }
    const published = workflowGraphFor(metadata, run.workflowType);
    return composeInstanceGraph({
      workflowType: run.workflowType,
      status,
      nodes: activityNodes,
      model: published?.graph ?? null,
      graphKind: published?.graphKind,
      descriptorChecksum: descriptorChecksum(metadata),
    });
  }, [run, activityNodes, status, metadata]);
  // Until the steps and the descriptor are in, the rail is loading, not missing.
  const railLoading = readsDetails && ((treePending && !activityNodes) || metadata.status === 'loading');
  const railMessage = railLoading ? null : flowUnavailable(instanceGraph);
  // The run's own kind says it is an agent even when no descriptor does.
  const isAgent = run?.kind === 'AGENT' || instanceGraph?.graphKind === 'agent';
  // Only once the history is read: before that (or without it) the result is unknown, not absent.
  const completedNoResult = status === 'COMPLETED' && !historyPending && (workflowResult === null || workflowResult === undefined);

  // Which step the run reached, for the rail's "you are here" mark. Only meaningful while running.
  const currentStepId = useMemo(() => {
    if (!instanceGraph || status !== 'RUNNING') {
      return null;
    }
    const ids = Object.keys(instanceGraph.steps);
    return ids.length > 0 ? ids[ids.length - 1] : null;
  }, [instanceGraph, status]);

  const stepOfEvent = useMemo(() => {
    const map = new Map<string, string>();
    Object.entries(instanceGraph?.steps ?? {}).forEach(([stepId, exec]) => exec.eventIds.forEach((id) => map.set(id, stepId)));
    return map;
  }, [instanceGraph]);

  const eventIdsOf = (stepId: string): Set<string> => new Set(instanceGraph?.steps[stepId]?.eventIds ?? []);
  const visibleIds = selectedStepId ? eventIdsOf(selectedStepId) : null;

  const selectSpan = (span: TimelineSpan | null) => {
    setTarget(span ? { id: span.eventId ?? span.key, label: span.label, type: span.category, status: span.status || undefined } : null);
    setRailHighlight(span?.eventId ? (stepOfEvent.get(span.eventId) ?? null) : null);
  };

  const selectStep = (stepId: string | null) => {
    setSelectedStepId(stepId);
    if (!stepId) {
      return;
    }
    const ids = eventIdsOf(stepId);
    const span = timeline.spans.find((s) => ids.has(s.eventId ?? s.key));
    if (span) {
      selectSpan(span);
      return;
    }
    // No lane of its own on the timeline: open the step's latest execution directly.
    const step = instanceGraph?.steps[stepId];
    const lastEventId = step?.eventIds[step.eventIds.length - 1];
    setTarget(step && lastEventId ? { id: lastEventId, label: step.label ?? stepId, type: step.type ?? 'ACTIVITY', status: step.status } : null);
    setRailHighlight(stepId);
  };

  const targetDetail = useMemo(() => (target ? extractNodeExecutionDetail(target, history) : null), [target, history]);
  const targetStepId = target ? (stepOfEvent.get(target.id) ?? selectedStepId) : null;

  const handleLifecycleAction = (action: WorkflowLifecycleAction, reason?: string) => {
    if (!run) {
      return;
    }
    setActionInFlight(action);
    client.instances
      .action(run.workflowId, action, { runId: run.runId, reason })
      .then(() => {
        // Temporal accepts the request before its visibility store reflects it, so an immediate
        // refetch would read the old status and stop. Keep the run's reads polling for a while.
        markSettling(run.workflowId);
        invalidateRun(queryClient, scopeId, run.workflowId, run.runId);
        notify(`Workflow ${action} requested.`, 'success');
      })
      .catch((error: unknown) => notify(error instanceof Error ? error.message : `Could not ${action} this workflow run.`, 'error'))
      .finally(() => setActionInFlight(null));
  };

  const selectedStep = selectedStepId ? instanceGraph?.steps[selectedStepId] : undefined;
  const selectedCount = visibleIds?.size ?? 0;
  // Steps that ran but could not be placed on the diagram. An agent's calls are unplaceable by
  // design (they carry no step ids), so the note is for workflows, where it means the diagram is
  // incomplete: otherwise a step that ran reads as never executed and nothing says why.
  const unplaced = railMessage || !instanceGraph || instanceGraph.graphKind === 'agent' ? [] : instanceGraph.unmatched;

  let rail: ReactNode;
  if (railLoading) {
    rail = <RailSkeleton />;
  } else if (isTreeError && !activityNodes) {
    rail = (
      <Alert severity="error" action={retryAction(() => void refetchTree())}>
        Could not load this run’s steps.
      </Alert>
    );
  } else if (railMessage || !instanceGraph) {
    rail = (
      <Box sx={styles.railEmpty}>
        <Typography variant="caption" color="text.secondary">
          {railMessage ?? 'The workflow’s structure could not be loaded.'}
        </Typography>
      </Box>
    );
  } else {
    rail = <FlowRail data={instanceGraph} selectedStepId={selectedStepId ?? railHighlight} currentStepId={currentStepId} onSelect={selectStep} variant={railVariant} />;
  }
  const railToggleLabel = railVariant === 'chart' ? 'Diagram view' : 'List view';

  const closeTerminate = () => {
    setTerminateOpen(false);
    setTerminateReason('');
  };

  const statusLabel = WORKFLOW_STATUS_LABEL[status] ?? status;
  const summaryBadge = run && (
    <Box component="span" sx={styles.badge}>
      <StatusChip label={statusLabel} color={WORKFLOW_STATUS_CHIP_COLOR[status] ?? 'default'} />
      <Typography variant="body2" color="text.secondary">
        {formatDurationBetween(run.startTime, closeTime)}
      </Typography>
      {CALLS_CARRY_ROLES && (
        <Tooltip title="Debug information: the raw event history" placement="top">
          <IconButton size="small" aria-label="Show the raw event history" onClick={() => setHistoryOpen(true)}>
            <Bug size={15} />
          </IconButton>
        </Tooltip>
      )}
      <CopyButton value={jsonPretty(info ?? run)} label="Copy the run as JSON" />
    </Box>
  );

  const summaryActions = (
    <Box sx={styles.actions}>
      {LIFECYCLE_ACTIONS.filter(({ action, from }) => from.includes(status) && (action !== 'wake' || isAgent)).map(({ action, label, color }) => (
        <Button
          key={action}
          variant="outlined"
          color={color}
          size="small"
          disabled={actionInFlight !== null}
          startIcon={actionInFlight === action ? <CircularProgress size={14} color="inherit" /> : undefined}
          onClick={() => {
            // Cancelling and terminating cannot be undone, so both are confirmed first;
            // terminating with a reason.
            if (action === 'terminate') {
              setTerminateOpen(true);
            } else if (action === 'cancel') {
              setCancelOpen(true);
            } else {
              handleLifecycleAction(action);
            }
          }}>
          {label}
        </Button>
      ))}
      {/* Resetting starts from a reset point, and reset points are a run detail. */}
      {CALLS_CARRY_ROLES && (
        <Button variant="outlined" color="warning" size="small" disabled={actionInFlight !== null} onClick={() => setResetOpen(true)}>
          Reset…
        </Button>
      )}
    </Box>
  );

  return (
    <>
      <DrawerPanel open={!!run} onClose={onClose} width={styles.DRAWER_WIDTH} {...maximized}>
        <DrawerPanel.Header>
          <DrawerPanel.Title>Execution Details</DrawerPanel.Title>
          <DrawerPanel.Actions>
            <DrawerPanel.ExpandButton />
            <DrawerPanel.CloseButton />
          </DrawerPanel.Actions>
        </DrawerPanel.Header>
        <DrawerPanel.Body sx={styles.body}>
          {run && (
            <Box sx={styles.content}>
              <SectionCard title="Execution" badge={summaryBadge} actions={summaryActions}>
                <DetailList>
                  <DetailRow label="Workflow ID">
                    <FullId id={run.workflowId} />
                  </DetailRow>
                  <DetailRow label="Run ID">
                    <FullId id={run.runId} />
                  </DetailRow>
                  <DetailRow label="Workflow Definition Name">{run.workflowType}</DetailRow>
                  <DetailRow label="Started">{formatDateTime(run.startTime)}</DetailRow>
                  <DetailRow label="Closed">{closeTime ? formatDateTime(closeTime) : <NotProvided label="Still running" />}</DetailRow>
                  <DetailRow label="Task Queue">{run.taskQueue || <NotProvided />}</DetailRow>
                </DetailList>
                {info?.errorMessage && (
                  <Alert severity="error" sx={styles.summaryError}>
                    {info.errorMessage}
                  </Alert>
                )}
              </SectionCard>

              {(workflowInput !== null || workflowResult !== null || completedNoResult) && (
                <Box sx={styles.payloadRow}>
                  {workflowInput !== null && (
                    <Box sx={styles.payloadCell}>
                      <StructuredValue title="Workflow Input" value={workflowInput} />
                    </Box>
                  )}
                  {workflowResult !== null && (
                    <Box sx={styles.payloadCell}>
                      <StructuredValue title="Workflow Result" value={workflowResult} />
                    </Box>
                  )}
                  {workflowResult === null && completedNoResult && (
                    <Typography variant="caption" color="text.secondary" sx={styles.payloadNote}>
                      Completed with no return value.
                    </Typography>
                  )}
                </Box>
              )}

              {/* The flow and the timeline are drawn from the run's details, which the User Portal already shows. */}
              {!CALLS_CARRY_ROLES ? (
                <ComingSoonInline description={comingSoonAction ? `${RUN_VIEWS_COMING_SOON} Until then, publish this workflow to the User Portal to see them there.` : RUN_VIEWS_COMING_SOON} action={comingSoonAction} />
              ) : (
                <>
                  <Box sx={styles.flowHeader}>
                    <Typography variant="caption" color="text.secondary">
                      {railMessage ? 'No flow details available.' : railCaption(instanceGraph)}
                    </Typography>
                    {selectedStepId && (
                      <Chip size="small" color="primary" variant="outlined" label={`Filtered: ${selectedStep?.label ?? selectedStepId} · ${selectedCount} ${selectedCount === 1 ? 'execution' : 'executions'}`} onDelete={() => setSelectedStepId(null)} />
                    )}
                    {unplaced.length > 0 && (
                      <Tooltip
                        placement="bottom"
                        title={
                          <Box sx={styles.unplacedLines}>
                            <span>These ran, but this diagram has no step to draw them on; see the history for the full run.</span>
                            {unplacedLines(unplaced).map(({ key, line }) => (
                              <span key={key}>{line}</span>
                            ))}
                          </Box>
                        }>
                        <Chip size="small" color="warning" variant="outlined" label={`${unplaced.length} ${unplaced.length === 1 ? 'step is' : 'steps are'} not on this diagram`} />
                      </Tooltip>
                    )}
                  </Box>

                  <Box sx={styles.flowSplit}>
                    <Box ref={splitRef} sx={styles.flowPair}>
                      <Box sx={styles.railPane} style={{ width: `${railPct}%` }}>
                        {!railLoading && !railMessage && instanceGraph && (
                          <Tooltip placement="left" title={railToggleLabel}>
                            <Box sx={styles.railToggle}>
                              <IconButton size="small" aria-label={railToggleLabel} onClick={() => setRailVariant((current) => (current === 'chart' ? 'uml' : 'chart'))}>
                                {railVariant === 'chart' ? <Workflow size={15} /> : <Rows3 size={15} />}
                              </IconButton>
                            </Box>
                          </Tooltip>
                        )}
                        <Box sx={styles.railScroll}>{rail}</Box>
                      </Box>
                      <Box role="separator" aria-orientation="vertical" aria-label="Resize the flow pane" sx={styles.flowResizer} onPointerDown={startResize}>
                        <Box sx={styles.flowResizerGrip} />
                      </Box>
                      <Box sx={styles.timelinePane}>
                        {historyPending && <Skeleton variant="rounded" sx={styles.paneSkeleton} />}
                        {isHistoryError && events === undefined && (
                          <Alert severity="error" action={retryAction(() => void refetchHistory())}>
                            Could not load this run’s history.
                          </Alert>
                        )}
                        {events !== undefined && <WorkflowTimeline timeline={timeline} visibleIds={visibleIds} selectedKey={target?.id ?? null} onSelect={selectSpan} />}
                      </Box>
                    </Box>
                    {target && targetDetail && (
                      <WorkflowNodeDetailPanel
                        label={target.label}
                        type={target.type}
                        detail={targetDetail}
                        hasHistory={!isHistoryError && history.length > 0}
                        stepId={targetStepId}
                        step={targetStepId ? instanceGraph?.steps[targetStepId] : undefined}
                        onClose={() => selectSpan(null)}
                      />
                    )}
                  </Box>
                </>
              )}
            </Box>
          )}
        </DrawerPanel.Body>
      </DrawerPanel>

      {cancelOpen && (
        <ConfirmDeleteDialog
          title="Cancel Workflow"
          confirmLabel="Cancel Workflow"
          cancelLabel="Keep Running"
          isPending={false}
          onClose={() => setCancelOpen(false)}
          onConfirm={() => {
            setCancelOpen(false);
            handleLifecycleAction('cancel');
          }}>
          <Typography variant="body2">
            Cancel <strong>{workflowId}</strong>? The run is asked to stop, and the request cannot be undone.
          </Typography>
        </ConfirmDeleteDialog>
      )}

      {terminateOpen && (
        <ConfirmDeleteDialog
          title="Terminate Workflow"
          confirmLabel="Terminate"
          isPending={false}
          onClose={closeTerminate}
          onConfirm={() => {
            handleLifecycleAction('terminate', terminateReason.trim() || undefined);
            closeTerminate();
          }}>
          <Stack gap={2}>
            <Typography variant="body2">
              Terminate <strong>{workflowId}</strong> immediately? This cannot be undone.
            </Typography>
            <TextField labelPlacement="top" label="Reason" optional size="small" fullWidth value={terminateReason} onChange={(event) => setTerminateReason(event.target.value)} />
          </Stack>
        </ConfirmDeleteDialog>
      )}

      <Dialog open={historyOpen} onClose={() => setHistoryOpen(false)} maxWidth="lg" fullWidth>
        <DialogTitle>Event History</DialogTitle>
        <DialogContent>
          {history.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={styles.historyEmpty}>
              No history events.
            </Typography>
          ) : (
            <CodeViewer code={jsonPretty(history)} language="json" maxHeight="70vh" wrapLongLines />
          )}
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" color="inherit" onClick={() => setHistoryOpen(false)}>
            Close
          </Button>
        </DialogActions>
      </Dialog>

      <ResetWorkflowDialog open={resetOpen} run={run} api={client} scopeId={scopeId} onClose={() => setResetOpen(false)} onReset={() => notify('Workflow reset; a new run has started.', 'success')} />

      <Snackbar open={notice.open} autoHideDuration={4000} onClose={() => setNotice((current) => ({ ...current, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        <Alert severity={notice.severity} variant="filled" onClose={() => setNotice((current) => ({ ...current, open: false }))}>
          {notice.message}
        </Alert>
      </Snackbar>
    </>
  );
}
