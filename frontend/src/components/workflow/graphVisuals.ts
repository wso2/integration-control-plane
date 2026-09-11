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

// Visual mappings shared by the execution-graph (node-link) and timeline (Gantt) views:
// an icon per node/span kind and status→palette-colour resolution. Kept in its own module
// (no component exports) so both views reuse them without tripping React Fast Refresh.

import { alpha, type Theme } from '@wso2/oxygen-ui';
import { CircleDot, Database, GitBranch, SquareCheck, Timer, UserCheck, Workflow } from '@wso2/oxygen-ui-icons-react';
import type { ComponentType } from 'react';
import { humanizeKey, STATUS_COLORS, type ChipColor } from './helpers';

const iconByType: Record<string, ComponentType<{ size?: number }>> = {
  WORKFLOW: Workflow, // orchestration root
  CHILD_WORKFLOW: GitBranch, // a spawned sub-workflow
  ACTIVITY: SquareCheck, // a task/step (☑ checked box)
  HUMAN_TASK: UserCheck, // a person completing/approving
  SIGNAL: Database, // an external signal carrying data
  TIMER: Timer, // a durable timer
};

// Icon component for a node/span kind (e.g. ACTIVITY, HUMAN_TASK), falling back to a generic dot.
export const iconForType = (type: string): ComponentType<{ size?: number }> => iconByType[type.toUpperCase()] ?? CircleDot;

// Human-readable label for a node/span kind, e.g. `HUMAN_TASK` → `Human Task`.
export const typeLabel = (type: string): string => humanizeKey(type.toLowerCase());

// Maps a status to its Oxygen chip colour name (e.g. COMPLETED → success).
export const statusColorName = (status?: string): ChipColor => STATUS_COLORS[(status ?? '').toUpperCase()] ?? 'default';

type VarsTheme = Theme & { vars?: { palette?: Record<string, Record<string, string>> } };

const paletteVars = (theme: Theme): Record<string, Record<string, string>> | undefined => (theme as VarsTheme).vars?.palette;

export function diagramColors(theme: Theme): {
  paper: string;
  textPrimary: string;
  textSecondary: string;
  textDisabled: string;
  divider: string;
  primary: string;
} {
  const v = paletteVars(theme);
  return {
    paper: v?.background?.paper ?? theme.palette.background.paper,
    textPrimary: v?.text?.primary ?? theme.palette.text.primary,
    textSecondary: v?.text?.secondary ?? theme.palette.text.secondary,
    textDisabled: v?.text?.disabled ?? theme.palette.text.disabled,
    divider: v?.divider?.toString() ?? theme.palette.divider,
    primary: v?.primary?.main ?? theme.palette.primary.main,
  };
}

// `alpha()` parses a colour, so it cannot be handed `var(--oxygen-palette-primary-main)`; use the channel instead.
export function softPrimary(theme: Theme, opacity: number): string {
  const channel = paletteVars(theme)?.primary?.mainChannel;
  return channel ? `rgba(${channel} / ${opacity})` : alpha(theme.palette.primary.main, opacity);
}

// Resolves a chip colour name to a concrete palette colour usable in SVG strokes, borders, and bars.
export function paletteColor(theme: Theme, c: ChipColor): string {
  const v = paletteVars(theme);
  if (c === 'default') return v?.text?.disabled ?? theme.palette.text.disabled;
  if (c === 'primary') return v?.primary?.main ?? theme.palette.primary.main;
  return v?.[c]?.main ?? theme.palette[c].main;
}
