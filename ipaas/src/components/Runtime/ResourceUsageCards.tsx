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

import { Card, CardContent, Chip, Grid, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import { type JSX, type ReactNode } from 'react';
import { formatBytes, formatVcpu } from '../../utils/podMetrics';
import type { CalculatedUsage, UsageReading } from '../../types/runtime';
import UsageBar from './UsageBar';

const cardSx = {
  border: '1px solid',
  borderColor: 'divider',
  borderRadius: 1,
} as const;

const UNAVAILABLE_TOOLTIP = "Usage metrics couldn't be retrieved for this release.";

interface UsageCardProps {
  title: string;
  detail: ReactNode;
  usagePercent: number;
  unavailable?: boolean;
  /** Shows `usagePercent` as a figure beside the title. */
  showPercent?: boolean;
  /** The autoscaler's target for this resource, shown under the detail. */
  target?: number;
}

function UsageCard({ title, detail, usagePercent, unavailable, showPercent, target }: UsageCardProps): JSX.Element {
  return (
    <Card elevation={0} sx={cardSx}>
      <CardContent>
        <Stack gap={1.5}>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Typography variant="h6">{title}</Typography>
            {unavailable ? (
              <Tooltip title={UNAVAILABLE_TOOLTIP}>
                <Chip size="small" variant="outlined" label="Unavailable" sx={{ height: 20, fontSize: '0.68rem', fontWeight: 500 }} />
              </Tooltip>
            ) : (
              showPercent && <Typography variant="h6">{Math.round(usagePercent)}%</Typography>
            )}
          </Stack>
          <Typography variant="body2" color="text.secondary">
            {detail}
          </Typography>
          {!unavailable && <UsageBar percent={usagePercent} target={target} />}
          {target !== undefined && (
            <Typography variant="caption" color="text.secondary">
              Autoscaling target {target}%
            </Typography>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

interface ResourceUsageCardsProps {
  usage: CalculatedUsage;
  /** True when there's no usage source at all (cloud, componentLevelMetrics absent) — "0 used" would misreport an unknown as a confirmed zero. */
  usageUnavailable?: boolean;
  /** Shows each card's utilization as a percentage beside its title. */
  showPercent?: boolean;
  /** Replaces the utilization derived from `usage` for a resource, in both the figure and the bar. */
  readings?: { cpu?: UsageReading; memory?: UsageReading };
}

export default function ResourceUsageCards({ usage, usageUnavailable, showPercent, readings }: ResourceUsageCardsProps): JSX.Element {
  const cpu = readings?.cpu;
  const memory = readings?.memory;
  return (
    <Grid container spacing={3}>
      <Grid size={{ xs: 12, md: 6 }}>
        <UsageCard
          title="CPU Usage"
          detail={usageUnavailable ? `${formatVcpu(usage.cpu.limits)} vCPU allocated` : `${formatVcpu(usage.cpu.used)} of ${formatVcpu(usage.cpu.limits)} total allocated vCPU used`}
          usagePercent={cpu?.percent ?? usage.cpu.usagePercent}
          // A reading is itself a usage source, so the card has a figure to show without the aggregate.
          unavailable={usageUnavailable && !cpu}
          showPercent={showPercent}
          target={cpu?.target}
        />
      </Grid>
      <Grid size={{ xs: 12, md: 6 }}>
        <UsageCard
          title="Memory Usage"
          detail={usageUnavailable ? `${formatBytes(usage.memory.limits)} allocated` : `${formatBytes(usage.memory.used)} of ${formatBytes(usage.memory.limits)} total allocated memory used`}
          usagePercent={memory?.percent ?? usage.memory.usagePercent}
          unavailable={usageUnavailable && !memory}
          showPercent={showPercent}
          target={memory?.target}
        />
      </Grid>
    </Grid>
  );
}
