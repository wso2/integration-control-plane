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

import { Alert, Box, Divider, Skeleton, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { AreaChart } from '@wso2/oxygen-ui-charts-react';
import type { JSX } from 'react';
import { InsightsCard, ChartBox } from './shared';
import { INSIGHTS_CHART_COLORS } from '../../../constants/insights';
import { truncate } from '../../../utils/string';
import type { ProjectErrorPoint, ProjectFailingRow } from '../../../types/insights';

/** Errors-over-time area chart (dots off), a divider, then the top failing
 * integrations by error rate. Error count is the highlighted figure, with the
 * rate shown beneath as "{rate}% of {unit}". */
export function TopFailing({ rows, errorSeries, loading = false }: { rows: ProjectFailingRow[]; errorSeries: ProjectErrorPoint[]; loading?: boolean }): JSX.Element {
  return (
    <InsightsCard title="Errors over time" subtitle="Total errors over selected period">
      {loading ? (
        <Skeleton variant="rounded" height={180} />
      ) : (
        <ChartBox>
          <AreaChart
            data={errorSeries}
            xAxisDataKey="label"
            xAxis={{ show: true }}
            yAxis={{ show: true }}
            height={180}
            colors={[INSIGHTS_CHART_COLORS.red]}
            areas={[{ dataKey: 'errors', name: 'Errors', type: 'monotone', stroke: INSIGHTS_CHART_COLORS.red, fill: INSIGHTS_CHART_COLORS.red, fillOpacity: 0.2, dot: false }]}
            legend={{ show: false }}
            tooltip={{ show: true }}
            grid={{ show: true }}
            margin={{ top: 8, right: 12, left: -16, bottom: 0 }}
          />
        </ChartBox>
      )}
      <Divider sx={{ my: 2 }} />
      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5 }}>
        Top failing integrations
      </Typography>
      {loading ? (
        <Skeleton variant="rounded" height={120} />
      ) : rows.length === 0 ? (
        <Alert severity="info">No failing integrations in this period.</Alert>
      ) : (
        <Stack gap={1.5}>
          {rows.map((r) => (
            <Stack key={r.id} direction="row" alignItems="center" justifyContent="space-between" gap={1}>
              <Tooltip title={r.name}>
                <Typography variant="body2" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                  {truncate(r.name, 30)}
                </Typography>
              </Tooltip>
              <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 700, color: 'error.main' }}>
                  {r.errorCount}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {r.errorRate}% of {r.unit}
                </Typography>
              </Box>
            </Stack>
          ))}
        </Stack>
      )}
    </InsightsCard>
  );
}
