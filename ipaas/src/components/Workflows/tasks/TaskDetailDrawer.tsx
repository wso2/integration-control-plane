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

import { Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from '@wso2/oxygen-ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type JSX } from 'react';
import { formatDateTime } from '../../../utils/time';
import { retryWorkflowRead } from '../api/http';
import { workflowKeys } from '../api/queryKeys';
import type { ReadyWorkflowApi } from '../api/useWorkflowApi';
import SchemaOrRawEditor from '../forms/SchemaOrRawEditor';
import { BARE_VALUE_FIELD, buildFormResult, formIsAuthoritative, parseRawJson, parseSchemaForm, type FormValues } from '../forms/schemaForm';
import { whenAutoRefresh } from '../shared/autoRefresh';
import { ActionCard, ActionCardRow, DetailHeader, DetailList, DetailRow, IdText, NotProvided, SectionCard } from '../shared/DetailSections';
import StructuredValue from '../shared/StructuredValue';
import { stepStatusChipColor, stepStatusLabel } from '../shared/workflowStepStatus';
import TaskAdministerCard, { AdministratorsRow, EligibleRolesRows } from './TaskAdministerCard';
import WorkItemDrawer, { WorkItemDetailSkeleton } from './WorkItemDrawer';
import { actionErrorText, audienceSummary, completedAsLabel, errorText, ownedHere, refreshParentRun, taskDisplayName, type TaskNotice, type WorkItem } from './workItem';
import * as styles from './WorkItemDrawer.styles';

/**
 * A human task's detail, and what a person can do with it.
 * It opens maximized over the page, like the execution view. The task's input is shown as a form,
 * read-only; completing it submits a result through the task's own form, or as JSON; failing it
 * takes a reason; an administrator also gets the Administer card.
 *
 * Two behaviours are kept deliberately:
 *
 *  - **Polling pauses while a decision is open.** A background refetch that swapped the task
 *    object under someone mid-edit would discard their typing.
 *  - **Completion is two-step.** The exact result is shown for confirmation before it is sent,
 *    because completing a task advances a real workflow and cannot be undone.
 */

interface TaskDetailDrawerProps {
  /** The item open in the queue; the drawer opens for a human task only. */
  item: WorkItem | null;
  api: ReadyWorkflowApi;
  /** Opens a workflow's execution view: the task's parent, or an id inside its input. */
  onOpenWorkflow?: (workflowId: string) => void;
  onNotify: (notice: TaskNotice) => void;
  onClose: () => void;
}

export default function TaskDetailDrawer({ item, ...props }: TaskDetailDrawerProps): JSX.Element {
  const task = item?.kind === 'task' ? item : null;
  return (
    <WorkItemDrawer openId={task?.taskId ?? null} title="Task Details" onClose={props.onClose}>
      {/* Keyed on the task: whatever was written for one task goes with it, so a result staged for
          the previous task can never be submitted against the next. */}
      {task && <TaskDetail key={task.taskId} item={task} {...props} />}
    </WorkItemDrawer>
  );
}

function TaskDetail({ item, api, onOpenWorkflow, onNotify, onClose }: Omit<TaskDetailDrawerProps, 'item'> & { item: WorkItem }): JSX.Element {
  const { client, connection } = api;
  const { scopeId } = connection;
  const { taskId } = item;
  const queryClient = useQueryClient();

  const [completeOpen, setCompleteOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [failOpen, setFailOpen] = useState(false);
  const [values, setValues] = useState<FormValues>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [rawMode, setRawMode] = useState(false);
  const [rawText, setRawText] = useState('{}');
  const [rawError, setRawError] = useState('');
  // The result confirmed in step two, built once when entering the confirmation.
  const [pendingResult, setPendingResult] = useState<unknown>(null);
  const [failReason, setFailReason] = useState('');
  const [failError, setFailError] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Any decision that holds input pauses the poll, so a refetch cannot discard typing.
  const paused = completeOpen || confirmOpen || failOpen;

  const {
    data: task,
    error: loadError,
    refetch,
  } = useQuery({
    queryKey: workflowKeys.humanTask(scopeId, taskId),
    queryFn: () => client.humanTasks.get(taskId),
    refetchInterval: (query) => whenAutoRefresh(!paused && query.state.data?.status === 'PENDING' ? 5000 : false),
    retry: retryWorkflowRead,
  });

  // Keyed on the schema text, never on the fetched object: an unpaused refetch must not be able to
  // rebuild the field list under someone mid-edit. A task typed `string`, `boolean` or an enum gets
  // one field, its result submitted bare.
  const { fields, bare } = useMemo(() => parseSchemaForm(task?.formSchema, 'Result'), [task?.formSchema]);

  // The task, the queue and its pending count all changed.
  const refreshTask = () => {
    void queryClient.invalidateQueries({ queryKey: workflowKeys.humanTask(scopeId, taskId) });
    void queryClient.invalidateQueries({ queryKey: [...workflowKeys.all(scopeId), 'human-tasks'] });
    void queryClient.invalidateQueries({ queryKey: [...workflowKeys.all(scopeId), 'pending-count'] });
  };

  // A decision also advances the parent run, so that run's reads are stale too.
  const decided = (message: string) => {
    refreshTask();
    refreshParentRun(queryClient, scopeId, item.parentWorkflowId);
    onNotify({ message, severity: 'success' });
    onClose();
  };

  const complete = useMutation({
    mutationFn: (result: unknown) => client.humanTasks.complete(taskId, result),
    onSuccess: () => decided('Task completed.'),
    onError: (error) => {
      // The error shows in the drawer; a dialog left open would hide it.
      setConfirmOpen(false);
      setSubmitError(actionErrorText(connection, error, 'Could not complete the task.'));
    },
  });

  const fail = useMutation({
    mutationFn: (reason: string) => client.humanTasks.fail(taskId, reason),
    onSuccess: () => decided('Task marked as failed.'),
    onError: (error) => {
      setFailOpen(false);
      setSubmitError(actionErrorText(connection, error, 'Could not fail the task.'));
    },
  });

  const submitting = complete.isPending || fail.isPending;

  if (!task) {
    if (loadError) {
      return (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => void refetch()}>
              Retry
            </Button>
          }>
          {errorText(loadError, 'Could not load the task.')}
        </Alert>
      );
    }
    return <WorkItemDetailSkeleton />;
  }

  const servedHere = ownedHere(item.taskQueue, connection.runtime.taskQueue);
  const actionable = task.status === 'PENDING' && servedHere;
  const canComplete = task.canComplete !== false;
  // Failing is a decision too: the audience or an administrator may take it.
  const canFail = canComplete || task.canAdminister === true;
  const audience = audienceSummary(task);
  const taskInput = task.taskInput ?? task.payload ?? null;
  const hasResult = task.result !== undefined && task.result !== null;
  const hasDecision = !!task.completedBy || !!task.completedAt || hasResult;
  const completedAs = completedAsLabel(task.completedAs);
  const created = formatDateTime(task.createdAt ?? task.startTime);

  const openWorkflow = onOpenWorkflow
    ? (workflowId: string) => {
        onClose();
        onOpenWorkflow(workflowId);
      }
    : undefined;

  const closeComplete = () => {
    setCompleteOpen(false);
    setErrors({});
    setRawError('');
    setSubmitError(null);
  };

  // Step one: validate and stage the result; step two submits it.
  const stageComplete = () => {
    if (formIsAuthoritative(fields, rawMode)) {
      const { result, errors: found } = buildFormResult(fields, values);
      setErrors(found);
      if (Object.keys(found).length > 0) {
        return;
      }
      setPendingResult(bare ? result[BARE_VALUE_FIELD] : result);
      setConfirmOpen(true);
      return;
    }
    const parsed = parseRawJson(rawText);
    if (!parsed) {
      setRawError('Result must be valid JSON.');
      return;
    }
    setPendingResult(parsed.value);
    setConfirmOpen(true);
  };

  const submitFail = () => {
    if (!failReason.trim()) {
      setFailError('Reason is required.');
      return;
    }
    setSubmitError(null);
    fail.mutate(failReason.trim());
  };

  // Why the caller cannot complete the task, naming who can when the task says.
  const notEligibleReason = audience ? `You are not eligible to complete this task; it is open to ${audience}` : 'You are not eligible to complete this task';

  const spinner = submitting ? <CircularProgress size={16} color="inherit" /> : undefined;

  return (
    <>
      <DetailHeader
        title={taskDisplayName(task)}
        status={<Chip label={stepStatusLabel(task.status)} color={stepStatusChipColor(task.status)} variant="outlined" size="small" />}
        meta={[task.parentWorkflowType && `${task.parentWorkflowType} workflow`, `Created ${created}`].filter(Boolean).join(' · ')}
      />

      {submitError && <Alert severity="error">{submitError}</Alert>}

      {task.description && (
        <SectionCard title="Description">
          <Typography variant="body2" color="text.secondary">
            {task.description}
          </Typography>
        </SectionCard>
      )}

      <SectionCard title="Task" collapsible>
        <DetailList>
          <DetailRow label="Task Name">{taskDisplayName(task)}</DetailRow>
          <DetailRow label="Workflow Name">{task.parentWorkflowType || <NotProvided />}</DetailRow>
          <DetailRow label="Parent Workflow">
            <IdText id={task.parentWorkflowId} onOpen={openWorkflow ? () => openWorkflow(task.parentWorkflowId) : undefined} />
          </DetailRow>
          <DetailRow label="Task ID">
            <IdText id={task.taskId} />
          </DetailRow>
          <DetailRow label="Created">{created}</DetailRow>
          <EligibleRolesRows task={task} />
          <AdministratorsRow task={task} />
        </DetailList>
      </SectionCard>

      {taskInput && <StructuredValue title="Task Input" value={taskInput} readOnly collapsible onOpenWorkflow={openWorkflow} />}

      {/* Blank for tasks decided before the runtime recorded the completer. */}
      {hasDecision && (
        <SectionCard title="Decision">
          <DetailList>
            <DetailRow label="Completed By">{task.completedBy || <NotProvided />}</DetailRow>
            {completedAs && <DetailRow label="Completed As">{completedAs}</DetailRow>}
            <DetailRow label="Completed At">{task.completedAt ? formatDateTime(task.completedAt) : <NotProvided />}</DetailRow>
          </DetailList>
        </SectionCard>
      )}
      {hasResult && <StructuredValue title="Result Submitted" value={task.result} collapsible onOpenWorkflow={openWorkflow} />}

      {task.status === 'PENDING' && !servedHere && (
        <Typography variant="caption" sx={styles.notOwnedHere}>
          {`This task is served by a different integration (${item.taskQueue}), so it cannot be actioned from here.`}
        </Typography>
      )}

      {actionable && (
        <SectionCard title="Actions">
          <Stack gap={2}>
            <ActionCardRow>
              <ActionCard
                title="Complete Task"
                subtitle="Submit a result; the waiting workflow resumes with it."
                selected={completeOpen}
                disabled={submitting || !canComplete}
                disabledReason={canComplete ? undefined : notEligibleReason}
                onClick={() => (completeOpen ? closeComplete() : setCompleteOpen(true))}
              />
              <ActionCard
                title="Mark as Failed"
                subtitle="Fail the task instead."
                info="Records the task as FAILED and propagates the failure to the workflow, which decides what happens next. This cannot be undone."
                selected={failOpen}
                disabled={submitting || !canFail}
                disabledReason={canFail ? undefined : 'You are neither in this task’s audience nor one of its administrators'}
                onClick={() => {
                  // Only one decision open at a time: close the completion editor first.
                  closeComplete();
                  setFailOpen(true);
                }}
              />
            </ActionCardRow>

            {completeOpen && (
              <Box sx={styles.editorPanel}>
                <SchemaOrRawEditor
                  fields={fields}
                  values={values}
                  errors={errors}
                  onChange={(path, value) => {
                    setValues((current) => ({ ...current, [path]: value }));
                    setErrors((current) => {
                      if (!(path in current)) {
                        return current;
                      }
                      const next = { ...current };
                      delete next[path];
                      return next;
                    });
                  }}
                  rawMode={rawMode}
                  onRawModeChange={(raw) => {
                    setRawMode(raw);
                    setRawError('');
                  }}
                  rawText={rawText}
                  onRawTextChange={(text) => {
                    setRawText(text);
                    setRawError('');
                  }}
                  rawLabel="Result (JSON)"
                  rawError={rawError}
                  bare={bare}
                  hint="The result the workflow resumes with."
                  noSchemaHelper="This task's result has no generated form; the JSON is submitted as the result."
                  disabled={submitting}
                />
                <Box sx={styles.formActions}>
                  <Button variant="text" color="inherit" size="small" disabled={submitting} onClick={closeComplete}>
                    Cancel
                  </Button>
                  <Button variant="contained" size="small" disabled={submitting} onClick={stageComplete}>
                    Review before completion
                  </Button>
                </Box>
              </Box>
            )}
          </Stack>
        </SectionCard>
      )}

      {actionable && <TaskAdministerCard api={api} task={task} disabled={submitting} onDone={refreshTask} onNotify={onNotify} />}

      <Dialog open={confirmOpen} onClose={() => !submitting && setConfirmOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Confirm Completion</DialogTitle>
        <DialogContent>
          <Stack gap={2}>
            <Alert severity="info">The task completes with the result below, and the waiting workflow resumes with it. This cannot be undone.</Alert>
            <StructuredValue title="Result to Submit" value={pendingResult} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" color="inherit" disabled={submitting} onClick={() => setConfirmOpen(false)}>
            Back
          </Button>
          <Button variant="contained" disabled={submitting} onClick={() => complete.mutate(pendingResult)} startIcon={spinner}>
            Complete Task
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={failOpen} onClose={() => !submitting && setFailOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Mark Task as Failed</DialogTitle>
        <DialogContent>
          <Stack gap={2}>
            <Alert severity="warning">Failing is a fail operation: the task is recorded as FAILED and the failure is propagated to the workflow; the workflow decides what happens next. This cannot be undone.</Alert>
            <TextField
              labelPlacement="top"
              label="Reason"
              required
              value={failReason}
              onChange={(event) => {
                setFailReason(event.target.value);
                setFailError('');
              }}
              error={!!failError}
              helperText={failError || 'Relayed to the workflow as the failure reason.'}
              size="small"
              fullWidth
              multiline
              minRows={3}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" color="inherit" disabled={submitting} onClick={() => setFailOpen(false)}>
            Back
          </Button>
          <Button variant="contained" color="warning" disabled={submitting} onClick={submitFail} startIcon={spinner}>
            Mark as Failed
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
