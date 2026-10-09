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

import { Alert, Box, Chip, Skeleton, Stack, Tooltip, Typography } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import { ColorDot, InsightsCard } from './shared';
import { DEPLOYMENT_STATUS_CHIP, KIND_DOT } from '../../../constants/insights';
import { truncate } from '../../../utils/string';
import { formatDeployTime } from '../../utils/insightsFormat';
import type { RecentDeployment } from '../../../types/deployment';

/** Recent deployments feed — newest first, per the selected environment. */
export function RecentDeployments({ items, envName, loading = false }: { items: RecentDeployment[]; envName: string; loading?: boolean }): JSX.Element {
  return (
    <InsightsCard title="Recent deployments" subtitle={`Latest in ${envName}`}>
      {loading ? (
        <Skeleton variant="rounded" height={120} />
      ) : items.length === 0 ? (
        <Alert severity="info">No recent deployments.</Alert>
      ) : (
        <Stack gap={1.5}>
          {items.map((d) => {
            const s = DEPLOYMENT_STATUS_CHIP[d.status] ?? DEPLOYMENT_STATUS_CHIP.UNKNOWN;
            return (
              <Box key={d.id}>
                <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap" sx={{ minWidth: 0 }}>
                  <ColorDot color={KIND_DOT[d.kind]} size={8} />
                  <Tooltip title={d.name}>
                    <Typography variant="body2" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {truncate(d.name, 32)}
                    </Typography>
                  </Tooltip>
                  <Chip size="small" variant="outlined" label={s.label} color={s.color === 'default' ? undefined : s.color} />
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                  {d.version ? `${d.version} · ` : ''}
                  {formatDeployTime(d.deployedAt)}
                </Typography>
              </Box>
            );
          })}
        </Stack>
      )}
    </InsightsCard>
  );
}
