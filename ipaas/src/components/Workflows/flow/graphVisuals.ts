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

import type { Theme } from '@wso2/oxygen-ui';
import { Database, GitBranch, ListChecks, Timer, UserCheck, Workflow } from '@wso2/oxygen-ui-icons-react';
import type { ComponentType } from 'react';
import type { WorkflowStatus } from '../api/types';
import { WORKFLOW_STATUS_LABEL } from '../shared/workflowStatus';

/**
 * The visual vocabulary the flow rail and the Gantt timeline share: one icon per node kind, and
 * the handful of theme colours the hand-drawn SVG paints with.
 *
 * This is the single point where the diagram's visuals meet the console's theme. Colours are
 * read through `theme.vars`, so the diagram follows the active colour scheme (light or dark); they
 * are CSS values (`var(...)` under the console's theme), so tints are mixed with `color-mix` rather
 * than `alpha()`, which cannot parse a variable. Status colours are deliberately NOT redefined here:
 * `shared/workflowStepStatus` already owns that mapping for both the chips and the rail.
 *
 * Keep the flow components reading from here rather than inventing their own bridge, or the
 * translation ends up duplicated once per file.
 */

export type IconComponent = ComponentType<{ size?: number }>;

const ICON_BY_TYPE: Record<string, IconComponent> = {
  WORKFLOW: Workflow,
  CHILD_WORKFLOW: GitBranch,
  ACTIVITY: ListChecks,
  HUMAN_TASK: UserCheck,
  REVIEW_ACTIVITY: UserCheck,
  SIGNAL: Database,
  DATA: Database,
  TIMER: Timer,
};

/** Icon for a node or span kind, falling back to the generic activity glyph. */
export function iconForType(type: string): IconComponent {
  return ICON_BY_TYPE[(type ?? '').toUpperCase()] ?? ListChecks;
}

/** The label of each node or span kind the engine reports. */
const KIND_LABEL: Record<string, string> = {
  WORKFLOW: 'Workflow',
  CHILD_WORKFLOW: 'Child Workflow',
  ACTIVITY: 'Activity',
  HUMAN_TASK: 'Human Task',
  REVIEW_ACTIVITY: 'Review Activity',
  SIGNAL: 'Signal',
  DATA: 'Data',
  TIMER: 'Timer',
};

/**
 * A kind or status as a label: `HUMAN_TASK` -> `Human Task`, `TIMED_OUT` -> `Timed Out`. Known
 * kinds and statuses are named; anything else the engine reports is humanized from its key.
 */
export function typeLabel(type: string): string {
  const key = (type ?? '').toUpperCase();
  if (Object.prototype.hasOwnProperty.call(KIND_LABEL, key)) {
    return KIND_LABEL[key];
  }
  if (Object.prototype.hasOwnProperty.call(WORKFLOW_STATUS_LABEL, key)) {
    return WORKFLOW_STATUS_LABEL[key as WorkflowStatus];
  }
  return key
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export interface DiagramColors {
  paper: string;
  textPrimary: string;
  textSecondary: string;
  textDisabled: string;
  divider: string;
  primary: string;
}

/** The colours the diagrams paint with, in the active colour scheme. */
export function diagramColors(theme: Theme): DiagramColors {
  const { palette } = theme.vars ?? theme;
  return {
    paper: palette.background.paper,
    textPrimary: palette.text.primary,
    textSecondary: palette.text.secondary,
    textDisabled: palette.text.disabled,
    divider: palette.divider,
    primary: palette.primary.main,
  };
}

/** `color` at `opacity` (0 to 1) over transparent: a tint that works on a `var(...)` colour too. */
export function tint(color: string, opacity: number): string {
  return `color-mix(in srgb, ${color} ${Math.round(opacity * 100)}%, transparent)`;
}

/** A translucent primary, for selection fills and taken-arm tints. */
export function softPrimary(theme: Theme, opacity: number): string {
  return tint((theme.vars ?? theme).palette.primary.main, opacity);
}
