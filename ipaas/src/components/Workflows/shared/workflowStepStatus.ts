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
import type { WorkflowStatus } from '../api/types';
import { WORKFLOW_STATUS_CHIP_COLOR, WORKFLOW_STATUS_LABEL, type RowStatus, type StatusChipColor } from './workflowStatus';

/**
 * Step-level execution status vocabulary: the run statuses plus two that only a step carries.
 * `PENDING` is the status of every waiting human task and review, and `WAITING` marks an activity
 * tree node blocked on a data event. The run-level map in `workflowStatus.ts` is an exhaustive
 * Record over the narrower `WorkflowStatus` union, so it is spread here rather than widened.
 */
export type WorkflowStepStatus = WorkflowStatus | 'PENDING' | 'WAITING';

const CHIP_COLOR_BY_STATUS: Record<WorkflowStepStatus, StatusChipColor> = {
  ...WORKFLOW_STATUS_CHIP_COLOR,
  PENDING: 'info',
  WAITING: 'info',
};

const LABEL_BY_STATUS: Record<WorkflowStepStatus, string> = {
  ...WORKFLOW_STATUS_LABEL,
  PENDING: 'Pending',
  WAITING: 'Waiting',
};

/**
 * A status as the Workflows page writes it (`Running`, `Timed Out`) for any task, review or step:
 * the run vocabulary's own labels where they apply, the same casing for the rest (`PENDING` reads
 * `Pending`).
 */
export function stepStatusLabel(status?: string): string {
  const key = (status ?? '').toUpperCase();
  if (key in LABEL_BY_STATUS) {
    return LABEL_BY_STATUS[key as WorkflowStepStatus];
  }
  if (!key) {
    return WORKFLOW_STATUS_LABEL.UNKNOWN;
  }
  // A status outside the vocabulary is the engine's own word, only re-cased.
  return key
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Falls back to 'default' for any status outside the known vocabulary, rather than
 * throwing on an unknown value.
 */
export function stepStatusChipColor(status?: string): StatusChipColor {
  const key = (status ?? '').toUpperCase() as WorkflowStepStatus;
  return CHIP_COLOR_BY_STATUS[key] ?? 'default';
}

/**
 * Status to row tint. The run-level map in `workflowStatus.ts` is keyed on the narrower run
 * vocabulary and has no `PENDING`, which is the status every waiting human task and review
 * carries. Only failures are tinted: a pending or running row is marked by its status chip.
 */
export function stepStatusRowStatus(status?: string): RowStatus {
  switch ((status ?? '').toUpperCase()) {
    case 'FAILED':
    case 'TERMINATED':
    case 'TIMED_OUT':
      return 'error';
    default:
      return undefined;
  }
}

/**
 * Resolves a chip colour name to an actual theme colour, for anywhere a dynamic per-step/per-span
 * value is needed (a rail row's border, a timeline bar's fill) rather than a chip.
 *
 * Read through `theme.vars`, which follows the active colour scheme: `theme.palette` holds the
 * default scheme's literal colours, so a dark page would get the light ones. Under the console's
 * theme the result is a `var(...)`, so tint it with `color-mix`, not `alpha()`.
 */
export function stepStatusPaletteColor(theme: Theme, color: StatusChipColor): string {
  const { palette } = theme.vars ?? theme;
  switch (color) {
    case 'success':
      return palette.success.main;
    case 'error':
      return palette.error.main;
    case 'warning':
      return palette.warning.main;
    case 'info':
      return palette.info.main;
    case 'primary':
      return palette.primary.main;
    default:
      return palette.text.disabled;
  }
}
