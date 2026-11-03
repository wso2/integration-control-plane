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

import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, CardActionArea, CircularProgress, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Skeleton, Stack, Typography } from '@wso2/oxygen-ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useWorkItems, type WorkItem } from '../../hooks/useTasks';
import { useCancelRun, useRun, useWorkflowClient, wfKey } from '../../hooks/useWorkflows';
import type { Integration } from '../../types/portal';
import { formatDateTime, formatDuration, humanize } from '../../utils/time';
import { DetailDrawer, DetailRow, IdText, SectionCard, StatusChip } from '../detail';
import StructuredValue from '../StructuredValue';
import { useToast } from '../Toast';
import StepTimeline from './StepTimeline';
import { WorkItemTypeChip } from './WorkItemsTable';

const LOOKUP_LIMIT = 100;

/** A task's link names only the workflow ID; the run is found among the recent runs. */
function useRunId(url: string, workflowId: string, runId: string | undefined) {
  const client = useWorkflowClient(url);
  const lookup = useQuery({
    queryKey: wfKey(url, 'run-of', workflowId),
    queryFn: async () => (await client!.runs('', LOOKUP_LIMIT)).items.find((r) => r.workflowId === workflowId) ?? null,
    enabled: !runId && !!client,
  });
  return { runId: runId ?? lookup.data?.runId, summary: lookup.data, missing: !runId && lookup.isSuccess && !lookup.data };
}

function WaitingItem({ item, onOpen }: { item: WorkItem; onOpen: () => void }) {
  const { t } = useTranslation();
  return (
    <Card variant="outlined">
      <CardActionArea onClick={onOpen} sx={{ px: 2, py: 1.5 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2}>
          <Stack sx={{ minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {item.title}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {t('workflow.runDrawer.waitingFor', { step: humanize(item.name), duration: formatDuration(item.startTime) })}
            </Typography>
          </Stack>
          <WorkItemTypeChip item={item} />
        </Stack>
      </CardActionArea>
    </Card>
  );
}

/** One run of a workflow: its summary, what it waits on, its outcome and its steps. */
export default function RunDrawer({ integration, url, workflowId, runId: givenRunId, startTime, onClose, onOpenTask }: { integration: Integration; url: string; workflowId: string; runId?: string; startTime?: string; onClose: () => void; onOpenTask: (item: WorkItem) => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const { runId, summary, missing } = useRunId(url, workflowId, givenRunId);
  const { info, steps } = useRun(url, workflowId, runId);
  const { items } = useWorkItems([integration]);
  const cancel = useCancelRun(url);
  const [confirm, setConfirm] = useState(false);

  const run = info.data;
  const attempts = steps.data ?? [];
  const started = startTime ?? summary?.startTime ?? attempts[0]?.startTime ?? null;
  const ended = run && run.status !== 'RUNNING' ? (attempts[attempts.length - 1]?.endTime ?? summary?.closeTime ?? null) : null;
  const waiting = items.filter((i) => i.workflowId === workflowId);
  const live = run?.status === 'RUNNING' || run?.status === 'SUSPENDED';

  return (
    <DetailDrawer
      title={run ? humanize(run.workflowType) : t('workflow.runDrawer.title')}
      status={run && <StatusChip status={run.status} />}
      subtitle={integration.displayName}
      onClose={onClose}
      actions={
        live && (
          <Button variant="outlined" color="error" onClick={() => setConfirm(true)} disabled={cancel.isPending}>
            {t('workflow.runDrawer.cancelRun')}
          </Button>
        )
      }>
      {missing && <Alert severity="warning">{t('workflow.runDrawer.notFound')}</Alert>}
      {info.isError && (
        <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => void info.refetch()}>{t('common.actions.retry')}</Button>}>
          {t('workflow.runDrawer.loadError')}
        </Alert>
      )}
      {!missing && !run && !info.isError && (
        <Stack gap={2} aria-busy="true">
          <Skeleton variant="rounded" height={140} />
          <Skeleton variant="rounded" height={260} />
        </Stack>
      )}
      {run && runId && (
        <>
          <SectionCard title={t('workflow.runDrawer.summary')}>
            <Stack gap={0.5}>
              <DetailRow label={t('workflow.runDrawer.runId')}>
                <IdText id={runId} full />
              </DetailRow>
              <DetailRow label={t('workflow.runDrawer.started')}>{formatDateTime(started)}</DetailRow>
              {ended && <DetailRow label={t('workflow.runDrawer.ended')}>{formatDateTime(ended)}</DetailRow>}
              <DetailRow label={t('workflow.runDrawer.duration')}>{formatDuration(started, ended)}</DetailRow>
            </Stack>
          </SectionCard>

          {waiting.length > 0 && (
            <SectionCard title={t('workflow.runDrawer.waitingOnYou')} badge={<Typography variant="caption" sx={{ color: 'warning.main', fontWeight: 600 }}>{waiting.length}</Typography>}>
              <Stack gap={1}>
                {waiting.map((item) => (
                  <WaitingItem key={item.id} item={item} onOpen={() => onOpenTask(item)} />
                ))}
              </Stack>
            </SectionCard>
          )}

          {run.errorMessage && (
            <Alert severity="error">
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {run.status === 'FAILED' ? t('workflow.runDrawer.runFailed') : t('workflow.runDrawer.error')}
              </Typography>
              {run.errorMessage}
            </Alert>
          )}

          {run.status === 'COMPLETED' && (
            <SectionCard title={t('workflow.runDrawer.result')}>
              <StructuredValue value={run.result} />
            </SectionCard>
          )}

          <SectionCard title={t('workflow.runDrawer.steps')} actions={info.isFetching && live ? <CircularProgress size={12} /> : undefined}>
            {steps.isLoading ? <Skeleton variant="rounded" height={160} /> : <StepTimeline attempts={attempts} />}
          </SectionCard>
        </>
      )}

      <Dialog open={confirm} onClose={() => setConfirm(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{t('workflow.runDrawer.confirmTitle')}</DialogTitle>
        <DialogContent>
          <DialogContentText>{t('workflow.runDrawer.confirmMessage')}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(false)}>{t('workflow.runDrawer.keepRunning')}</Button>
          <Button
            variant="contained"
            color="error"
            disabled={cancel.isPending}
            startIcon={cancel.isPending ? <CircularProgress size={16} color="inherit" /> : undefined}
            onClick={() =>
              runId &&
              cancel.mutate(
                { workflowId, runId },
                {
                  onSuccess: () => {
                    setConfirm(false);
                    toast(t('workflow.runDrawer.cancelled'));
                  },
                  onError: (e) => {
                    setConfirm(false);
                    toast(e.message, 'error');
                  },
                },
              )
            }>
            {t('workflow.runDrawer.cancelRun')}
          </Button>
        </DialogActions>
      </Dialog>
    </DetailDrawer>
  );
}
