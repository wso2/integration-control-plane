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

import { Alert, Skeleton } from '@wso2/oxygen-ui';
import { LineChart } from '@wso2/oxygen-ui-charts-react';
import type { JSX } from 'react';
import { ChartBox, InsightsCard } from '../Insights/shared';
import type { MetricsDatum } from '../../../types/observability';

export interface MetricSeries {
  key: string;
  name: string;
  color: string;
}

interface MetricGraphProps {
  title: string;
  /** e.g. "MB", "req/min", "s", "vCPU" — appended to the card subtitle. */
  unit?: string;
  rows: MetricsDatum[] | undefined;
  series: MetricSeries[];
  isLoading: boolean;
  isError?: boolean;
  onRetry?: () => void;
}

/** One metrics chart card — multi-series LineChart with loading/empty/error states. */
export default function MetricGraph({ title, unit, rows, series, isLoading, isError, onRetry }: MetricGraphProps): JSX.Element {
  return (
    <InsightsCard title={title} subtitle={unit ? `Values in ${unit}` : undefined}>
      {isLoading ? (
        <Skeleton variant="rounded" height={260} />
      ) : isError ? (
        <Alert
          severity="error"
          action={
            onRetry ? (
              <span style={{ cursor: 'pointer', fontWeight: 600 }} onClick={onRetry} onKeyDown={(e) => e.key === 'Enter' && onRetry()} role="button" tabIndex={0}>
                Retry
              </span>
            ) : undefined
          }>
          Failed to load metrics.
        </Alert>
      ) : !rows || rows.length === 0 ? (
        <Alert severity="info">No data in the selected time range.</Alert>
      ) : (
        <ChartBox>
          <LineChart
            data={rows}
            xAxisDataKey="label"
            height={260}
            colors={series.map((s) => s.color)}
            lines={series.map((s) => ({ dataKey: s.key, name: s.name, stroke: s.color, type: 'monotone' as const, dot: false }))}
            legend={{ show: true, verticalAlign: 'top' }}
            margin={{ top: 16 }}
            tooltip={{ show: true }}
            grid={{ show: true }}
          />
        </ChartBox>
      )}
    </InsightsCard>
  );
}
