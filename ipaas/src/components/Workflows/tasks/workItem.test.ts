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

import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkflowApiError } from '../api/http';
import { clearSettling, isSettling } from '../api/settleRegistry';
import { actionErrorText, audienceSummary, countOf, isBulkSelectable, ownedHere, refreshParentRun, sameValue, taskCompleter, taskDisplayName, type WorkItem } from './workItem';

const review = (patch: Partial<WorkItem> = {}): WorkItem => ({
  kind: 'review',
  taskId: 'r-1',
  title: 'chargeCard',
  name: 'chargeCard',
  parentWorkflowId: 'wf-1',
  parentWorkflowType: 'InsuranceClaim',
  status: 'PENDING',
  startTime: '2026-10-02T10:00:00Z',
  closeTime: null,
  userRoles: [],
  ...patch,
});

describe('isBulkSelectable', () => {
  it('offers every pending review, whatever its trigger, and no human task', () => {
    expect(isBulkSelectable(review({ trigger: 'PRE_RUN' }))).toBe(true);
    expect(isBulkSelectable(review({ trigger: 'ON_FAILURE' }))).toBe(true);
    expect(isBulkSelectable(review({ status: 'COMPLETED' }))).toBe(false);
    expect(isBulkSelectable(review({ kind: 'task' }))).toBe(false);
  });
});

describe('ownedHere', () => {
  it('acts only on the queue this integration serves, taking an unnamed queue as its own', () => {
    expect(ownedHere('orders', 'orders')).toBe(true);
    expect(ownedHere('billing', 'orders')).toBe(false);
    expect(ownedHere(undefined, 'orders')).toBe(true);
    expect(ownedHere('billing', null)).toBe(true);
  });
});

describe('audienceSummary', () => {
  it('names the roles and users a task is open to, and who is excluded', () => {
    expect(audienceSummary({ userRoles: ['approver'] })).toBe('roles approver');
    expect(audienceSummary({ users: ['jane'] })).toBe('users jane');
    expect(audienceSummary({ userRoles: ['approver', 'ops'], users: ['jane'], excludedUsers: ['bob'] })).toBe('roles approver, ops or users jane, except users bob');
    expect(audienceSummary({ userRoles: ['approver'], excludedRoles: ['intern'], excludedUsers: ['bob'] })).toBe('roles approver, except roles intern and users bob');
  });

  it('says nothing when the task names no audience', () => {
    expect(audienceSummary({ userRoles: [], excludedUsers: ['bob'] })).toBeUndefined();
  });
});

describe('taskDisplayName and taskCompleter', () => {
  it('drops the workflow qualifier from a task name, preferring the title', () => {
    expect(taskDisplayName({ taskId: 't', taskName: 'orderWorkflow.approveOrder', parentWorkflowType: 'orderWorkflow' })).toBe('approveOrder');
    expect(taskDisplayName({ taskId: 't', title: 'Approve order', taskName: 'orderWorkflow.approveOrder' })).toBe('Approve order');
    expect(taskDisplayName({ taskId: 't' })).toBe('t');
  });

  it('reads the completer under either runtime’s names', () => {
    expect(taskCompleter({ completedBy: 'jane', completedAt: 'a' })).toEqual({ by: 'jane', at: 'a' });
    expect(taskCompleter({ decidedBy: 'bob', decidedAt: 'b' })).toEqual({ by: 'bob', at: 'b' });
  });

  it('counts a noun', () => {
    expect(countOf(1, 'review')).toBe('1 review');
    expect(countOf(3, 'review')).toBe('3 reviews');
  });
});

describe('sameValue', () => {
  it('compares JSON values deeply, whatever the order of their keys', () => {
    expect(sameValue({ a: 1, b: { c: [1, null] } }, { b: { c: [1, null] }, a: 1 })).toBe(true);
    expect(sameValue({ a: 1 }, { a: 1, b: undefined })).toBe(false);
    expect(sameValue({ a: null }, { a: 0 })).toBe(false);
    expect(sameValue([1, 2], { 0: 1, 1: 2 })).toBe(false);
    expect(sameValue('x', 'x')).toBe(true);
  });
});

describe('actionErrorText', () => {
  it('says what the engine said, and renews a refused credential', () => {
    const renewCredential = vi.fn();
    expect(actionErrorText({ renewCredential }, new WorkflowApiError('ACCESS_DENIED', 403, 'Not in the audience.', 'POST x'), 'Could not complete.')).toBe('Not in the audience.');
    expect(renewCredential).not.toHaveBeenCalled();
    actionErrorText({ renewCredential }, new WorkflowApiError('GATEWAY_REJECTED', 401, null, 'POST x'), 'Could not complete.');
    expect(renewCredential).toHaveBeenCalledTimes(1);
    expect(actionErrorText({ renewCredential }, 'boom', 'Could not complete.')).toBe('Could not complete.');
  });
});

describe('refreshParentRun', () => {
  afterEach(() => clearSettling());

  it('marks the parent run settling and invalidates its reads across runs', () => {
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    refreshParentRun(client, 'scope', 'wf-1');
    expect(isSettling('wf-1')).toBe(true);
    const keys = invalidate.mock.calls.map(([filters]) => (filters as { queryKey: unknown[] }).queryKey);
    expect(keys).toContainEqual(['wf', 'scope', 'instances']);
    expect(keys).toContainEqual(['wf', 'scope', 'instance', 'wf-1']);
    expect(keys).toContainEqual(['wf', 'scope', 'history', 'wf-1']);
  });
});
