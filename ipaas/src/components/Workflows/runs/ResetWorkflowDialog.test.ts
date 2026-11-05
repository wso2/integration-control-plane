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

import { describe, expect, it } from 'vitest';
import type { ResetPoint } from '../api/types';
import { resetPointLabel } from './ResetWorkflowDialog';

const point = (eventId: number, nodeNames: string[]): ResetPoint => ({
  eventId,
  eventType: 'WORKFLOW_TASK_COMPLETED',
  timestamp: '2026-09-28T10:00:00Z',
  nodeIds: [],
  nodeNames,
  isFirstFailure: false,
});

describe('resetPointLabel', () => {
  const points = [point(3, []), point(9, ['orderWorkflow.reserveStock']), point(12, []), point(15, ['orderWorkflow.ship', 'notify'])];

  it('names a point by the steps it follows, without the workflow qualifier', () => {
    expect(resetPointLabel(points, 1)).toBe('reserveStock');
    expect(resetPointLabel(points, 3)).toBe('ship, notify');
  });

  it('places an unnamed point by the start or the nearest named one before it', () => {
    expect(resetPointLabel(points, 0)).toBe('Start of the run');
    expect(resetPointLabel(points, 2)).toBe('After reserveStock');
  });

  it('falls back to its position when nothing before it is named', () => {
    expect(resetPointLabel([point(1, []), point(2, [])], 1)).toBe('Checkpoint 2 of 2');
  });

  it('never names a Temporal event type', () => {
    points.forEach((_, i) => expect(resetPointLabel(points, i)).not.toMatch(/WORKFLOW_TASK/));
  });
});
