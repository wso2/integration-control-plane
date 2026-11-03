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

import { Alert, Button, CircularProgress, Skeleton, Stack, Typography } from '@wso2/oxygen-ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useActOnWorkItem, useWorkItemDetail, type WorkItem, type WorkItemAction } from '../../hooks/useTasks';
import type { HumanTask, Review } from '../../types/workflow';
import { formatDateTime, humanize, plainName } from '../../utils/time';
import TextField from '../common/TextField';
import { ActionCard, DetailDrawer, DetailRow, SectionCard, StatusChip, SubmitError } from '../detail';
import SchemaEditor, { useSchemaEditor } from '../SchemaEditor';
import StructuredValue from '../StructuredValue';
import { OutcomeChip, useCompleterName, workItemType } from './WorkItemsTable';

type Decision = 'proceed' | 'proceed-with-input' | 'reject';

/** The arguments a step will run with, in the form its schema describes, or as read when it has none. */
function ProposedInput({ review }: { review: Review }) {
  const editor = useSchemaEditor(review.formSchema, review.taskInput ?? {});
  return editor.fields ? <SchemaEditor editor={editor} readOnly /> : <StructuredValue value={review.taskInput ?? {}} />;
}

function TaskForm({ task, busy, onSubmit }: { task: HumanTask; busy: boolean; onSubmit: (action: WorkItemAction) => void }) {
  const { t } = useTranslation();
  const editor = useSchemaEditor(task.formSchema);
  return (
    <SectionCard title={t('workflow.taskDrawer.yourResponse')}>
      <Stack gap={2}>
        <SchemaEditor editor={editor} disabled={busy} />
        <Stack direction="row" justifyContent="flex-end">
          <Button
            variant="contained"
            disabled={busy}
            startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined}
            onClick={() => {
              const read = editor.read();
              if (read.ok) onSubmit({ kind: 'complete', result: read.value });
            }}>
            {t('workflow.taskDrawer.completeTask')}
          </Button>
        </Stack>
      </Stack>
    </SectionCard>
  );
}

function ReviewForm({ review, busy, onSubmit }: { review: Review; busy: boolean; onSubmit: (action: WorkItemAction) => void }) {
  const { t } = useTranslation();
  const [decision, setDecision] = useState<Decision>('proceed');
  const [feedback, setFeedback] = useState('');
  const editor = useSchemaEditor(review.formSchema, review.taskInput ?? {});
  const afterFailure = review.trigger === 'ON_FAILURE';

  const submit = () => {
    if (decision === 'reject') return onSubmit({ kind: 'reject', feedback: feedback.trim() || undefined });
    if (decision === 'proceed') return onSubmit({ kind: 'proceed' });
    const read = editor.read();
    if (read.ok && read.value && typeof read.value === 'object') onSubmit({ kind: 'proceed-with-input', input: read.value as Record<string, unknown> });
  };

  return (
    <SectionCard title={t('workflow.taskDrawer.yourDecision')}>
      <Stack gap={2}>
        <Stack direction="row" gap={1.5} flexWrap="wrap">
          <ActionCard title={afterFailure ? t('workflow.taskDrawer.retry') : t('workflow.taskDrawer.approve')} subtitle={afterFailure ? t('workflow.taskDrawer.retrySubtitle') : t('workflow.taskDrawer.approveSubtitle', { step: humanize(plainName(review.activityName)) })} selected={decision === 'proceed'} onClick={() => setDecision('proceed')} />
          <ActionCard title={afterFailure ? t('workflow.taskDrawer.retryWithChanges') : t('workflow.taskDrawer.approveWithChanges')} subtitle={t('workflow.taskDrawer.withChangesSubtitle')} selected={decision === 'proceed-with-input'} onClick={() => setDecision('proceed-with-input')} />
          <ActionCard title={t('workflow.taskDrawer.reject')} subtitle={t('workflow.taskDrawer.rejectSubtitle')} selected={decision === 'reject'} onClick={() => setDecision('reject')} />
        </Stack>
        {decision === 'proceed-with-input' && <SchemaEditor editor={editor} disabled={busy} />}
        {decision === 'reject' && <TextField label={t('workflow.taskDrawer.reason')} placeholder={t('workflow.taskDrawer.reasonPlaceholder')} multiline minRows={3} fullWidth value={feedback} onChange={(e) => setFeedback(e.target.value)} disabled={busy} />}
        <Stack direction="row" justifyContent="flex-end">
          <Button variant="contained" color={decision === 'reject' ? 'error' : 'primary'} disabled={busy} startIcon={busy ? <CircularProgress size={16} color="inherit" /> : undefined} onClick={submit}>
            {decision === 'reject' ? t('workflow.taskDrawer.reject') : decision === 'proceed' ? (afterFailure ? t('workflow.taskDrawer.retry') : t('workflow.taskDrawer.approve')) : afterFailure ? t('workflow.taskDrawer.retryWithChangesButton') : t('workflow.taskDrawer.approveWithChangesButton')}
          </Button>
        </Stack>
      </Stack>
    </SectionCard>
  );
}

/** A task or approval: what it is about, and what the user can do with it. */
export default function TaskDrawer({ item, onClose, onDone, onOpenRun }: { item: WorkItem; onClose: () => void; onDone: (message: string) => void; onOpenRun?: (workflowId: string) => void }) {
  const { t } = useTranslation();
  const completerName = useCompleterName();
  const { data, isLoading, isError, refetch } = useWorkItemDetail(item);
  const act = useActOnWorkItem(item);
  const [error, setError] = useState<string | null>(null);
  const detail = data?.task ?? data?.review;
  const pending = (detail?.status ?? item.status) === 'PENDING';
  const canAct = pending && (detail?.canComplete ?? item.canComplete);

  const submit = (action: WorkItemAction) => {
    setError(null);
    act.mutate(action, {
      onSuccess: () => {
        onDone(t(action.kind === 'reject' ? 'workflow.taskDrawer.rejected' : action.kind === 'complete' ? 'workflow.taskDrawer.completed' : 'workflow.taskDrawer.approved', { title: item.title }));
        onClose();
      },
      onError: (e) => setError(e.message),
    });
  };

  return (
    <DetailDrawer
      title={item.title}
      status={pending ? <StatusChip status="PENDING" /> : <OutcomeChip item={{ ...item, ...detail, kind: item.kind }} decision={data?.review?.decision} />}
      subtitle={t('workflow.taskDrawer.subtitle', { type: workItemType(item), workflow: item.integration.displayName })}
      onClose={onClose}>
      <SubmitError message={error} onClear={() => setError(null)} />
      {isLoading && (
        <Stack gap={2} aria-busy="true">
          <Skeleton variant="rounded" height={150} />
          <Skeleton variant="rounded" height={220} />
        </Stack>
      )}
      {isError && (
        <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => void refetch()}>{t('common.actions.retry')}</Button>}>
          {item.kind === 'task' ? t('workflow.taskDrawer.loadTaskError') : t('workflow.taskDrawer.loadReviewError')}
        </Alert>
      )}
      {detail && (
        <>
          <SectionCard title={t('workflow.taskDrawer.details')}>
            <Stack gap={0.5}>
              <DetailRow label={t('workflow.taskDrawer.workflow')}>
                {onOpenRun ? (
                  <Button size="small" variant="text" onClick={() => onOpenRun(item.workflowId)} sx={{ p: 0, minWidth: 0, textTransform: 'none' }}>
                    {humanize(item.workflowType || item.integration.displayName)}
                  </Button>
                ) : (
                  humanize(item.workflowType || item.integration.displayName)
                )}
              </DetailRow>
              <DetailRow label={t('workflow.taskDrawer.step')}>{humanize(item.name)}</DetailRow>
              <DetailRow label={t('workflow.taskDrawer.created')}>{formatDateTime(detail.startTime)}</DetailRow>
              {detail.closeTime && <DetailRow label={t('workflow.taskDrawer.closed')}>{formatDateTime(detail.closeTime)}</DetailRow>}
              {detail.completedBy && <DetailRow label={t('workflow.taskDrawer.completedBy')}>{completerName(detail.completedBy)}</DetailRow>}
              {data?.review?.decision?.feedback && <DetailRow label={t('workflow.taskDrawer.reason')}>{data.review.decision.feedback}</DetailRow>}
            </Stack>
          </SectionCard>
          {detail.description && (
            <Typography variant="body2" color="text.secondary">
              {detail.description}
            </Typography>
          )}
          {data?.review?.trigger === 'ON_FAILURE' && data.review.errorMessage && (
            <Alert severity="error" variant="outlined">
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {t('workflow.taskDrawer.stepFailed')}
              </Typography>
              {data.review.errorMessage}
            </Alert>
          )}
          <SectionCard title={item.kind === 'review' ? t('workflow.taskDrawer.proposedInput') : t('workflow.taskDrawer.context')}>
            {data?.review ? <ProposedInput review={data.review} /> : <StructuredValue value={detail.taskInput ?? {}} />}
          </SectionCard>
          {data?.task && !pending && (
            <SectionCard title={t('workflow.taskDrawer.response')}>
              <StructuredValue value={data.task.result} />
            </SectionCard>
          )}
          {pending && !canAct && <Alert severity="info">{t('workflow.taskDrawer.assignedElsewhere')}</Alert>}
          {canAct && data?.task && <TaskForm task={data.task} busy={act.isPending} onSubmit={submit} />}
          {canAct && data?.review && <ReviewForm review={data.review} busy={act.isPending} onSubmit={submit} />}
        </>
      )}
    </DetailDrawer>
  );
}
