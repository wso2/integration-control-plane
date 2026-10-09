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

import { Alert, Box, Chip, Stack, Typography } from '@wso2/oxygen-ui';
import type { JSX } from 'react';
import { API_CHART } from '../../../constants/insights';
import type { HeatmapData } from '../../../types/insights';

// Per-status-code list with proxy/target split — replaces a 2-row heatmap
// that rendered as a cramped strip of squares with clipped row labels.
// Each bar shows the code's proxy-vs-target share (full-width 100% split),
// not its magnitude relative to other codes.
export default function StatusCodeBars({ heatmap }: { heatmap: HeatmapData }): JSX.Element {
  const proxyRow = heatmap.rows.indexOf('Proxy');
  const targetRow = heatmap.rows.indexOf('Target');
  const codes = heatmap.cols
    .map((code, ci) => {
      const at = (ri: number) => heatmap.cells.find((c) => c.row === ri && c.col === ci)?.value ?? 0;
      return { code, proxy: at(proxyRow), target: at(targetRow) };
    })
    .filter((c) => c.code.trim().toLowerCase() !== 'total' && c.proxy + c.target > 0);
  if (codes.length === 0) return <Alert severity="info">No errors in range.</Alert>;
  return (
    <Stack gap={1.5} sx={{ mt: 0.5 }}>
      <Stack direction="row" gap={2}>
        {[
          { label: 'Proxy', color: API_CHART.errors },
          { label: 'Target', color: API_CHART.target },
        ].map((l) => (
          <Stack key={l.label} direction="row" alignItems="center" gap={0.75}>
            <Box sx={{ width: 10, height: 10, borderRadius: '3px', bgcolor: l.color }} />
            <Typography variant="caption" color="text.secondary">
              {l.label}
            </Typography>
          </Stack>
        ))}
      </Stack>
      {codes.map((c) => (
        <Stack key={c.code} direction="row" alignItems="center" gap={1.5}>
          <Chip size="small" variant="outlined" color={c.code.trim().startsWith('5') ? 'error' : 'warning'} label={c.code} sx={{ width: 60, fontFamily: 'monospace' }} />
          <Box sx={{ flex: 1, height: 9, borderRadius: '5px', overflow: 'hidden', display: 'flex' }}>
            <Box sx={{ height: '100%', width: `${(c.proxy / (c.proxy + c.target)) * 100}%`, bgcolor: API_CHART.errors }} />
            <Box sx={{ height: '100%', width: `${(c.target / (c.proxy + c.target)) * 100}%`, bgcolor: API_CHART.target }} />
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ width: 170, textAlign: 'right', flexShrink: 0 }}>
            Proxy {c.proxy.toLocaleString()} · Target {c.target.toLocaleString()}
          </Typography>
        </Stack>
      ))}
    </Stack>
  );
}
