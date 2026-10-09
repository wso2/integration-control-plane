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

import { Alert, Box, Divider, Skeleton, Stack, Typography } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import { InsightsCard } from './shared';
import type { ProjectLatencyRow } from '../../../types/insights';

/** Latency & duration summary — one block per service sub-type (Integrations as
 * API / AI Agents / MCP Servers / Webhooks) plus Automations, divided by rules.
 * Type title aligns with its value on the top line; the "Response time" sub and
 * the "Avg latency" metric label sit beneath, parallel to each other. */
export function LatencyDuration({ rows, loading = false }: { rows: ProjectLatencyRow[]; loading?: boolean }): JSX.Element {
  return (
    <InsightsCard title="Latency & duration" subtitle="Services & automations">
      {loading ? (
        <Skeleton variant="rounded" height={120} />
      ) : rows.length === 0 ? (
        <Alert severity="info">No latency data in this period.</Alert>
      ) : (
        <Stack gap={2} divider={<Divider flexItem />}>
          {rows.map((r) => (
            <Stack key={r.key} direction="row" alignItems="flex-start" justifyContent="space-between" gap={2}>
              <Stack direction="row" alignItems="flex-start" gap={1} sx={{ minWidth: 0 }}>
                <Box sx={{ width: 8, height: 8, borderRadius: '2px', bgcolor: r.color, flexShrink: 0, mt: '5px' }} />
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {r.label}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    {r.sub}
                  </Typography>
                </Box>
              </Stack>
              <Stack direction="row" gap={3} flexShrink={0}>
                {r.metrics.map((m) => (
                  <Box key={m.label} sx={{ textAlign: 'right' }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                      {m.value}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textTransform: 'uppercase', letterSpacing: '.3px' }}>
                      {m.label}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            </Stack>
          ))}
        </Stack>
      )}
    </InsightsCard>
  );
}
