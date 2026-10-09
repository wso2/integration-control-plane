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

import { Alert, Box, Button, Chip, CircularProgress, Divider, Drawer, IconButton, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import TextField from '../../../components/common/TextField';
import { X } from '@wso2/oxygen-ui-icons-react';
import { useEffect, useState, type JSX } from 'react';
import { workflowStatusChip } from '../../constants/workflows';
import { useCancelWorkflowInstance, useReviewWorkflow, useWorkflowReviewData } from '../../hooks/useWorkflows';
import { formatDateTime } from '../../../utils/time';
import { ReviewerDecision, WorkflowInstanceStatus, type WorkflowInstanceResponse } from '../../../types/workflow';
import { drawerBody, drawerHeader } from './ApprovalReviewDrawer.styles';

function Field({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2">{value || '—'}</Typography>
    </Box>
  );
}

interface ApprovalReviewDrawerProps {
  instance: WorkflowInstanceResponse | null;
  onClose: () => void;
  onActionDone: (message: string) => void;
  onActionError: (message: string) => void;
}

export default function ApprovalReviewDrawer({ instance, onClose, onActionDone, onActionError }: ApprovalReviewDrawerProps): JSX.Element | null {
  const [comment, setComment] = useState('');
  const review = useReviewWorkflow();
  const cancel = useCancelWorkflowInstance();
  const { data: reviewData, isLoading: loadingReview } = useWorkflowReviewData(instance?.wkfId ?? null);

  useEffect(() => {
    setComment('');
  }, [instance?.wkfId]);

  if (!instance) return null;

  const isPending = instance.status === WorkflowInstanceStatus.Pending;
  const chip = workflowStatusChip(instance.status);
  const busy = review.isPending || cancel.isPending;

  const submit = (decision: ReviewerDecision) => {
    review.mutate(
      { workflowId: instance.wkfId, input: { decision, reviewComment: comment.trim() || undefined } },
      {
        onSuccess: () => onActionDone(decision === ReviewerDecision.Approved ? 'Request approved.' : 'Request rejected.'),
        onError: (e) => onActionError(e instanceof Error ? e.message : 'Failed to submit the decision.'),
      },
    );
  };

  const doCancel = () => {
    cancel.mutate(instance.wkfId, {
      onSuccess: () => onActionDone('Request cancelled.'),
      onError: (e) => onActionError(e instanceof Error ? e.message : 'Failed to cancel the request.'),
    });
  };

  return (
    <Drawer anchor="right" open onClose={onClose}>
      <Box sx={drawerBody}>
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" sx={drawerHeader}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              {instance.workflowDefinitionIdentifier}
            </Typography>
            <Chip size="small" variant="outlined" color={chip.color} label={chip.label} sx={{ mt: 1 }} />
          </Box>
          <IconButton size="small" aria-label="Close" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </Stack>

        <Divider sx={{ mb: 2 }} />

        <Stack gap={2}>
          <Field label="Requested by" value={instance.createdUser?.displayName || instance.createdUser?.email || '—'} />
          <Field label="Requested at" value={formatDateTime(instance.createdTime)} />
          <Field label="Resource" value={instance.context?.resource ?? ''} />
          {instance.requestComment && <Field label="Request comment" value={instance.requestComment} />}

          {loadingReview ? <CircularProgress size={20} /> : reviewData?.comment && <Field label="Details" value={reviewData.comment} />}

          {instance.reviewerDecision && (
            <>
              <Divider />
              <Field label="Decision" value={instance.reviewerDecision.decision} />
              <Field label="Reviewed by" value={instance.reviewerDecision.reviewedUser?.displayName || instance.reviewerDecision.reviewedUser?.email || '—'} />
              <Field label="Reviewed at" value={formatDateTime(instance.reviewerDecision.reviewedTime)} />
              {instance.reviewerDecision.reviewComment && <Field label="Review comment" value={instance.reviewerDecision.reviewComment} />}
            </>
          )}

          {instance.status === WorkflowInstanceStatus.Cancelled && instance.cancelledBy && (
            <>
              <Divider />
              <Field label="Cancelled by" value={instance.cancelledBy.displayName || instance.cancelledBy.email} />
              <Field label="Cancelled at" value={formatDateTime(instance.cancelledTime)} />
            </>
          )}

          {isPending && (
            <>
              <Divider />
              <TextField label="Comment (optional)" value={comment} onChange={(e) => setComment(e.target.value)} multiline minRows={2} fullWidth disabled={busy} />
              {(review.isError || cancel.isError) && <Alert severity="error">Action failed. Please try again.</Alert>}
              <Stack direction="row" gap={1.5} flexWrap="wrap">
                <Button variant="contained" color="success" disabled={busy} onClick={() => submit(ReviewerDecision.Approved)}>
                  Approve
                </Button>
                <Button variant="contained" color="error" disabled={busy} onClick={() => submit(ReviewerDecision.Rejected)}>
                  Reject
                </Button>
                <Tooltip title="Cancel this request">
                  <span>
                    <Button variant="outlined" disabled={busy} onClick={doCancel}>
                      Cancel Request
                    </Button>
                  </span>
                </Tooltip>
              </Stack>
            </>
          )}
        </Stack>
      </Box>
    </Drawer>
  );
}
