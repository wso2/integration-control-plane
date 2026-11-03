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

import { Alert, Box, Button, Card, CardContent, CircularProgress, Divider, IconButton, ListingTable, Skeleton, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { CalendarClock, Hand, Play, RefreshCw } from '@wso2/oxygen-ui-icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TRIGGER_SCOPE, useAuth } from '../../auth';
import { latestTrack, useDeployment, useExecutions, useTriggerExecution } from '../../hooks/useIntegrations';
import type { Execution, ExecutionStatus, Integration } from '../../types/portal';
import { toExecutionArgs } from '../../utils/args';
import { scheduleOf } from '../../utils/cron';
import { formatDateTime, formatDuration, formatRelative } from '../../utils/time';
import { IdText, ListFooter } from '../detail';
import EmptyListing from '../EmptyListing';
import IntegrationHeader, { TrackSelect } from '../IntegrationHeader';
import { FailedIcon, InProgressIcon, SuccessIcon } from '../StatusIcons';
import { useToast } from '../Toast';
import RunDrawer from './RunDrawer';

const bannerSx = { bgcolor: 'action.selected', borderRadius: 1, px: 2, py: 1.25, mb: 2 } as const;

function RunStatus({ execution }: { execution: Execution }) {
  const { t } = useTranslation();
  const icon = execution.status === 'Running' ? <InProgressIcon size={18} /> : execution.status === 'Succeeded' ? <SuccessIcon size={18} /> : <FailedIcon size={18} />;
  return (
    <Stack direction="row" alignItems="center" gap={1}>
      {icon}
      <Typography variant="body2">{t(`automation.status.${execution.status.toLowerCase() as Lowercase<ExecutionStatus>}`)}</Typography>
    </Stack>
  );
}

/** An automation: run it, see when it runs next, and how its runs went. */
export default function AutomationView({ integration }: { integration: Integration }) {
  const { t } = useTranslation();
  const toast = useToast();
  const { hasScope } = useAuth();
  const [trackId, setTrackId] = useState(latestTrack(integration)?.id);
  const deployment = useDeployment(integration.id, trackId);
  const executions = useExecutions(integration.id, trackId);
  const trigger = useTriggerExecution(integration.id, trackId);
  const [drawer, setDrawer] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  const args = deployment.data?.runtimeArgs ?? [];
  const schedule = scheduleOf(deployment.data);
  const runs = executions.data?.pages.flatMap((p) => p.items) ?? [];
  const canRun = hasScope(TRIGGER_SCOPE);
  const blockedReason = canRun ? '' : t('automation.notAllowed');

  const start = (values = {}) => {
    setRunError(null);
    trigger.mutate(toExecutionArgs(args, values), {
      onSuccess: () => {
        setDrawer(false);
        toast(t('automation.started', { name: integration.displayName }));
      },
      onError: (e) => (args.length ? setRunError(e.message) : toast(e.message, 'error')),
    });
  };

  return (
    <>
      <IntegrationHeader
        integration={integration}
        actions={
          <>
            <TrackSelect tracks={integration.deploymentTracks} value={trackId} onChange={setTrackId} />
            <Tooltip title={blockedReason}>
              <span>
                <Button
                  variant="contained"
                  startIcon={trigger.isPending && !drawer ? <CircularProgress size={16} color="inherit" /> : <Play size={16} />}
                  disabled={!!blockedReason || trigger.isPending || deployment.isLoading}
                  onClick={() => (args.length ? setDrawer(true) : start())}>
                  {schedule ? t('automation.runNow') : t('common.actions.run')}
                </Button>
              </span>
            </Tooltip>
          </>
        }
      />

      <Card variant="outlined">
        <CardContent sx={{ pb: (theme) => `${theme.spacing(2)} !important` }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1}>
            <Stack direction="row" alignItems="center" gap={1.5}>
              <Typography variant="h5" component="h2" sx={{ fontWeight: 600, textTransform: 'capitalize' }}>
                {deployment.data?.environmentName ?? (deployment.isLoading ? <Skeleton width={120} /> : t('automation.environment'))}
              </Typography>
            </Stack>
            <Tooltip title={t('common.actions.refresh')}>
              <IconButton
                size="small"
                aria-label={t('common.actions.refresh')}
                disabled={executions.isFetching}
                onClick={() => {
                  void deployment.refetch();
                  void executions.refetch();
                }}>
                <RefreshCw size={16} style={{ animation: executions.isFetching ? 'spin 1s linear infinite' : undefined }} />
              </IconButton>
            </Tooltip>
          </Stack>
          <Divider sx={{ my: 2 }} />

          {deployment.isError ? (
            <Alert severity="error">{t('automation.deploymentError')}</Alert>
          ) : deployment.isLoading ? (
            <Skeleton variant="rounded" height={44} sx={{ mb: 2 }} />
          ) : (
            <Stack direction="row" alignItems="center" gap={1.5} sx={bannerSx}>
              {schedule ? <CalendarClock size={18} /> : <Hand size={18} />}
              <Box>
                <Typography variant="body2">{schedule ? schedule.description : t('automation.noSchedule')}</Typography>
                {schedule && (
                  <Typography variant="caption" color="text.secondary">
                    {t('automation.nextRun', { relative: formatRelative(schedule.next.toISOString()), date: formatDateTime(schedule.next.toISOString()) })}
                  </Typography>
                )}
              </Box>
            </Stack>
          )}

          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
            {t('automation.runs')}
          </Typography>
          {executions.isLoading ? (
            <Stack gap={1}>
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} variant="rounded" height={40} />
              ))}
            </Stack>
          ) : executions.isError ? (
            <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => void executions.refetch()}>{t('common.actions.retry')}</Button>}>
              {t('automation.runsError')}
            </Alert>
          ) : runs.length === 0 ? (
            <EmptyListing compact icon={<Play size={40} />} title={t('automation.noRuns.title')} description={schedule ? t('automation.noRuns.scheduled') : t('automation.noRuns.onDemand')} />
          ) : (
            <>
              <ListingTable.Container>
                <ListingTable density="compact">
                  <ListingTable.Head>
                    <ListingTable.Row>
                      <ListingTable.Cell>{t('automation.columns.status')}</ListingTable.Cell>
                      <ListingTable.Cell>{t('automation.columns.started')}</ListingTable.Cell>
                      <ListingTable.Cell>{t('automation.columns.duration')}</ListingTable.Cell>
                      <ListingTable.Cell>{t('automation.columns.runId')}</ListingTable.Cell>
                    </ListingTable.Row>
                  </ListingTable.Head>
                  <ListingTable.Body>
                    {runs.map((run) => (
                      <ListingTable.Row key={run.jobId}>
                        <ListingTable.Cell>
                          <RunStatus execution={run} />
                        </ListingTable.Cell>
                        <ListingTable.Cell>
                          <Typography variant="body2" title={formatDateTime(run.startTime)}>
                            {formatRelative(run.startTime)}
                          </Typography>
                        </ListingTable.Cell>
                        <ListingTable.Cell>
                          <Typography variant="body2" color="text.secondary">
                            {formatDuration(run.startTime, run.completionTime)}
                          </Typography>
                        </ListingTable.Cell>
                        <ListingTable.Cell>
                          <IdText id={run.jobId} />
                        </ListingTable.Cell>
                      </ListingTable.Row>
                    ))}
                  </ListingTable.Body>
                </ListingTable>
              </ListingTable.Container>
              <ListFooter summary={t(executions.hasNextPage ? 'common.list.runsMore' : 'common.list.runs', { count: runs.length })} hasMore={!!executions.hasNextPage} loadingMore={executions.isFetchingNextPage} onLoadMore={() => void executions.fetchNextPage()} />
            </>
          )}
        </CardContent>
      </Card>

      {drawer && <RunDrawer name={integration.displayName} args={args} busy={trigger.isPending} error={runError} onRun={start} onClose={() => setDrawer(false)} />}
    </>
  );
}
