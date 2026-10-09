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

import { IconButton, MenuItem, Stack, Tooltip } from '@wso2/oxygen-ui';
import TextField from '../../../components/common/TextField';
import { RefreshCw } from '@wso2/oxygen-ui-icons-react';
import type { JSX, ReactNode } from 'react';
import { METRICS_RANGES, METRICS_REFRESH_INTERVALS, type MetricsRange } from '../../../types/observability';

interface MetricsHeaderProps {
  range: MetricsRange;
  onRangeChange: (range: MetricsRange) => void;
  refreshSeconds: number;
  onRefreshSecondsChange: (seconds: number) => void;
  onRefresh: () => void;
  isRefreshing?: boolean;
  /** Extra selectors (environment/version) rendered before the range picker. */
  children?: ReactNode;
}

/** Shared controls row for the Metrics pages: time range, auto-refresh interval,
 * manual refresh — Devant's ObservabilityHeader, trimmed. */
export default function MetricsHeader({ range, onRangeChange, refreshSeconds, onRefreshSecondsChange, onRefresh, isRefreshing, children }: MetricsHeaderProps): JSX.Element {
  return (
    <Stack direction="row" alignItems="center" justifyContent="flex-end" flexWrap="wrap" gap={1.5} sx={{ mb: 2 }}>
      {children}
      <TextField select size="small" value={range} onChange={(e) => onRangeChange(e.target.value as MetricsRange)} sx={{ minWidth: 180 }}>
        {METRICS_RANGES.map((r) => (
          <MenuItem key={r.value} value={r.value}>
            {r.label}
          </MenuItem>
        ))}
      </TextField>
      <TextField select size="small" label="Auto-refresh" value={refreshSeconds} onChange={(e) => onRefreshSecondsChange(Number(e.target.value))} sx={{ minWidth: 130 }}>
        {METRICS_REFRESH_INTERVALS.map((i) => (
          <MenuItem key={i.value} value={i.value}>
            {i.label}
          </MenuItem>
        ))}
      </TextField>
      <Tooltip title="Refresh">
        <span>
          <IconButton size="small" onClick={onRefresh} disabled={isRefreshing}>
            <RefreshCw size={16} className={isRefreshing ? 'spin' : undefined} />
          </IconButton>
        </span>
      </Tooltip>
    </Stack>
  );
}
