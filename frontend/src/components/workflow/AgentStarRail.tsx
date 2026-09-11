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

import { Box, useTheme } from '@wso2/oxygen-ui';
import { useMemo, type ReactElement } from 'react';
import type { InstanceGraph, ModelGraphNode } from '../../api/workflows';
import { diagramColors, paletteColor, softPrimary, statusColorName } from './graphVisuals';

// The agent's star: inbound channels (events, human tasks) on the left, the agent centre, capabilities on the right.

const clip = (text: string, maxChars: number): string => (text.length <= maxChars ? text : `${text.slice(0, Math.max(1, maxChars - 1))}…`);

const NODE_W = 132;
const NODE_H = 34;
const V_GAP = 12;
const COL_GAP = 44;
const PAD = 14;

interface Placed {
  node: ModelGraphNode;
  x: number;
  y: number;
}

export default function AgentStarRail({ data, selectedStepId, onSelect }: { data: InstanceGraph; selectedStepId: string | null; onSelect: (stepId: string | null) => void }): ReactElement | null {
  const theme = useTheme();
  const c = diagramColors(theme);
  const graph = data.graph;

  const layout = useMemo(() => {
    const nodes = graph?.nodes ?? [];
    const agent = nodes.find((n) => n.kind.toUpperCase() === 'AGENT');
    if (!agent) return null;
    const inbound = nodes.filter((n) => ['EVENT', 'HUMAN_TASK'].includes(n.kind.toUpperCase()));
    const outbound = nodes.filter((n) => ['MODEL', 'TOOL'].includes(n.kind.toUpperCase()));
    const rows = Math.max(inbound.length, outbound.length, 1);
    const height = PAD * 2 + rows * NODE_H + (rows - 1) * V_GAP;
    const width = PAD * 2 + NODE_W * 3 + COL_GAP * 2;
    const columnYs = (count: number): number[] => {
      const columnHeight = count * NODE_H + (count - 1) * V_GAP;
      const top = (height - columnHeight) / 2;
      return Array.from({ length: count }, (_, i) => top + i * (NODE_H + V_GAP));
    };
    const inYs = columnYs(inbound.length);
    const outYs = columnYs(outbound.length);
    const placed: Placed[] = [{ node: agent, x: PAD + NODE_W + COL_GAP, y: height / 2 - NODE_H / 2 }, ...inbound.map((n, i) => ({ node: n, x: PAD, y: inYs[i] })), ...outbound.map((n, i) => ({ node: n, x: PAD + (NODE_W + COL_GAP) * 2, y: outYs[i] }))];
    return { placed, width, height, agent };
  }, [graph]);

  if (!layout) return null;
  const accent = c.primary;
  const agentBox = layout.placed[0];

  return (
    <Box sx={{ overflow: 'auto', height: '100%', px: 0.5 }}>
      <svg width={layout.width} height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`} role="img" aria-label={`Agent ${data.workflowType}`} style={{ display: 'block', margin: '0 auto' }}>
        {layout.placed.slice(1).map((p) => {
          const inbound = p.x < agentBox.x;
          const x1 = inbound ? p.x + NODE_W : agentBox.x + NODE_W;
          const x2 = inbound ? agentBox.x : p.x;
          const y1 = p.y + NODE_H / 2;
          const y2 = agentBox.y + NODE_H / 2;
          return (
            <path
              key={`e-${p.node.stepId}`}
              d={`M ${inbound ? x1 : agentBox.x + NODE_W} ${inbound ? y1 : y2} C ${(x1 + x2) / 2} ${inbound ? y1 : y2}, ${(x1 + x2) / 2} ${inbound ? y2 : y1}, ${inbound ? x2 : x2} ${inbound ? y2 : y1}`}
              fill="none"
              stroke={c.divider}
              strokeWidth={1.25}
            />
          );
        })}
        {layout.placed.map((p) => {
          const kind = p.node.kind.toUpperCase();
          const isAgent = kind === 'AGENT';
          const selected = selectedStepId === p.node.stepId;
          const title = p.node.target ?? p.node.stepId.replace(/^(tool|event|task):/, '');
          const exec = data.steps?.[p.node.stepId];
          const statusColor = exec ? paletteColor(theme, statusColorName(exec.status)) : null;
          return (
            <g
              key={p.node.stepId}
              role="button"
              tabIndex={0}
              aria-label={p.node.stepId}
              onClick={() => onSelect(selected ? null : p.node.stepId)}
              onKeyDown={(e) => ((e as unknown as { key: string }).key === 'Enter' ? onSelect(selected ? null : p.node.stepId) : undefined)}
              style={{ cursor: 'pointer' }}>
              <rect
                x={p.x}
                y={p.y}
                width={NODE_W}
                height={NODE_H}
                rx={isAgent ? NODE_H / 2 : 6}
                // softPrimary, not alpha(): the accent is a var() string that alpha() cannot parse.
                fill={selected ? softPrimary(theme, 0.12) : isAgent ? softPrimary(theme, 0.08) : c.paper}
                stroke={selected ? accent : isAgent ? accent : (statusColor ?? c.divider)}
                strokeWidth={selected ? 1.75 : statusColor ? 1.5 : 1}
              />
              <text x={p.x + NODE_W / 2} y={p.y + 15} fill={exec || isAgent ? c.textPrimary : c.textDisabled} fontSize={10.5} fontWeight={600} textAnchor="middle">
                {clip(title, 20)}
              </text>
              <text x={p.x + NODE_W / 2} y={p.y + 27} fill={c.textDisabled} fontSize={8.5} textAnchor="middle" style={{ letterSpacing: 0.4, textTransform: 'uppercase' }}>
                {kind.toLowerCase()}
              </text>
              {exec && exec.count > 1 && (
                <text x={p.x + NODE_W - 4} y={p.y + 11} fill={statusColor ?? c.textSecondary} fontSize={8.5} fontWeight={700} textAnchor="end">
                  ×{exec.count}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </Box>
  );
}
