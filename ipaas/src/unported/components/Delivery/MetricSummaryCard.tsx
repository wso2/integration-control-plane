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

import { Avatar, Box, Chip, Skeleton, Stack, Typography } from '@wso2/oxygen-ui';
import { ArrowDown, ArrowUp } from '@wso2/oxygen-ui-icons-react';
import type { JSX, ReactNode } from 'react';

// DORA performance-band chip colors (Devant's MetricSummary getColorForStatus).
const PERF_COLOR: Record<string, 'success' | 'info' | 'warning' | 'error'> = { High: 'success', Elite: 'info', Medium: 'warning', Low: 'error' };

interface MetricSummaryCardProps {
  icon: ReactNode;
  title: string;
  /** DORA performance band (Elite/High/Medium/Low) shown as an outlined chip. */
  status?: string | null;
  /** Relative change %, rendered green/red with an arrow (deployment frequency only). */
  percentageChange?: number | null;
  isLoading?: boolean;
  children: ReactNode;
}

/** One DORA KPI card: icon + title + perf chip, big value beneath. */
export default function MetricSummaryCard({ icon, title, status, percentageChange, isLoading, children }: MetricSummaryCardProps): JSX.Element {
  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 2.5 }}>
      <Stack direction="row" gap={2} alignItems="flex-start">
        <Avatar sx={{ width: 44, height: 44, bgcolor: 'action.hover', color: 'text.secondary' }}>{icon}</Avatar>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
            <Typography variant="caption" color="text.secondary">
              {title}
            </Typography>
            {status && (isLoading ? <Skeleton variant="rounded" width={44} height={20} /> : <Chip size="small" variant="outlined" label={status} color={PERF_COLOR[status] ?? 'default'} sx={{ height: 20, '& .MuiChip-label': { px: 1, fontSize: 11 } }} />)}
          </Stack>
          {isLoading ? (
            <Skeleton variant="rounded" width={120} height={36} sx={{ mt: 1 }} />
          ) : (
            <Stack direction="row" alignItems="flex-end" gap={0.75} flexWrap="wrap" sx={{ mt: 0.5 }}>
              {children}
              {percentageChange != null && percentageChange !== 0 && (
                <Stack direction="row" alignItems="center" gap={0.25} sx={{ color: percentageChange > 0 ? 'success.main' : 'error.main', pb: 0.5 }}>
                  <Typography variant="caption" sx={{ fontWeight: 600 }}>
                    {percentageChange}%
                  </Typography>
                  {percentageChange > 0 ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                </Stack>
              )}
            </Stack>
          )}
        </Box>
      </Stack>
    </Box>
  );
}
