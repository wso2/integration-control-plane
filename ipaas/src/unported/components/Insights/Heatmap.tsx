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

import { Box, Typography, useTheme } from '@wso2/oxygen-ui';
import { type JSX } from 'react';
import type { HeatmapData } from '../../../types/insights';

interface HeatmapProps {
  data: HeatmapData;
  /** Base color; cell opacity is scaled by value/max. */
  color: string;
  cellWidth?: number;
  cellHeight?: number;
  /** Only render every Nth column label (dense axes, e.g. 24 hours). */
  everyCol?: number;
}

/**
 * Minimal 2D heatmap — `@wso2/oxygen-ui-charts-react` has no heatmap chart
 * type, so this is a small self-contained SVG, in the same spirit as the
 * source design's own hand-rolled `mkHeat`.
 */
export default function Heatmap({ data, color, cellWidth = 40, cellHeight = 40, everyCol }: HeatmapProps): JSX.Element {
  const theme = useTheme();
  const dark = theme.palette.mode === 'dark';
  const axisColor = dark ? 'rgba(234, 235, 243, 0.55)' : 'rgba(29, 29, 33, 0.55)';
  const { rows, cols, cells, max } = data;

  if (rows.length === 0 || cols.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
        No data in range
      </Typography>
    );
  }

  const gap = 3;
  const lx = 34;
  const ty = 6;
  const w = lx + cols.length * (cellWidth + gap);
  const H = ty + 18 + rows.length * (cellHeight + gap) + 4;
  const valueByCell = new Map(cells.map((c) => [`${c.row}_${c.col}`, c.value]));

  return (
    <Box sx={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${w} ${H}`} width="100%" height="auto" preserveAspectRatio="xMinYMin meet" style={{ display: 'block', maxWidth: w }}>
        {cols.map((c, ci) =>
          !everyCol || ci % everyCol === 0 ? (
            <text key={`c${ci}`} x={lx + ci * (cellWidth + gap) + cellWidth / 2} y={ty + 11} textAnchor="middle" fontSize={15} fill={axisColor}>
              {c}
            </text>
          ) : null,
        )}
        {rows.map((r, ri) => (
          <g key={`r${ri}`}>
            <text x={lx - 6} y={ty + 18 + ri * (cellHeight + gap) + cellHeight / 2 + 3} textAnchor="end" fontSize={14} fill={axisColor}>
              {r}
            </text>
            {cols.map((_, ci) => {
              const v = valueByCell.get(`${ri}_${ci}`) ?? 0;
              const opacity = v === 0 ? (dark ? 0.04 : 0.05) : 0.18 + 0.82 * (v / Math.max(1, max));
              return (
                <rect key={`${ri}_${ci}`} x={lx + ci * (cellWidth + gap)} y={ty + 18 + ri * (cellHeight + gap)} width={cellWidth} height={cellHeight} rx={3} fill={color} opacity={opacity}>
                  {v > 0 && <title>{v}</title>}
                </rect>
              );
            })}
          </g>
        ))}
      </svg>
    </Box>
  );
}
