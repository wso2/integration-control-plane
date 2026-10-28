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

import { Avatar, Box, CircularProgress, Divider, Stack, Typography } from '@wso2/oxygen-ui';
import { Activity, AlertTriangle, Clock, TrendingUp } from '@wso2/oxygen-ui-icons-react';
import { useTaskExecutions } from '../../../hooks/useExecutions';

interface MetricTileProps {
  icon: React.ReactNode;
  label: string;
  value: number | null;
  unit?: string;
  loading: boolean;
}

function MetricTile({ icon, label, value, unit, loading }: MetricTileProps) {
  return (
    <Stack direction="row" alignItems="center" gap={1.5} sx={{ flex: 1, minWidth: 0 }}>
      <Avatar sx={{ width: 32, height: 32, bgcolor: 'secondary.main', flexShrink: 0 }}>{icon}</Avatar>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', whiteSpace: 'nowrap' }}>
          {label}
        </Typography>
        {loading ? (
          <CircularProgress size={16} />
        ) : (
          <Stack direction="row" alignItems="baseline" gap={0.5}>
            <Typography variant="body1" fontWeight={600}>
              {value ?? '—'}
            </Typography>
            {unit && value !== null && (
              <Typography variant="caption" color="text.secondary">
                {unit}
              </Typography>
            )}
          </Stack>
        )}
      </Box>
    </Stack>
  );
}

// executionScope is the per-environment scope (component/env/project) the OpenChoreo
// execution queries key on. It is one optional, all-or-nothing object so the contract
// reads clearly.
interface AutomationInsightsProps {
  releaseId: string;
  executionScope?: {
    componentId: string;
    envId: string;
    projectId: string;
  };
}

export default function AutomationInsights({ releaseId, executionScope }: AutomationInsightsProps) {
  const { data: executions, isLoading: execLoading } = useTaskExecutions(releaseId, executionScope?.componentId, executionScope?.envId, executionScope?.projectId);

  // The list reconstructs ~30 days of executions, so the count is just its length.
  const count = executions?.length ?? null;
  const countLoading = execLoading;

  const durations = executions?.map((e) => Number(e.completionTime) - Number(e.startTime)).filter((d) => d > 0) ?? [];

  const errorRate = executions?.length ? Math.round((executions.filter((e) => e.status !== 'Succeeded').length / executions.length) * 100) : null;

  const avgDuration = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null;

  const p99Duration = durations.length
    ? (() => {
        const sorted = [...durations].sort((a, b) => a - b);
        const idx = Math.ceil(sorted.length * 0.99) - 1;
        return sorted[Math.max(0, idx)];
      })()
    : null;

  return (
    <>
      <Divider sx={{ mt: 2, mb: 1.5 }} />
      <Stack direction="row" gap={2} flexWrap="wrap">
        <MetricTile icon={<AlertTriangle size={16} />} label="Error Rate" value={errorRate} unit="%" loading={execLoading} />
        <MetricTile icon={<Clock size={16} />} label="Avg Duration" value={avgDuration} unit="s" loading={execLoading} />
        <MetricTile icon={<Activity size={16} />} label="99th Percentile Latency" value={p99Duration} unit="s" loading={execLoading} />
        <MetricTile icon={<TrendingUp size={16} />} label="Total Executions" value={count ?? null} loading={countLoading} />
      </Stack>
    </>
  );
}
