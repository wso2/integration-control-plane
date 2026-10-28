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

import { Alert, Box, Button, Chip, CircularProgress, IconButton, ListingTable, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { Activity, Check, CircleCheck, Info, RefreshCw, ScrollText } from '@wso2/oxygen-ui-icons-react';
import { useMemo, useState, type JSX, type ReactNode } from 'react';
import * as styles from './PodInsightsTable.styles';
import PodEventsDrawer from './PodEventsDrawer';
import PodLogsDrawer from './PodLogsDrawer';
import { POD_ACTION_LABELS } from '../../constants/runtime';
import { podLastActivity, podRestartCount } from '../../utils/podMetrics';
import { getPodStatus, podStatusPalette, runningPodCount } from '../../utils/pods';
import { formatDistanceToNow } from '../../utils/time';
import type { ClusterPod, PodScope } from '../../types/runtime';

const COLUMN_COUNT = 6;

interface PodInsightsTableProps {
  pods: ClusterPod[] | undefined;
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  onRefresh: () => void;
  scope: PodScope;
  /** Replica count or min/max steppers, owned by the page since it holds the scaling state. */
  replicasControl: ReactNode;
  /** Both row actions read live cluster state, so they follow the Integration manage grant. */
  canManage: boolean;
}

export default function PodInsightsTable({ pods, isLoading, isError, isFetching, onRefresh, scope, replicasControl, canManage }: PodInsightsTableProps): JSX.Element {
  const rows = useMemo(() => pods ?? [], [pods]);
  const { running, total } = runningPodCount(rows);
  // The pod outlives its `open` flag so the drawer can finish sliding out before unmounting.
  const [eventsPod, setEventsPod] = useState<ClusterPod | null>(null);
  const [eventsOpen, setEventsOpen] = useState(false);
  const [logsPod, setLogsPod] = useState<ClusterPod | null>(null);
  const [logsOpen, setLogsOpen] = useState(false);

  const openEvents = (pod: ClusterPod) => {
    setEventsPod(pod);
    setEventsOpen(true);
  };
  const openLogs = (pod: ClusterPod) => {
    setLogsPod(pod);
    setLogsOpen(true);
  };

  return (
    <Box sx={styles.root}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2} sx={styles.header}>
        {replicasControl}

        <Stack direction="row" alignItems="center" gap={1}>
          {total > 0 && (
            <>
              <Box component="span" sx={styles.healthIcon(running === total)}>
                {running === total ? <CircleCheck size={18} fill="currentColor" stroke="#fff" /> : <Info size={18} />}
              </Box>
              <Typography variant="body2">
                {running}/{total} Running
              </Typography>
            </>
          )}
          <Tooltip title="Refresh">
            <span>
              <IconButton size="small" aria-label="Refresh pods" onClick={onRefresh} disabled={isFetching}>
                <RefreshCw size={18} />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
      </Stack>

      {isLoading ? (
        <Box sx={styles.loading}>
          <CircularProgress />
        </Box>
      ) : isError ? (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={onRefresh}>
              Retry
            </Button>
          }>
          Failed to load pods.
        </Alert>
      ) : (
        <ListingTable.Container elevation={0} sx={styles.container}>
          <ListingTable size="small">
            <ListingTable.Head>
              <ListingTable.Row>
                <ListingTable.Cell>Pod Details</ListingTable.Cell>
                <ListingTable.Cell>Status</ListingTable.Cell>
                <ListingTable.Cell>Available</ListingTable.Cell>
                <ListingTable.Cell>Restarts</ListingTable.Cell>
                <ListingTable.Cell>Last Activity</ListingTable.Cell>
                <ListingTable.Cell align="right">Actions</ListingTable.Cell>
              </ListingTable.Row>
            </ListingTable.Head>
            <ListingTable.Body>
              {rows.length === 0 ? (
                <ListingTable.Row>
                  <ListingTable.Cell colSpan={COLUMN_COUNT} align="center" sx={styles.emptyRow}>
                    All pods are currently scaled down.
                  </ListingTable.Cell>
                </ListingTable.Row>
              ) : (
                rows.map((pod) => {
                  const statuses = pod.status.containerStatuses ?? [];
                  const { status, isRunning } = getPodStatus(pod);
                  const palette = podStatusPalette(status, isRunning);
                  const lastActivity = podLastActivity(pod);
                  return (
                    <ListingTable.Row key={pod.metadata.uid}>
                      <ListingTable.Cell sx={styles.podCell}>
                        <Tooltip title={pod.metadata.name}>
                          <Typography variant="body2" sx={styles.podName}>
                            {pod.metadata.name}
                          </Typography>
                        </Tooltip>
                      </ListingTable.Cell>
                      <ListingTable.Cell>
                        <Chip size="small" variant="outlined" color={palette.chip} icon={isRunning ? <Check size={13} /> : <Info size={13} />} label={status} sx={styles.statusChip(palette.text)} />
                      </ListingTable.Cell>
                      <ListingTable.Cell>
                        {statuses.filter((s) => s.ready).length}/{statuses.length || pod.spec.containers.length}
                      </ListingTable.Cell>
                      <ListingTable.Cell>{podRestartCount(pod)}</ListingTable.Cell>
                      <ListingTable.Cell>{lastActivity ? formatDistanceToNow(lastActivity) : '—'}</ListingTable.Cell>
                      <ListingTable.Cell align="right">
                        <Stack direction="row" justifyContent="flex-end" gap={0.5}>
                          <Tooltip title={canManage ? POD_ACTION_LABELS.events : POD_ACTION_LABELS.noPermission}>
                            <span>
                              <IconButton size="small" aria-label={POD_ACTION_LABELS.events} disabled={!canManage} onClick={() => openEvents(pod)}>
                                <Activity size={18} />
                              </IconButton>
                            </span>
                          </Tooltip>
                          <Tooltip title={canManage ? POD_ACTION_LABELS.logs : POD_ACTION_LABELS.noPermission}>
                            <span>
                              <IconButton size="small" aria-label={POD_ACTION_LABELS.logs} disabled={!canManage} onClick={() => openLogs(pod)}>
                                <ScrollText size={18} />
                              </IconButton>
                            </span>
                          </Tooltip>
                        </Stack>
                      </ListingTable.Cell>
                    </ListingTable.Row>
                  );
                })
              )}
            </ListingTable.Body>
          </ListingTable>
        </ListingTable.Container>
      )}

      {/* Kept mounted so both drawers animate in and out; the queries idle while closed. */}
      <PodEventsDrawer open={eventsOpen} onClose={() => setEventsOpen(false)} onExited={() => setEventsPod(null)} pod={eventsPod} scope={scope} />
      <PodLogsDrawer open={logsOpen} onClose={() => setLogsOpen(false)} onExited={() => setLogsPod(null)} pod={logsPod} scope={scope} />
    </Box>
  );
}
