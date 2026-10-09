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

import { Alert, Box, Button, Grid, MenuItem, Paper, Skeleton, Stack, Typography } from '@wso2/oxygen-ui';
import TextField from '../../../../components/common/TextField';
import { LineChart } from '@wso2/oxygen-ui-charts-react';
import { useState, type JSX } from 'react';
import { useServerMetrics } from '../../../hooks/usePlatformServices';
import { METRIC_CHART_COLORS, METRIC_PERIODS } from '../../../../constants/platformServices';
import { metricsToChart, metricTitle } from '../../../utils/platformServices';
import type { MetricPeriod, ServerVariant } from '../../../../types/platformServices';

export default function MetricsTab({ serverId, variant = 'db-servers' }: { serverId: string; variant?: ServerVariant }): JSX.Element {
  const [period, setPeriod] = useState<MetricPeriod>('hour');
  const { data, isLoading, isError, refetch } = useServerMetrics(serverId, period, variant);

  const metrics = Object.entries(data?.metrics ?? {});

  return (
    <Box>
      <Stack direction="row" justifyContent="flex-end" sx={{ mb: 2 }}>
        <TextField select size="small" label="Period" value={period} onChange={(e) => setPeriod(e.target.value as MetricPeriod)} sx={{ minWidth: 180 }}>
          {METRIC_PERIODS.map((p) => (
            <MenuItem key={p.value} value={p.value}>
              {p.label}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      {isLoading ? (
        <Grid container spacing={2}>
          {Array.from({ length: 3 }).map((_, i) => (
            <Grid key={i} size={12}>
              <Paper variant="outlined" sx={{ p: 2 }} aria-busy="true" aria-label="Loading metrics">
                <Skeleton width={140} sx={{ mb: 1 }} />
                <Skeleton variant="rounded" height={260} />
              </Paper>
            </Grid>
          ))}
        </Grid>
      ) : isError ? (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => refetch()}>
              Retry
            </Button>
          }>
          Failed to load metrics.
        </Alert>
      ) : metrics.length === 0 ? (
        <Alert severity="info">No metrics are available for this period.</Alert>
      ) : (
        <Grid container spacing={2}>
          {metrics.map(([key, series]) => {
            const chart = metricsToChart(series);
            return (
              <Grid key={key} size={12}>
                <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                    {metricTitle(key)}
                  </Typography>
                  {chart.data.length > 0 ? (
                    <LineChart
                      data={chart.data}
                      lines={chart.lines.map((l, i) => ({ ...l, type: 'monotone' as const, stroke: METRIC_CHART_COLORS[i % METRIC_CHART_COLORS.length], dot: false }))}
                      xAxisDataKey="time"
                      height={260}
                      colors={METRIC_CHART_COLORS}
                      legend={{ show: chart.lines.length > 1 }}
                      tooltip={{ show: true }}
                    />
                  ) : (
                    <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
                      No data points.
                    </Typography>
                  )}
                </Paper>
              </Grid>
            );
          })}
        </Grid>
      )}
    </Box>
  );
}
