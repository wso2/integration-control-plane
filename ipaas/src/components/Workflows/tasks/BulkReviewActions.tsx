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

import { Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from '@wso2/oxygen-ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type JSX } from 'react';
import { workflowKeys } from '../api/queryKeys';
import type { BulkRetryResult } from '../api/types';
import type { ReadyWorkflowApi } from '../api/useWorkflowApi';
import { actionErrorText, countOf } from './workItem';

/**
 * Retry or fail a set of pending reviews in one call.
 *
 * One behaviour is deliberate: the engine answers
 * **200 even when individual items failed**, reporting per-item outcomes, so this reads the counts
 * and reports them rather than treating a 200 as "all done".
 *
 * Any pending review is eligible: the engine proceeds a review whatever its trigger.
 * Human tasks are never bulk-actioned, because each one carries a result a person has to supply.
 *
 * Mounted for one batch at a time, so each opening starts clean: no error, feedback or outcome
 * from the last batch.
 */

interface BulkReviewActionsProps {
  action: 'retry' | 'fail';
  taskIds: string[];
  api: ReadyWorkflowApi;
  onClose: () => void;
  onDone: (result: BulkRetryResult) => void;
}

export default function BulkReviewActions({ action, taskIds, api, onClose, onDone }: BulkReviewActionsProps): JSX.Element {
  const { client, connection } = api;
  const { scopeId } = connection;
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState<string | null>(null);
  // The answer, kept on screen when any review was not decided, so the reasons can be read.
  const [result, setResult] = useState<BulkRetryResult | null>(null);
  const count = taskIds.length;

  const bulk = useMutation({
    mutationFn: () => client.reviews.bulkRetry({ action, taskIds, ...(action === 'fail' && feedback.trim() ? { feedback: feedback.trim() } : {}) }),
    onSuccess: (answer) => {
      void queryClient.invalidateQueries({ queryKey: [...workflowKeys.all(scopeId), 'reviews'] });
      void queryClient.invalidateQueries({ queryKey: [...workflowKeys.all(scopeId), 'instances'] });
      onDone(answer);
      if ((answer.items ?? []).every((item) => item.outcome === 'APPLIED')) {
        onClose();
      } else {
        setResult(answer);
      }
    },
    onError: (failure) => setError(actionErrorText(connection, failure, 'The bulk decision failed.')),
  });
  const submitting = bulk.isPending;

  const undecided = (result?.items ?? []).filter((item) => item.outcome !== 'APPLIED');
  const reviews = countOf(count, 'review');
  const note =
    action === 'retry'
      ? `Reruns the reviewed activity of each selected review with its original arguments; a bulk decision cannot edit them. ${reviews} will be decided; per-review outcomes are reported.`
      : `Rejects every selected review; each failure is propagated to its workflow, which decides what happens next. ${reviews} will be decided. This cannot be undone.`;

  const submit = () => {
    if (count === 0) {
      return;
    }
    setError(null);
    bulk.mutate();
  };

  return (
    <Dialog open onClose={submitting ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{action === 'retry' ? 'Retry Selected Reviews' : 'Fail Selected Reviews'}</DialogTitle>
      <DialogContent>
        {result ? (
          <Stack gap={1.5}>
            <Alert severity="warning">{`${result.applied} of ${result.requested} decided. These were not:`}</Alert>
            {undecided.map((item) => (
              <Typography key={item.taskId} variant="body2">
                {`${item.taskId}: ${item.outcome === 'SKIPPED' ? 'skipped' : 'failed'}${item.reason ? `, ${item.reason}` : ''}`}
              </Typography>
            ))}
          </Stack>
        ) : (
          <Stack gap={1.5}>
            {error && <Alert severity="error">{error}</Alert>}
            <Alert severity={action === 'retry' ? 'info' : 'warning'}>{note}</Alert>
            {action === 'fail' && (
              <TextField
                labelPlacement="top"
                label="Feedback"
                optional
                value={feedback}
                onChange={(event) => setFeedback(event.target.value)}
                helperText="Relayed to each workflow as the rejection reason."
                size="small"
                fullWidth
                multiline
                minRows={2}
                disabled={submitting}
              />
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        {result ? (
          <Button variant="outlined" color="inherit" onClick={onClose}>
            Close
          </Button>
        ) : (
          <>
            <Button variant="outlined" color="inherit" disabled={submitting} onClick={onClose}>
              Back
            </Button>
            <Button variant="contained" color={action === 'retry' ? 'primary' : 'error'} disabled={submitting || count === 0} onClick={submit} startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : undefined}>
              {action === 'retry' ? `Retry ${count}` : `Fail ${count}`}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
