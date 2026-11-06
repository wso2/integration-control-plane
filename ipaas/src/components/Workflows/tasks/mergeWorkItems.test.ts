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
import { filterWorkItems, mergeWorkItems } from './mergeWorkItems';
import type { WorkItem } from './workItem';

function item(patch: Partial<WorkItem>): WorkItem {
  return {
    kind: 'task',
    taskId: 't',
    title: 'Approve order',
    name: 'approveOrder',
    parentWorkflowId: 'order-1',
    parentWorkflowType: 'OrderFlow',
    status: 'PENDING',
    startTime: '2026-10-01T00:00:00Z',
    closeTime: null,
    userRoles: [],
    ...patch,
  };
}

describe('mergeWorkItems', () => {
  it('interleaves tasks and reviews newest first', () => {
    const merged = mergeWorkItems([item({ taskId: 'task-old', startTime: '2026-10-01T00:00:00Z' })], [item({ kind: 'review', taskId: 'review-new', startTime: '2026-10-02T00:00:00Z' })]);
    expect(merged.map((i) => i.taskId)).toEqual(['review-new', 'task-old']);
  });
});

describe('filterWorkItems', () => {
  const items = [
    item({ taskId: 'order-task', parentWorkflowType: 'OrderFlow' }),
    item({ kind: 'review', taskId: 'refund-review', parentWorkflowType: 'RefundFlow' }),
    // A runtime before workflow 0.10 reports no parent type for a review.
    item({ kind: 'review', taskId: 'untyped-review', parentWorkflowType: null }),
  ];

  it('keeps the named definition, and items whose definition is unknown', () => {
    expect(filterWorkItems(items, { type: '', search: '', workflowType: 'OrderFlow' }).map((i) => i.taskId)).toEqual(['order-task', 'untyped-review']);
  });

  it('keeps every definition when none is named', () => {
    expect(filterWorkItems(items, { type: '', search: '' })).toHaveLength(3);
  });

  it('combines the definition with the kind and the search', () => {
    expect(filterWorkItems(items, { type: 'review', search: 'refund', workflowType: 'RefundFlow' }).map((i) => i.taskId)).toEqual(['refund-review']);
  });
});
