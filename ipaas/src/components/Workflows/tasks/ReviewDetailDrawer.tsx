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
import type { ReviewDecision } from '../api/types';
import type { ReadyWorkflowApi } from '../api/useWorkflowApi';
import SchemaOrRawEditor from '../forms/SchemaOrRawEditor';
import { buildFormResult, diffFormValues, formIsAuthoritative, formValuesForRaw, formValuesFromObject, jsonPretty, parseFormSchema, parseRawJson, withValueShapes, type FormValues } from '../forms/schemaForm';
import { splitQualifiedName } from '../model/workflowHistory';
import { whenAutoRefresh } from '../shared/autoRefresh';
import { ActionCard, ActionCardRow, DetailHeader, DetailList, DetailRow, IdText, NotProvided, SectionCard } from '../shared/DetailSections';
import StructuredValue from '../shared/StructuredValue';
import { stepStatusChipColor, stepStatusLabel } from '../shared/workflowStepStatus';
import TaskAdministerCard, { AdministratorsRow, EligibleRolesRows } from './TaskAdministerCard';
import WorkItemDrawer, { WorkItemDetailSkeleton } from './WorkItemDrawer';
import { actionErrorText, completedAsLabel, errorText, ownedHere, refreshParentRun, reviewDecisionLabel, reviewTaskInput, reviewTriggerLabel, sameValue, taskCompleter, type TaskNotice, type WorkItem } from './workItem';
import * as styles from './WorkItemDrawer.styles';

/**
 * A review activity's detail and its three decisions (proceed as proposed, proceed with edited
 * arguments, or reject). It opens maximized over
 * the page, like the execution view. The arguments are shown as a form, read-only; the edited-rerun
 * path seeds the editor from them and states what changed before acting, since the decision reruns
 * a real activity. An administrator also gets the Administer card.
 */

interface ReviewDetailDrawerProps {
  /** The item open in the queue; the drawer opens for a review only. */
  item: WorkItem | null;
  api: ReadyWorkflowApi;
  /** Opens a workflow's execution view: the review's parent, or an id inside its arguments. */
  onOpenWorkflow?: (workflowId: string) => void;
  onNotify: (notice: TaskNotice) => void;
  onClose: () => void;
}

export default function ReviewDetailDrawer({ item, ...props }: ReviewDetailDrawerProps): JSX.Element {
  const review = item?.kind === 'review' ? item : null;
  return (
    <WorkItemDrawer openId={review?.taskId ?? null} title="Review Details" onClose={props.onClose}>
      {/* Keyed on the review: a decision staged for the previous review must not be confirmable
          against the next, since the dialogs act on the current id. */}
      {review && <ReviewDetail key={review.taskId} item={review} {...props} />}
    </WorkItemDrawer>
  );
}

/** One of the engine's three decisions, with what it carries. */
type Decision = { choice: Extract<ReviewDecision, 'proceed'> } | { choice: Extract<ReviewDecision, 'proceed-with-input'>; input: unknown } | { choice: Extract<ReviewDecision, 'reject'>; feedback?: string };

function ReviewDetail({ item, api, onOpenWorkflow, onNotify, onClose }: Omit<ReviewDetailDrawerProps, 'item'> & { item: WorkItem }): JSX.Element {
  const { client, connection } = api;
  const { scopeId } = connection;
  const { taskId } = item;
  const queryClient = useQueryClient();

  const [editing, setEditing] = useState(false);
  const [confirmProceedOpen, setConfirmProceedOpen] = useState(false);
  const [reviewChangesOpen, setReviewChangesOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [values, setValues] = useState<FormValues>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [rawMode, setRawMode] = useState(false);
  const [rawText, setRawText] = useState('{}');
  const [rawError, setRawError] = useState('');
  // The input confirmed in the second step, built once when entering it.
  const [pendingInput, setPendingInput] = useState<unknown>(null);
  const [feedback, setFeedback] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const paused = editing || confirmProceedOpen || reviewChangesOpen || rejectOpen;

  const {
    data: review,
    error: loadError,
    refetch,
  } = useQuery({
    queryKey: workflowKeys.review(scopeId, taskId),
    queryFn: () => client.reviews.get(taskId),
    refetchInterval: (query) => whenAutoRefresh(!paused && query.state.data?.status === 'PENDING' ? 5000 : false),
    retry: retryWorkflowRead,
  });

  /** The arguments as proposed: what the editor is seeded from and a diff is measured against. */
  const proposed = review ? reviewTaskInput(review) : null;

  // The schema's fields, with any argument it leaves as a bare object read off the recorded value,
  // so Proceed with Changes is a form rather than a JSON box.
  const fields = useMemo(() => withValueShapes(parseFormSchema(review?.formSchema), proposed), [review?.formSchema, proposed]);
  const seeded = useMemo(() => (fields && proposed ? formValuesFromObject(fields, proposed) : {}), [fields, proposed]);

  const refreshReview = () => {
    void queryClient.invalidateQueries({ queryKey: workflowKeys.review(scopeId, taskId) });
    void queryClient.invalidateQueries({ queryKey: [...workflowKeys.all(scopeId), 'reviews'] });
  };

  const decide = useMutation({
    mutationFn: (decision: Decision): Promise<unknown> => {
      switch (decision.choice) {
        case 'proceed':
          return client.reviews.proceed(taskId);
        case 'proceed-with-input':
          return client.reviews.proceedWithInput(taskId, decision.input);
        default:
          return client.reviews.reject(taskId, decision.feedback);
      }
    },
    onSuccess: (_answer, decision) => {
      refreshReview();
      // A decision reruns or fails the reviewed activity, so the parent run moves on.
      refreshParentRun(queryClient, scopeId, item.parentWorkflowId);
      onNotify({ message: decision.choice === 'reject' ? 'Activity rejected.' : 'Activity proceeded.', severity: 'success' });
      onClose();
    },
    onError: (error) => {
      // The error shows in the drawer; a dialog left open would hide it.
      setConfirmProceedOpen(false);
      setReviewChangesOpen(false);
      setRejectOpen(false);
      setSubmitError(actionErrorText(connection, error, 'The decision could not be submitted.'));
    },
  });
  const submitting = decide.isPending;

  if (!review) {
    if (loadError) {
      return (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => void refetch()}>
              Retry
            </Button>
          }>
          {errorText(loadError, 'Could not load the review.')}
        </Alert>
      );
    }
    return <WorkItemDetailSkeleton />;
  }

  const changes = fields ? diffFormValues(fields, seeded, values) : [];
  // Judged on what is submitted, not on the field diff: an edit can read back as the same value.
  const unchanged = sameValue(pendingInput, proposed);
  const formShown = formIsAuthoritative(fields, rawMode);
  const servedHere = ownedHere(item.taskQueue, connection.runtime.taskQueue);
  const canDecide = review.status === 'PENDING' && servedHere;
  const isCompleted = review.status === 'COMPLETED';
  const decision = review.decision ?? null;
  const completer = taskCompleter(review);
  const completedAs = completedAsLabel(review.completedAs);
  const qualified = splitQualifiedName(review.taskName ?? review.activityName);
  const activityName = qualified.task ?? review.activityName;
  const workflowName = review.parentWorkflowType || qualified.workflow;
  // Messages read differently for a failed activity and for an approval gate.
  const retries = review.trigger === 'ON_FAILURE';
  const created = formatDateTime(review.createdAt ?? review.startTime);

  const openWorkflow = onOpenWorkflow
    ? (workflowId: string) => {
        onClose();
        onOpenWorkflow(workflowId);
      }
    : undefined;

  const run = (next: Decision) => {
    setSubmitError(null);
    decide.mutate(next);
  };

  const startEdit = () => {
    setValues(seeded);
    setErrors({});
    setRawMode(false);
    setRawText(jsonPretty(proposed ?? {}) || '{}');
    setRawError('');
    setEditing(true);
  };

  const closeEdit = () => {
    setEditing(false);
    setErrors({});
    setRawError('');
    setRawMode(false);
    setSubmitError(null);
  };

  // Step one of the edited path: validate and stage; the review-changes step submits.
  const stageEdited = () => {
    if (formIsAuthoritative(fields, rawMode)) {
      const { errors: found } = buildFormResult(fields, values);
      setErrors(found);
      if (Object.keys(found).length > 0) {
        return;
      }
      // The edits laid over the recorded arguments, not the form's projection of them, which would
      // drop a recorded null, an open record's rest fields and any key the schema does not describe.
      setPendingInput(formValuesForRaw(fields, values, proposed));
      setReviewChangesOpen(true);
      return;
    }
    const parsed = parseRawJson(rawText);
    if (!parsed) {
      setRawError('Arguments must be valid JSON.');
      return;
    }
    setPendingInput(parsed.value);
    setReviewChangesOpen(true);
  };

  let editHint: string;
  if (rawMode) {
    editHint = 'Submitted as typed; the form is bypassed.';
  } else if (!fields) {
    editHint = 'This activity declares no schema; edit the raw JSON to use.';
  } else if (changes.length === 0) {
    editHint = 'No changes yet; edit the values to use.';
  } else {
    editHint = `Changed: ${changes.map((c) => c.label).join(', ')}`;
  }

  const spinner = submitting ? <CircularProgress size={16} color="inherit" /> : undefined;

  return (
    <>
      <DetailHeader
        title={review.title || activityName || review.taskId}
        status={<Chip label={stepStatusLabel(review.status)} color={stepStatusChipColor(review.status)} variant="outlined" size="small" />}
        meta={[workflowName && `${workflowName} workflow`, retries ? 'Failed activity review' : 'Approval before the activity runs', `Created ${created}`].filter(Boolean).join(' · ')}
      />

      {submitError && <Alert severity="error">{submitError}</Alert>}

      {review.description && (
        <SectionCard title="Description">
          <Typography variant="body2" color="text.secondary">
            {review.description}
          </Typography>
        </SectionCard>
      )}

      <SectionCard title="Activity" collapsible>
        <DetailList>
          <DetailRow label="Activity Name">{activityName || <NotProvided />}</DetailRow>
          <DetailRow label="Workflow Name">{workflowName || <NotProvided />}</DetailRow>
          <DetailRow label="Parent Workflow">
            <IdText id={review.parentWorkflowId} onOpen={openWorkflow ? () => openWorkflow(review.parentWorkflowId) : undefined} />
          </DetailRow>
          <DetailRow label="Trigger">{reviewTriggerLabel(review.trigger)}</DetailRow>
          <DetailRow label="Created">{created}</DetailRow>
          {review.errorMessage && <DetailRow label="Error">{review.errorMessage}</DetailRow>}
          <EligibleRolesRows task={review} emptyLabel="Not restricted" />
          <AdministratorsRow task={review} />
        </DetailList>
      </SectionCard>

      {!editing && proposed && <StructuredValue title="Activity Arguments" value={proposed} readOnly collapsible onOpenWorkflow={openWorkflow} />}

      {isCompleted && (completer.by || completer.at || decision) && (
        <SectionCard title="Decision">
          <DetailList>
            <DetailRow label="Decision">{reviewDecisionLabel(decision?.action) ?? <NotProvided />}</DetailRow>
            <DetailRow label="Decided By">{completer.by || <NotProvided />}</DetailRow>
            {completedAs && <DetailRow label="Decided As">{completedAs}</DetailRow>}
            <DetailRow label="Decided At">{completer.at ? formatDateTime(completer.at) : <NotProvided />}</DetailRow>
            {decision?.feedback && <DetailRow label="Feedback">{decision.feedback}</DetailRow>}
          </DetailList>
        </SectionCard>
      )}
      {isCompleted && decision?.input != null && <StructuredValue title="Submitted Input" value={decision.input} collapsible onOpenWorkflow={openWorkflow} />}

      {review.status === 'PENDING' && !servedHere && (
        <Typography variant="caption" sx={styles.notOwnedHere}>
          {`This review is served by a different integration (${item.taskQueue}), so it cannot be decided from here.`}
        </Typography>
      )}

      {canDecide && (
        <SectionCard title="Decisions">
          <Stack gap={2}>
            <ActionCardRow>
              <ActionCard
                title="Proceed"
                subtitle={retries ? 'Retry with the original arguments.' : 'Run with the original arguments.'}
                info={`${retries ? 'Retries the failed activity' : 'Runs the activity'} with the arguments exactly as recorded above. Confirmed before anything runs.`}
                disabled={submitting}
                onClick={() => {
                  // Only one decision open at a time: close any open editor first.
                  closeEdit();
                  setConfirmProceedOpen(true);
                }}
              />
              <ActionCard
                title="Proceed with Changes"
                subtitle="Edit the arguments first."
                info="Opens the arguments for editing; what changed is shown before the retry is confirmed."
                selected={editing}
                disabled={submitting}
                onClick={() => (editing ? closeEdit() : startEdit())}
              />
              <ActionCard
                title="Reject"
                subtitle="Fail the activity instead."
                info="Completes the review as a failure and propagates it to the workflow, which decides what happens next. This cannot be undone."
                selected={rejectOpen}
                disabled={submitting}
                onClick={() => {
                  closeEdit();
                  setRejectOpen(true);
                }}
              />
            </ActionCardRow>

            {editing && (
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
                  rawLabel="Arguments (JSON)"
                  rawError={rawError}
                  rawBase={proposed}
                  hint={editHint}
                  noSchemaHelper="The arguments the activity is retried with."
                  disabled={submitting}
                />
                <Box sx={styles.formActions}>
                  <Button variant="text" color="inherit" size="small" disabled={submitting} onClick={closeEdit}>
                    Cancel
                  </Button>
                  <Button variant="contained" size="small" disabled={submitting} onClick={stageEdited}>
                    Review Changes
                  </Button>
                </Box>
              </Box>
            )}
          </Stack>
        </SectionCard>
      )}

      {canDecide && <TaskAdministerCard api={api} task={review} disabled={submitting} onDone={refreshReview} onNotify={onNotify} />}

      <Dialog open={confirmProceedOpen} onClose={() => !submitting && setConfirmProceedOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Confirm Proceed</DialogTitle>
        <DialogContent>
          <Stack gap={2}>
            <Alert severity="info">{`The activity ${retries ? 'retries' : 'runs'} with the original arguments below. This cannot be undone.`}</Alert>
            <StructuredValue title="Arguments" value={proposed ?? {}} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" color="inherit" disabled={submitting} onClick={() => setConfirmProceedOpen(false)}>
            Back
          </Button>
          <Button variant="contained" disabled={submitting} onClick={() => run({ choice: 'proceed' })} startIcon={spinner}>
            Proceed
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={reviewChangesOpen} onClose={() => !submitting && setReviewChangesOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Review Changes</DialogTitle>
        <DialogContent>
          <Stack gap={2}>
            <Alert severity="info">{`The activity ${retries ? 'retries' : 'runs'} with the edited arguments below. This cannot be undone.`}</Alert>
            {/* Raw mode bypassed the form, so the field diff would not describe what is about to be
                submitted. */}
            {formShown && unchanged && (
              <Typography variant="body2" color="text.secondary">
                Nothing was changed: this is the same as Proceed with the original arguments.
              </Typography>
            )}
            {formShown && !unchanged && (
              <Stack gap={1}>
                {changes.map((change) => (
                  <Box key={change.path} sx={styles.changeRow}>
                    <Typography variant="body2" sx={styles.changeLabel}>
                      {change.label}
                    </Typography>
                    <Typography variant="body2" sx={styles.changeFrom}>
                      {change.from}
                    </Typography>
                    <Typography variant="body2" sx={styles.changeTo}>
                      {change.to}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            )}
            {!formShown && <StructuredValue title="Arguments to Submit" value={pendingInput ?? {}} />}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" color="inherit" disabled={submitting} onClick={() => setReviewChangesOpen(false)}>
            Back
          </Button>
          <Button variant="contained" disabled={submitting} onClick={() => run({ choice: 'proceed-with-input', input: pendingInput })} startIcon={spinner}>
            Proceed with Changes
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={rejectOpen} onClose={() => !submitting && setRejectOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Reject Activity</DialogTitle>
        <DialogContent>
          <Stack gap={2}>
            <Alert severity="warning">Rejecting is a fail operation: the review completes, and the failure is propagated to the workflow; the workflow decides what happens next. This cannot be undone.</Alert>
            <TextField labelPlacement="top" label="Feedback" optional value={feedback} onChange={(event) => setFeedback(event.target.value)} helperText="Relayed to the workflow as the rejection reason." size="small" fullWidth multiline minRows={2} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" color="inherit" disabled={submitting} onClick={() => setRejectOpen(false)}>
            Back
          </Button>
          <Button variant="contained" color="error" disabled={submitting} onClick={() => run({ choice: 'reject', feedback: feedback.trim() || undefined })} startIcon={spinner}>
            Reject Activity
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
