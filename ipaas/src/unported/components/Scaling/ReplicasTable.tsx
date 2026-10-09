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

import { Box, Chip, CircularProgress, IconButton, ListingTable, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { CircleCheck, Info, RefreshCw } from '@wso2/oxygen-ui-icons-react';
import { useMemo, type JSX } from 'react';
import { usePodMetrics, usePods } from '../../../hooks/useScaling';
import { derivePodRows } from '../../utils/scaling';
import { runningPodCount } from '../../../utils/pods';

interface ReplicasTableProps {
  projectId: string;
  clusterId: string;
  releaseId: string;
  dataPlaneLabel?: string;
}

function relativeTime(iso?: string): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return '—';
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s} second${s === 1 ? '' : 's'} ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}

export default function ReplicasTable({ projectId, clusterId, releaseId, dataPlaneLabel }: ReplicasTableProps): JSX.Element {
  const { data: pods = [], isLoading, isFetching, refetch } = usePods(projectId, clusterId, releaseId);
  const { data: metrics = [] } = usePodMetrics(projectId, clusterId, releaseId);
  const rows = useMemo(() => derivePodRows(pods, metrics), [pods, metrics]);
  const { running, total } = runningPodCount(pods);

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          Replicas
        </Typography>
        <Stack direction="row" alignItems="center" gap={1}>
          <Info size={16} />
          <Typography variant="body2" color="text.secondary">
            {running}/{total} Running
          </Typography>
          <Tooltip title="Refresh">
            <span>
              <IconButton size="small" aria-label="Refresh replicas" onClick={() => refetch()} disabled={isFetching}>
                {isFetching ? <CircularProgress size={16} /> : <RefreshCw size={16} />}
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
      </Stack>

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : rows.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 3 }}>
          No running replicas.
        </Typography>
      ) : (
        <ListingTable.Container>
          <ListingTable size="small">
            <ListingTable.Head>
              <ListingTable.Row>
                <ListingTable.Cell>Pod Details</ListingTable.Cell>
                <ListingTable.Cell>CPU Usage</ListingTable.Cell>
                <ListingTable.Cell>Memory Usage</ListingTable.Cell>
                <ListingTable.Cell>Status</ListingTable.Cell>
                <ListingTable.Cell>Available</ListingTable.Cell>
                <ListingTable.Cell>Restarts</ListingTable.Cell>
                <ListingTable.Cell>Last Activity</ListingTable.Cell>
              </ListingTable.Row>
            </ListingTable.Head>
            <ListingTable.Body>
              {rows.map((row) => (
                <ListingTable.Row key={row.name}>
                  <ListingTable.Cell>
                    <Typography variant="body2" sx={{ fontWeight: 500, fontFamily: 'monospace' }}>
                      {row.name}
                    </Typography>
                    {dataPlaneLabel && (
                      <Typography variant="caption" color="text.secondary">
                        {dataPlaneLabel}
                      </Typography>
                    )}
                  </ListingTable.Cell>
                  <ListingTable.Cell>{row.cpu ?? '—'}</ListingTable.Cell>
                  <ListingTable.Cell>{row.memory ?? '—'}</ListingTable.Cell>
                  <ListingTable.Cell>
                    <Chip icon={row.isRunning ? <CircleCheck size={14} /> : <Info size={14} />} label={row.status} size="small" variant="outlined" color={row.isRunning ? 'success' : 'default'} />
                  </ListingTable.Cell>
                  <ListingTable.Cell>
                    {row.readyContainers} / {row.totalContainers}
                  </ListingTable.Cell>
                  <ListingTable.Cell>{row.restarts}</ListingTable.Cell>
                  <ListingTable.Cell>{relativeTime(row.lastActivity)}</ListingTable.Cell>
                </ListingTable.Row>
              ))}
            </ListingTable.Body>
          </ListingTable>
        </ListingTable.Container>
      )}
    </Box>
  );
}
