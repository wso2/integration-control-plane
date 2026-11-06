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

import { Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Skeleton, Stack, TextField, Typography } from '@wso2/oxygen-ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type JSX } from 'react';
import { formatDateTime } from '../../../utils/time';
import type { WorkflowClient } from '../api/client';
import { retryWorkflowRead } from '../api/http';
import { workflowKeys } from '../api/queryKeys';
import { markSettling } from '../api/settleRegistry';
import type { ResetPoint, ResetType, WorkflowInstanceSummary } from '../api/types';
import { splitQualifiedName } from '../model/workflowHistory';
import { invalidateRun } from './runQueries';

/**
 * Replays a run from an earlier point.
 *
 * Reset keeps the workflow id and produces a **new run id**, so every run-scoped read for the old
 * run is stale afterwards, which is why the whole run-scoped key set is invalidated rather than
 * just the instance.
 *
 * The three modes carry genuinely different consequences, so each states its own rather than
 * sharing one generic warning.
 */

interface ResetWorkflowDialogProps {
  open: boolean;
  run: WorkflowInstanceSummary | null;
  api: WorkflowClient | null;
  scopeId: string;
  onClose: () => void;
  onReset: (newRunId: string) => void;
}

const listFormat = new Intl.ListFormat('en', { type: 'unit', style: 'short' });

/**
 * A checkpoint named by the steps it follows, never by its Temporal event. A point with no step of its own is placed by the nearest named one before it.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function resetPointLabel(points: ResetPoint[], index: number): string {
  const names = (point: ResetPoint) => point.nodeNames.map((name) => splitQualifiedName(name).task ?? name);
  const own = names(points[index]);
  if (own.length > 0) {
    return listFormat.format(own);
  }
  if (index === 0) {
    return 'Start of the run';
  }
  for (let i = index - 1; i >= 0; i -= 1) {
    const previous = names(points[i]);
    if (previous.length > 0) {
      return `After ${previous[previous.length - 1]}`;
    }
  }
  return `Checkpoint ${index + 1} of ${points.length}`;
}

const MODE_NOTES: Record<ResetType, string> = {
  'last-workflow-task': 'Replays from the most recent completed workflow task. Activities after that point run again.',
  'first-workflow-task': 'Replays the run from its very beginning. Every activity runs again, including ones that succeeded.',
  'workflow-task-id': 'Replays from the checkpoint you choose. Everything after it runs again.',
};

const MODE_LABELS: Record<ResetType, string> = {
  'last-workflow-task': 'Last workflow task',
  'first-workflow-task': 'Beginning of the run',
  'workflow-task-id': 'A specific checkpoint',
};

const MODES = Object.keys(MODE_LABELS) as ResetType[];

export default function ResetWorkflowDialog({ open, run, api, scopeId, onClose, onReset }: ResetWorkflowDialogProps): JSX.Element {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<ResetType>('last-workflow-task');
  const [eventId, setEventId] = useState<number | ''>('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The dialog stays mounted between opens, so each opening starts clean rather than with what was
  // chosen for the last run: a checkpoint id from one run can be a valid one of another.
  const openedFor = open ? (run?.runId ?? '') : null;
  const [preparedFor, setPreparedFor] = useState<string | null>(null);
  if (preparedFor !== openedFor) {
    setPreparedFor(openedFor);
    if (openedFor !== null) {
      setMode('last-workflow-task');
      setEventId('');
      setReason('');
      setError(null);
    }
  }

  // Only fetched while the dialog is open: this is not cheap and nothing else needs it.
  const {
    data: resetPoints = [],
    isFetching,
    isError: pointsFailed,
    refetch: refetchPoints,
  } = useQuery({
    queryKey: workflowKeys.resetPoints(scopeId, run?.workflowId ?? '', run?.runId),
    queryFn: () => api!.instances.resetPoints(run!.workflowId, run!.runId),
    enabled: open && !!api && !!run,
    staleTime: 30_000,
    retry: retryWorkflowRead,
  });

  const submit = () => {
    if (!api || !run) {
      return;
    }
    if (mode === 'workflow-task-id' && eventId === '') {
      setError('Choose a checkpoint to replay from.');
      return;
    }
    setSubmitting(true);
    setError(null);
    api.instances
      .reset(
        run.workflowId,
        {
          resetType: mode,
          ...(mode === 'workflow-task-id' ? { eventId: Number(eventId) } : {}),
          ...(reason.trim() ? { reason: reason.trim() } : {}),
        },
        run.runId,
      )
      .then((handle) => {
        markSettling(handle.workflowId);
        invalidateRun(queryClient, scopeId, run.workflowId, run.runId);
        onReset(handle.runId);
        onClose();
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not reset the workflow.'))
      .finally(() => setSubmitting(false));
  };

  let checkpoints: JSX.Element;
  if (isFetching && resetPoints.length === 0) {
    checkpoints = <Skeleton variant="rounded" height={40} />;
  } else if (pointsFailed && resetPoints.length === 0) {
    checkpoints = (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={() => void refetchPoints()}>
            Retry
          </Button>
        }>
        Could not load this run’s checkpoints.
      </Alert>
    );
  } else if (resetPoints.length === 0) {
    checkpoints = (
      <Typography variant="body2" color="text.secondary">
        This run has no checkpoints yet: no workflow task has completed.
      </Typography>
    );
  } else {
    checkpoints = (
      <TextField
        select
        labelPlacement="top"
        label="Checkpoint"
        size="small"
        fullWidth
        value={eventId === '' ? '' : String(eventId)}
        // The placeholder's value is '', which Number() would turn into event 0.
        onChange={(event) => setEventId(event.target.value === '' ? '' : Number(event.target.value))}
        slotProps={{ select: { displayEmpty: true } }}>
        <MenuItem value="">
          <Typography component="span" variant="body2" color="text.secondary">
            Select a checkpoint…
          </Typography>
        </MenuItem>
        {resetPoints.map((point, index) => (
          <MenuItem key={point.eventId} value={String(point.eventId)}>
            {`${resetPointLabel(resetPoints, index)}${point.isFirstFailure ? ' (just before the first failure)' : ''} · ${formatDateTime(point.timestamp)}`}
          </MenuItem>
        ))}
      </TextField>
    );
  }

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Reset workflow</DialogTitle>
      <DialogContent>
        <Stack gap={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}

          <TextField select labelPlacement="top" label="Replay from" size="small" fullWidth value={mode} onChange={(event) => setMode(event.target.value as ResetType)} helperText={MODE_NOTES[mode]}>
            {MODES.map((value) => (
              <MenuItem key={value} value={value}>
                {MODE_LABELS[value]}
              </MenuItem>
            ))}
          </TextField>

          {mode === 'workflow-task-id' && checkpoints}

          <TextField labelPlacement="top" label="Reason" size="small" fullWidth value={reason} onChange={(event) => setReason(event.target.value)} />

          <Typography variant="caption" color="text.secondary">
            Reset keeps the workflow ID and starts a new run.
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" color="inherit" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button variant="contained" color="warning" disabled={submitting || !api} onClick={submit} startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : undefined}>
          Reset
        </Button>
      </DialogActions>
    </Dialog>
  );
}
