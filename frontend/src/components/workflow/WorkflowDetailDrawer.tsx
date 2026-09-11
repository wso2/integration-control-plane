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

import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Drawer, FormControlLabel, IconButton, ListingTable, Radio, RadioGroup, Snackbar, Stack, TextField, Typography } from '@wso2/oxygen-ui';
import { Ban, BellRing, OctagonX, PauseCircle, PlayCircle, RotateCcw, X } from '@wso2/oxygen-ui-icons-react';
import { useState } from 'react';
import WorkflowFlowTab from './WorkflowFlowTab';
import {
  isPreparing,
  isRefreshing,
  type ResetPoint,
  useResetPoints,
  useResetWorkflow,
  useWorkflowExecutionGraph,
  useWorkflowHistory,
  useWorkflowInfo,
  useWorkflowInstanceGraph,
  useWorkflowLifecycle,
  valueOf,
  type ResetType,
  type WorkflowLifecycleAction,
} from '../../api/workflows';
import { splitQualifiedName } from './helpers';
import { RefreshingNote, type WorkflowScope } from './shared';
import Authorized from '../Authorized';
import { Permissions } from '../../constants/permissions';
import { useLayout } from '../../contexts/LayoutContext';
import DateTime from '../DateTime';

// The drawer fills the main content area only — right-anchored, its left edge lands at the sidebar
// width so the left navigation stays visible. `sidebarWidth` is supplied live so the panel tracks
// the sidebar's collapsed/expanded state.
// A flex column so only the body scrolls — the header and the lifecycle bar stay put.
const drawerPaperSx = (sidebarWidth: number) => ({
  '& .MuiDrawer-paper': { width: `calc(100% - ${sidebarWidth}px)`, position: 'fixed', top: 64, height: 'calc(100% - 64px)', borderLeft: '1px solid', borderColor: 'divider', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
});
const headerSx = { px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0 };
const emptySx = { py: 4, textAlign: 'center', color: 'text.secondary' };

function resetPointLabel(points: ResetPoint[], index: number): string {
  const names = (p: ResetPoint) => p.nodeNames.map((n) => splitQualifiedName(n).task ?? n);
  const own = names(points[index]);
  if (own.length) return own.join(', ');
  if (index === 0) return 'Start of the run';
  for (let i = index - 1; i >= 0; i--) {
    const prev = names(points[i]);
    if (prev.length) return `After ${prev[prev.length - 1]}`;
  }
  return `Checkpoint ${index + 1} of ${points.length}`;
}

export default function WorkflowDetailDrawer({ scope, workflowId, onClose }: { scope: WorkflowScope; workflowId: string; onClose: () => void }) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [terminateOpen, setTerminateOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetType, setResetType] = useState<ResetType>('last-workflow-task');
  const [resetEventId, setResetEventId] = useState<number | null>(null);
  const [resetReason, setResetReason] = useState('');
  const resetMutation = useResetWorkflow(scope);
  // Reset points load only while the dialog is open — the history read has a cost.
  const { data: resetPointsResult } = useResetPoints(scope, workflowId, resetOpen);
  const resetPoints = valueOf(resetPointsResult) ?? [];
  const [reason, setReason] = useState('');
  const [toast, setToast] = useState<{ severity: 'success' | 'error'; message: string } | null>(null);
  const { sidebarWidth } = useLayout();

  const { data: infoResult, isLoading: loadingInfo, error: infoError } = useWorkflowInfo(scope, workflowId);
  // History is loaded eagerly: the Timeline tab derives the start input from it, renders the timeline,
  // and the History tab renders the raw events.
  const { data: historyResult, isLoading: loadingHistory } = useWorkflowHistory(scope, workflowId);
  // Fetched for the Execution Graph tab (1) and also the Timeline tab (0), which uses the graph's
  // authoritative node types to fix categories/icons the history alone can't determine.
  const { data: graphResult, isLoading: loadingGraph } = useWorkflowExecutionGraph(scope, workflowId);
  const { data: instanceGraphResult, isLoading: loadingInstanceGraph } = useWorkflowInstanceGraph(scope, workflowId);
  const instanceGraph = valueOf(instanceGraphResult);
  // These reads are materialized through the integration, so a freshly opened drawer is still being prepared.
  const info = valueOf(infoResult);
  const history = valueOf(historyResult) ?? [];
  const graph = valueOf(graphResult);
  const preparing = isPreparing(infoResult) || isPreparing(historyResult) || isPreparing(graphResult) || isPreparing(instanceGraphResult);
  const refreshing = isRefreshing(infoResult) || isRefreshing(historyResult) || isRefreshing(graphResult) || isRefreshing(instanceGraphResult);
  const lifecycle = useWorkflowLifecycle(scope);

  const status = (info?.status as string | undefined) ?? '';

  // Lifecycle actions narrowed by status: a running instance can be suspended/cancelled/terminated,
  // a suspended one resumed/cancelled/terminated; closed instances (completed, failed, terminated,
  // canceled, timed out) get no actions. Note: the runtime currently reports suspended instances
  // as RUNNING (suspend is a signal, not a Temporal status), so SUSPENDED only takes effect once
  // the runtime exposes it.
  const normalizedStatus = status.toUpperCase();
  const isRunning = normalizedStatus === 'RUNNING';
  const isSuspended = normalizedStatus === 'SUSPENDED';
  const showActions = isRunning || isSuspended;

  const runAction = (action: WorkflowLifecycleAction, actionReason?: string) => {
    lifecycle.mutate(
      { workflowId, action, reason: actionReason },
      {
        onSuccess: () => setToast({ severity: 'success', message: `Workflow ${action} requested.` }),
        onError: (e) => setToast({ severity: 'error', message: e instanceof Error ? e.message : `Failed to ${action}.` }),
      },
    );
  };

  const historyEventKeys = history.length > 0 ? Object.keys(history[0]).slice(0, 5) : [];

  return (
    <Drawer anchor="right" open variant="persistent" sx={drawerPaperSx(sidebarWidth)} onClose={onClose}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={headerSx}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          Execution Details
        </Typography>
        <IconButton size="small" aria-label="close" onClick={onClose}>
          <X size={16} />
        </IconButton>
      </Stack>

      {/* Renders for CLOSED runs too: reset exists for runs that failed, bulk retry for the reviews they left. */}
      {info && (
        <Authorized permissions={[Permissions.WORKFLOW_MANAGE_WORKFLOWS]}>
          <Stack direction="row" gap={1} sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider', flexWrap: 'wrap', justifyContent: 'flex-end', flexShrink: 0 }}>
            <Button size="small" variant="outlined" startIcon={<RotateCcw size={14} />} disabled={resetMutation.isPending} onClick={() => setResetOpen(true)}>
              Reset…
            </Button>
            {isRunning && instanceGraph?.graphKind === 'agent' && (
              // Wake ends an in-progress sleep tool call early; harmless when the agent is not sleeping.
              <Button size="small" variant="outlined" startIcon={<BellRing size={14} />} disabled={lifecycle.isPending} onClick={() => runAction('wake')}>
                Wake
              </Button>
            )}
            {isRunning && (
              <Button size="small" variant="outlined" startIcon={<PauseCircle size={14} />} disabled={lifecycle.isPending} onClick={() => runAction('suspend')}>
                Suspend
              </Button>
            )}
            {isSuspended && (
              <Button size="small" variant="outlined" startIcon={<PlayCircle size={14} />} disabled={lifecycle.isPending} onClick={() => runAction('resume')}>
                Resume
              </Button>
            )}
            {showActions && (
              <>
                <Button size="small" variant="outlined" color="warning" startIcon={<Ban size={14} />} disabled={lifecycle.isPending} onClick={() => runAction('cancel')}>
                  Cancel
                </Button>
                <Button size="small" variant="outlined" color="error" startIcon={<OctagonX size={14} />} disabled={lifecycle.isPending} onClick={() => setTerminateOpen(true)}>
                  Terminate
                </Button>
              </>
            )}
          </Stack>
        </Authorized>
      )}

      <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', px: 2, pt: 1, pb: 2 }}>
        <RefreshingNote show={refreshing} />
        {loadingInfo || loadingHistory || loadingGraph || loadingInstanceGraph || preparing ? (
          <CircularProgress size={24} sx={{ display: 'block', mx: 'auto', py: 4 }} />
        ) : infoError ? (
          <Typography sx={emptySx}>Could not load workflow info.</Typography>
        ) : (
          <WorkflowFlowTab instanceGraph={instanceGraph} executionGraph={graph} events={history as Array<Record<string, unknown>>} info={info} onOpenHistory={() => setHistoryOpen(true)} environmentId={scope.environmentId} />
        )}
      </Box>

      <Dialog open={historyOpen} onClose={() => setHistoryOpen(false)} maxWidth="lg" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          Event History
          <IconButton size="small" aria-label="close event history" onClick={() => setHistoryOpen(false)}>
            <X size={16} />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          {history.length === 0 ? (
            <Typography sx={emptySx}>No history events.</Typography>
          ) : (
            <ListingTable>
              <ListingTable.Head>
                <ListingTable.Row>
                  {historyEventKeys.map((k) => (
                    <ListingTable.Cell key={k}>{k}</ListingTable.Cell>
                  ))}
                </ListingTable.Row>
              </ListingTable.Head>
              <ListingTable.Body>
                {history.map((ev, i) => (
                  <ListingTable.Row key={i}>
                    {historyEventKeys.map((k) => (
                      <ListingTable.Cell key={k}>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: 12 }}>
                          {typeof ev[k] === 'object' ? JSON.stringify(ev[k]) : String(ev[k] ?? '—')}
                        </Typography>
                      </ListingTable.Cell>
                    ))}
                  </ListingTable.Row>
                ))}
              </ListingTable.Body>
            </ListingTable>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={resetOpen} onClose={() => !resetMutation.isPending && setResetOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Reset Workflow</DialogTitle>
        <DialogContent>
          <Stack gap={2} sx={{ pt: 0.5 }}>
            {/* Steps before the reset point are replayed from history — their side effects are not repeated. */}
            <Alert severity="warning">
              {resetType === 'first-workflow-task'
                ? 'The whole workflow runs again as a new run of the same workflow ID, with its original input — every activity happens again, side effects included, and every human task is asked again. This cannot be undone.'
                : resetType === 'last-workflow-task'
                  ? 'The run is replayed from its own history up to its most recent workflow task — completed steps before it are not re-executed and their side effects are not repeated. Only the work after that point runs again, as a new run of the same workflow ID. This cannot be undone.'
                  : 'The run is replayed from its own history up to the chosen point — completed steps before it are not re-executed and their side effects are not repeated. Everything after the point runs again for real, side effects included, and human tasks after it may be asked again. This cannot be undone.'}
            </Alert>
            <RadioGroup value={resetType} onChange={(e) => setResetType(e.target.value as ResetType)}>
              <FormControlLabel value="last-workflow-task" control={<Radio size="small" />} label="Before the last step — redo only the most recent work" />
              <FormControlLabel value="first-workflow-task" control={<Radio size="small" />} label="From the beginning — rerun the whole workflow with its original input" />
              <FormControlLabel value="workflow-task-id" control={<Radio size="small" />} label="A specific point in this run's history" />
            </RadioGroup>
            {resetType === 'workflow-task-id' &&
              (isPreparing(resetPointsResult) ? (
                <Stack direction="row" alignItems="center" gap={1} sx={{ color: 'text.secondary' }}>
                  <CircularProgress size={14} />
                  <Typography variant="caption">Reading this run's reset points from its history…</Typography>
                </Stack>
              ) : resetPoints.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  This run has no reset points yet — no workflow task has completed.
                </Typography>
              ) : (
                <RadioGroup value={resetEventId ?? ''} onChange={(e) => setResetEventId(Number(e.target.value))}>
                  {resetPoints.map((point) => (
                    <FormControlLabel
                      key={point.eventId}
                      value={point.eventId}
                      control={<Radio size="small" />}
                      label={
                        <Stack sx={{ py: 0.25 }}>
                          <Typography variant="body2">
                            {resetPointLabel(resetPoints, resetPoints.indexOf(point))}
                            {point.isFirstFailure ? ' — just before the first failure' : ''}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            <DateTime value={point.timestamp} />
                          </Typography>
                        </Stack>
                      }
                    />
                  ))}
                </RadioGroup>
              ))}
            <TextField label="Reason" fullWidth value={resetReason} onChange={(e) => setResetReason(e.target.value)} helperText="Recorded with the reset in the run's history and audit trail." />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={resetMutation.isPending} onClick={() => setResetOpen(false)}>
            Back
          </Button>
          <Button
            variant="contained"
            color="warning"
            disabled={resetMutation.isPending || (resetType === 'workflow-task-id' && resetEventId === null)}
            onClick={() =>
              resetMutation.mutate(
                { workflowId, resetType, eventId: resetType === 'workflow-task-id' ? (resetEventId ?? undefined) : undefined, reason: resetReason.trim() || undefined },
                {
                  onSuccess: (handle) => {
                    setResetOpen(false);
                    setToast({ severity: 'success', message: `Workflow reset — new run ${handle?.runId ?? 'started'}.` });
                  },
                  onError: (e) => {
                    setResetOpen(false);
                    setToast({ severity: 'error', message: e instanceof Error ? e.message : 'Reset failed.' });
                  },
                },
              )
            }>
            {resetMutation.isPending ? 'Resetting…' : 'Reset Workflow'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={terminateOpen} onClose={() => setTerminateOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Terminate Workflow</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Terminate <strong>{workflowId}</strong> immediately? This cannot be undone.
          </DialogContentText>
          <TextField label="Reason (optional)" fullWidth size="small" value={reason} onChange={(e) => setReason(e.target.value)} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTerminateOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => {
              runAction('terminate', reason);
              setTerminateOpen(false);
              setReason('');
            }}>
            Terminate
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={toast !== null} autoHideDuration={4000} onClose={() => setToast(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        {toast ? (
          <Alert severity={toast.severity} onClose={() => setToast(null)} sx={{ width: '100%' }}>
            {toast.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Drawer>
  );
}
