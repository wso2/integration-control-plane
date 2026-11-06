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

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkflowClient } from '../api/client';
import { WorkflowApiError } from '../api/http';
import type { HumanTaskInfo } from '../api/types';
import type { ReadyWorkflowApi } from '../api/useWorkflowApi';
import { buttonOf, byText, click, dialogTitled, fieldsWithValue, findByText, flush, mount, queryByText, typeInto, unmount } from './testDom';
import TaskDetailDrawer from './TaskDetailDrawer';
import type { WorkItem } from './workItem';

// The drawer is recorded rather than portalled: what it is told (open, maximized) is the contract.
const drawer = vi.hoisted(() => ({ calls: [] as Array<{ open: boolean; expanded?: boolean }> }));
vi.mock('@wso2/oxygen-ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@wso2/oxygen-ui')>();
  const Pass = ({ children }: { children?: ReactNode }) => <>{children}</>;
  const DrawerPanel = Object.assign(
    ({ open, expanded, children }: { open: boolean; expanded?: boolean; children?: ReactNode }) => {
      drawer.calls.push({ open, expanded });
      return open ? <div>{children}</div> : null;
    },
    { Header: Pass, Title: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>, Actions: Pass, ExpandButton: () => null, CloseButton: () => null, Body: Pass, Footer: Pass },
  );
  return { ...actual, DrawerPanel };
});

const TASK: HumanTaskInfo = {
  taskId: 'humantask-1',
  taskName: 'orderWorkflow.approveOrder',
  title: 'Approve order',
  description: 'Check the order before it ships.',
  parentWorkflowId: 'workflow-0193f2a1-0000-7000-8000-00000000abcd',
  parentWorkflowType: 'orderWorkflow',
  status: 'PENDING',
  startTime: '2026-10-01T10:00:00Z',
  closeTime: null,
  createdAt: '2026-10-01T10:00:00Z',
  userRoles: ['approver'],
  administratorRoles: ['ops'],
  completedBy: null,
  completedAt: null,
  canComplete: true,
  canAdminister: false,
  taskInput: { customerName: 'Jane Doe', amount: 120 },
  formSchema: JSON.stringify({
    type: 'object',
    properties: { approved: { type: 'boolean' }, note: { type: 'string' } },
    required: ['approved'],
  }),
  result: null,
};

const ITEM: WorkItem = {
  kind: 'task',
  taskId: TASK.taskId,
  title: TASK.title,
  name: TASK.taskName,
  parentWorkflowId: TASK.parentWorkflowId,
  parentWorkflowType: TASK.parentWorkflowType,
  status: 'PENDING',
  startTime: TASK.startTime,
  closeTime: null,
  userRoles: TASK.userRoles,
};

async function renderDrawer(task: HumanTaskInfo, overrides: { complete?: () => Promise<unknown> } = {}) {
  const humanTasks = {
    get: vi.fn().mockResolvedValue(task),
    complete: vi.fn(overrides.complete ?? (() => Promise.resolve({ success: true }))),
    fail: vi.fn().mockResolvedValue({ success: true }),
  };
  const client = { humanTasks } as unknown as WorkflowClient;
  const api = { client, connection: { status: 'ready', client, scopeId: 'scope', runtime: { taskQueue: null }, renewCredential: vi.fn() } } as unknown as ReadyWorkflowApi;
  const props = { onOpenWorkflow: vi.fn(), onNotify: vi.fn(), onClose: vi.fn() };
  await mount(
    <QueryClientProvider client={new QueryClient()}>
      <TaskDetailDrawer item={ITEM} api={api} {...props} />
    </QueryClientProvider>,
  );
  await findByText('Task Name');
  return { humanTasks, ...props };
}

afterEach(async () => {
  await unmount();
  drawer.calls.splice(0);
});

describe('TaskDetailDrawer', () => {
  it('opens maximized, like the execution view', async () => {
    await renderDrawer(TASK);
    expect(byText('Task Details')).toBeTruthy();
    expect(drawer.calls.at(-1)).toEqual({ open: true, expanded: true });
  });

  it('shows the task input as labelled rows, not as JSON', async () => {
    await renderDrawer(TASK);
    expect(byText('Task Input')).toBeTruthy();
    expect(byText('Customer Name')).toBeTruthy();
    expect(byText('Jane Doe')).toBeTruthy();
    expect(byText('Read-only')).toBeTruthy();
    expect(queryByText(/"customerName"/)).toBeNull();
  });

  it('offers the Administer card only to an administrator', async () => {
    await renderDrawer(TASK);
    expect(byText('Complete Task')).toBeTruthy();
    expect(queryByText('Administer')).toBeNull();

    await unmount();
    await renderDrawer({ ...TASK, canAdminister: true });
    expect(byText('Administer')).toBeTruthy();
    expect(byText('Reassign')).toBeTruthy();
    expect(byText('Change Deadline')).toBeTruthy();
  });

  it('completes through the task form, after confirming the exact result', async () => {
    const { humanTasks, onNotify, onClose } = await renderDrawer(TASK);
    await click(buttonOf('Complete Task'));
    await click(buttonOf('Review before completion'));
    // `approved` is required and a boolean the form has not been given, so nothing is staged.
    expect(byText('Approved is required.')).toBeTruthy();

    await click(buttonOf('Yes'));
    await click(buttonOf('Review before completion'));
    const confirm = dialogTitled('Confirm Completion');

    await click(buttonOf('Complete Task', confirm));
    expect(humanTasks.complete).toHaveBeenCalledWith('humantask-1', { approved: true });
    expect(onNotify).toHaveBeenCalledWith({ message: 'Task completed.', severity: 'success' });
    expect(onClose).toHaveBeenCalled();
  });

  it('gives a task typed `string` a form, and completes it with the bare value', async () => {
    const { humanTasks } = await renderDrawer({ ...TASK, formSchema: JSON.stringify({ type: 'string' }) });
    await click(buttonOf('Complete Task'));
    // Required, as a bare value always is.
    expect(byText(/^Result\s*\*/)).toBeTruthy();
    // The result field is the only text box until raw mode opens.
    const [field] = document.body.querySelectorAll('textarea:not([aria-hidden])');
    await typeInto(field, 'approved');

    // Raw mode holds the value itself, not an object around it.
    await click(buttonOf('Edit as JSON'));
    expect(fieldsWithValue('"approved"')).toHaveLength(1);
    await click(buttonOf('Back to form'));

    await click(buttonOf('Review before completion'));
    await click(buttonOf('Complete Task', dialogTitled('Confirm Completion')));
    expect(humanTasks.complete).toHaveBeenCalledWith('humantask-1', 'approved');
  });

  it('keeps the completion offered but disabled when the caller cannot complete the task', async () => {
    await renderDrawer({ ...TASK, canComplete: false });
    expect(buttonOf('Complete Task').disabled).toBe(true);
    // Failing stays with an administrator only.
    expect(buttonOf('Mark as Failed').disabled).toBe(true);
  });

  it('shows the engine’s refusal in the drawer', async () => {
    await renderDrawer(TASK, { complete: () => Promise.reject(new WorkflowApiError('ACCESS_DENIED', 403, 'You are not in this task’s audience.', 'POST x')) });
    await click(buttonOf('Complete Task'));
    await click(buttonOf('Yes'));
    await click(buttonOf('Review before completion'));
    await click(buttonOf('Complete Task', dialogTitled('Confirm Completion')));
    await flush();
    expect(byText('You are not in this task’s audience.')).toBeTruthy();
  });

  it('opens the parent workflow from its id', async () => {
    const { onOpenWorkflow } = await renderDrawer(TASK);
    const link = document.body.querySelector(`[title="${TASK.parentWorkflowId}"]`);
    if (!link) throw new Error('expected the parent workflow link');
    await click(link);
    expect(onOpenWorkflow).toHaveBeenCalledWith(TASK.parentWorkflowId);
  });
});
