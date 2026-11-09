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

import type { ChipProps } from '@wso2/oxygen-ui';
import type { WorkflowStatus, WorkflowStatusFilter } from '../api/types';

/** The chip colour of a status, from the theme's palette: `info` is the running blue. */
export type StatusChipColor = NonNullable<ChipProps['color']>;

export const WORKFLOW_STATUS_CHIP_COLOR: Record<WorkflowStatus, StatusChipColor> = {
  RUNNING: 'info',
  COMPLETED: 'success',
  FAILED: 'error',
  TERMINATED: 'error',
  CANCELED: 'warning',
  SUSPENDED: 'warning',
  TIMED_OUT: 'warning',
  CONTINUED_AS_NEW: 'default',
  UNKNOWN: 'default',
};

/**
 * The tint a list row takes for its status. Only failures are tinted: a running row is marked by
 * its status chip, not by an outline the list should not carry.
 */
export type RowStatus = 'error' | undefined;

export const WORKFLOW_STATUS_ROW_STATUS: Record<WorkflowStatus, RowStatus> = {
  RUNNING: undefined,
  COMPLETED: undefined,
  FAILED: 'error',
  TERMINATED: 'error',
  CANCELED: undefined,
  SUSPENDED: undefined,
  TIMED_OUT: 'error',
  CONTINUED_AS_NEW: undefined,
  UNKNOWN: undefined,
};

export const WORKFLOW_STATUS_LABEL: Record<WorkflowStatus, string> = {
  RUNNING: 'Running',
  COMPLETED: 'Completed',
  FAILED: 'Failed',
  TERMINATED: 'Terminated',
  CANCELED: 'Canceled',
  SUSPENDED: 'Suspended',
  TIMED_OUT: 'Timed Out',
  CONTINUED_AS_NEW: 'Continued As New',
  UNKNOWN: 'Unknown',
};

/**
 * The statuses the engine actually accepts as a `status` filter. `CONTINUED_AS_NEW` and `UNKNOWN`
 * can come back on a row but are silently dropped as a filter clause, so offering them would look
 * like a filter that does nothing.
 */
export const WORKFLOW_STATUS_OPTIONS: WorkflowStatusFilter[] = ['RUNNING', 'SUSPENDED', 'COMPLETED', 'FAILED', 'TERMINATED', 'CANCELED', 'TIMED_OUT'];
