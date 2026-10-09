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

import { Autocomplete, Box, CircularProgress, MenuItem, Select, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@wso2/oxygen-ui';
import TextField from '../../../components/common/TextField';
import { type JSX, useMemo, useState } from 'react';
import type { CloudDataPlane, Environment } from '../../../types/environment';
import { choreoAlertingApiUrl } from '../../../config/runtimeConfig';
import { IS_CLOUD } from '../../../features';
import { useGetAlertHistory } from '../../hooks/useAlerts';

interface AlertsHistoryPageProps {
  componentId: string;
  environments: Environment[];
  cloudDataPlanes: CloudDataPlane[];
}

const TIME_RANGE_OPTIONS: { label: string; hours: number }[] = [
  { label: 'Last 1 hour', hours: 1 },
  { label: 'Last 6 hours', hours: 6 },
  { label: 'Last 24 hours', hours: 24 },
  { label: 'Last 7 days', hours: 168 },
];

function formatCellValue(value: unknown, columnType: string): string {
  if (value === null || value === undefined) return '-';
  if (columnType === 'datetime' && typeof value === 'string') {
    try {
      return new Date(value).toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return String(value);
    }
  }
  return String(value);
}

export default function AlertsHistoryPage({ componentId, environments, cloudDataPlanes }: AlertsHistoryPageProps): JSX.Element {
  const [selectedEnvironment, setSelectedEnvironment] = useState<Environment | undefined>(environments[0]);
  const [timeRangeHours, setTimeRangeHours] = useState(1);

  const alertingBaseUrl = useMemo(() => {
    if (IS_CLOUD) return '';
    if (!selectedEnvironment?.dpId || !cloudDataPlanes.length) return '';
    const cdp = cloudDataPlanes.find((c) => c.id.toLowerCase() === selectedEnvironment.dpId!.toLowerCase());
    return cdp ? choreoAlertingApiUrl(cdp.external_gateway_virtual_host) : '';
  }, [selectedEnvironment, cloudDataPlanes]);

  const { startTime, endTime } = useMemo(() => {
    const now = new Date();
    const end = now.toISOString();
    const start = new Date(now.getTime() - timeRangeHours * 3600_000).toISOString();
    return { startTime: start, endTime: end };
  }, [timeRangeHours]);

  const { data: historyData, isFetching } = useGetAlertHistory(alertingBaseUrl, componentId, selectedEnvironment?.id ?? '', startTime, endTime);

  if (!environments.length) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', p: 4, gap: 1 }}>
        <Typography variant="body1" color="text.secondary">
          No environments available.
        </Typography>
      </Box>
    );
  }

  const columns = historyData?.columns ?? [];
  const rows = historyData?.rows ?? [];

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 2 }}>
        <Typography variant="body2">Filter by:</Typography>
        <Autocomplete
          options={environments}
          getOptionLabel={(e) => e.name}
          value={selectedEnvironment ?? null}
          onChange={(_, v) => {
            if (v) setSelectedEnvironment(v);
          }}
          renderInput={(params) => <TextField {...params} size="small" label="Environment" />}
          isOptionEqualToValue={(o, v) => o.id === v.id}
          sx={{ minWidth: 200 }}
          size="small"
        />
        <Select value={timeRangeHours} onChange={(e) => setTimeRangeHours(Number(e.target.value))} size="small" sx={{ minWidth: 160 }} inputProps={{ 'aria-label': 'Time range' }}>
          {TIME_RANGE_OPTIONS.map((opt) => (
            <MenuItem key={opt.hours} value={opt.hours}>
              {opt.label}
            </MenuItem>
          ))}
        </Select>
      </Box>

      {isFetching && (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {!isFetching && rows.length === 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', p: 4, gap: 1 }}>
          <Typography variant="body1" color="text.secondary">
            No alert history found.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            No alerts were triggered for the selected environment and time range.
          </Typography>
        </Box>
      )}

      {!isFetching && rows.length > 0 && columns.length > 0 && (
        <Box sx={{ px: 2, pb: 2 }}>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {columns.map((col) => (
                    <TableCell key={col.name}>
                      <Typography variant="caption" sx={{ fontWeight: 600, textTransform: 'uppercase', color: 'text.secondary' }}>
                        {col.name.replace(/([A-Z])/g, ' $1').trim()}
                      </Typography>
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row, rowIdx) => (
                  <TableRow key={rowIdx} hover>
                    {columns.map((col, colIdx) => (
                      <TableCell key={col.name}>
                        <Typography variant="caption">{formatCellValue((row as unknown[])[colIdx], col.type)}</Typography>
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}
    </Box>
  );
}
