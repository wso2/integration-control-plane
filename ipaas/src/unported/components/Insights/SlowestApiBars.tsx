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

import { Box, Stack, Typography } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import { INSIGHTS_CHART_COLORS } from '../../../constants/insights';
import type { SlowestApiRow } from '../../../types/insights';

const NAME_SX = { width: 180, flexShrink: 0, fontFamily: 'monospace', color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as const;
const BAR_GRADIENT = `linear-gradient(90deg,${INSIGHTS_CHART_COLORS.orange} 0%,${INSIGHTS_CHART_COLORS.red} 100%)`;

export default function SlowestApiBars({ rows }: { rows: SlowestApiRow[] }): JSX.Element {
  if (rows.length === 0)
    return (
      <Typography variant="body2" color="text.secondary">
        No data in range
      </Typography>
    );
  const max = Math.max(...rows.map((r) => r.latencyMs), 1);
  return (
    <Stack gap={1.25} sx={{ mt: 0.5 }}>
      {rows.map((r) => (
        <Stack key={r.name} direction="row" alignItems="center" gap={1.5}>
          <Typography variant="caption" sx={NAME_SX}>
            {r.name}
          </Typography>
          <Box sx={{ flex: 1, height: 9, borderRadius: '5px', bgcolor: 'action.hover', overflow: 'hidden' }}>
            <Box sx={{ height: '100%', width: `${Math.round((r.latencyMs / max) * 100)}%`, borderRadius: '5px', background: BAR_GRADIENT }} />
          </Box>
          <Typography variant="caption" sx={{ width: 60, textAlign: 'right' }}>
            {r.latencyMs} ms
          </Typography>
        </Stack>
      ))}
    </Stack>
  );
}
