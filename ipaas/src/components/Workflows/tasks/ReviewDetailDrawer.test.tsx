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
import type { ReviewActivityInfo } from '../api/types';
import type { ReadyWorkflowApi } from '../api/useWorkflowApi';
import ReviewDetailDrawer from './ReviewDetailDrawer';
import { buttonOf, byText, click, dialogTitled, fieldsWithValue, findByText, mount, queryByText, typeInto, unmount } from './testDom';
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

const REVIEW: ReviewActivityInfo = {
  taskId: 'reviewactivity-1',
  taskName: 'orderWorkflow.chargeCard',
  activityName: 'chargeCard',
  title: '',
  description: '',
  parentWorkflowId: 'workflow-0193f2a1-0000-7000-8000-00000000abcd',
  parentWorkflowType: 'orderWorkflow',
  status: 'PENDING',
  trigger: 'ON_FAILURE',
  errorMessage: 'Card declined',
  startTime: '2026-10-01T10:00:00Z',
  closeTime: null,
  createdAt: '2026-10-01T10:00:00Z',
  userRoles: [],
  administratorRoles: ['ops'],
  canAdminister: true,
  taskInput: { cardHolder: 'Jane Doe', amount: 120 },
  formSchema: JSON.stringify({
    type: 'object',
    properties: { cardHolder: { type: 'string' }, amount: { type: 'integer' } },
  }),
};

const ITEM: WorkItem = {
  kind: 'review',
  taskId: REVIEW.taskId,
  title: REVIEW.activityName,
  name: REVIEW.activityName,
  parentWorkflowId: REVIEW.parentWorkflowId,
  parentWorkflowType: 'orderWorkflow',
  status: 'PENDING',
  startTime: REVIEW.startTime,
  closeTime: null,
  userRoles: [],
  trigger: 'ON_FAILURE',
};

async function renderDrawer(review: ReviewActivityInfo, { item = ITEM, runtimeTaskQueue = null }: { item?: WorkItem; runtimeTaskQueue?: string | null } = {}) {
  const reviews = {
    get: vi.fn().mockResolvedValue(review),
    proceed: vi.fn().mockResolvedValue({ success: true }),
    proceedWithInput: vi.fn().mockResolvedValue({ success: true }),
    reject: vi.fn().mockResolvedValue({ success: true }),
  };
  const client = { reviews } as unknown as WorkflowClient;
  const api = { client, connection: { status: 'ready', client, scopeId: 'scope', runtime: { taskQueue: runtimeTaskQueue }, renewCredential: vi.fn() } } as unknown as ReadyWorkflowApi;
  const props = { onNotify: vi.fn(), onClose: vi.fn() };
  await mount(
    <QueryClientProvider client={new QueryClient()}>
      <ReviewDetailDrawer item={item} api={api} {...props} />
    </QueryClientProvider>,
  );
  await findByText('Activity Name');
  return { reviews, ...props };
}

/** Submits what the review-changes step staged. */
async function confirmChanges() {
  await click(buttonOf('Review Changes'));
  await click(buttonOf('Proceed with Changes', dialogTitled('Review Changes')));
}

afterEach(async () => {
  await unmount();
  drawer.calls.splice(0);
});

describe('ReviewDetailDrawer', () => {
  it('opens maximized, with the arguments as labelled rows', async () => {
    await renderDrawer(REVIEW);
    expect(byText('Review Details')).toBeTruthy();
    expect(byText('Activity Arguments')).toBeTruthy();
    expect(drawer.calls.at(-1)).toEqual({ open: true, expanded: true });
    expect(byText('Card Holder')).toBeTruthy();
    expect(byText('Jane Doe')).toBeTruthy();
  });

  it('offers the Administer card to an administrator', async () => {
    await renderDrawer(REVIEW);
    expect(byText('Administer')).toBeTruthy();
    expect(byText('Reassign')).toBeTruthy();
  });

  it('proceeds as recorded after confirming, and says so', async () => {
    const { reviews, onNotify, onClose } = await renderDrawer(REVIEW);
    await click(buttonOf('Proceed'));
    expect(byText('The activity retries with the original arguments below. This cannot be undone.')).toBeTruthy();
    await click(buttonOf('Proceed', dialogTitled('Confirm Proceed')));
    expect(reviews.proceed).toHaveBeenCalledWith('reviewactivity-1');
    expect(onNotify).toHaveBeenCalledWith({ message: 'Activity proceeded.', severity: 'success' });
    expect(onClose).toHaveBeenCalled();
  });

  it('rejects with the feedback given', async () => {
    const { reviews } = await renderDrawer(REVIEW);
    await click(buttonOf('Reject'));
    const dialog = dialogTitled('Reject Activity');
    const [feedback] = dialog.querySelectorAll('textarea:not([aria-hidden])');
    await typeInto(feedback, '  Card is blocked  ');
    await click(buttonOf('Reject Activity', dialog));
    expect(reviews.reject).toHaveBeenCalledWith('reviewactivity-1', 'Card is blocked');
  });

  it('reruns with JSON typed in raw mode, exactly as typed', async () => {
    const { reviews } = await renderDrawer(REVIEW);
    await click(buttonOf('Proceed with Changes'));
    await click(buttonOf('Edit as JSON'));

    // Raw mode opens on the recorded arguments, so a key the schema omits is still editable.
    const [editor] = fieldsWithValue(/"cardHolder": "Jane Doe"/);
    await typeInto(editor, '{"cardHolder":"J. Doe","amount":120,"retry":true}');
    await click(buttonOf('Review Changes'));
    expect(byText('Arguments to Submit')).toBeTruthy();

    await click(buttonOf('Proceed with Changes', dialogTitled('Review Changes')));
    expect(reviews.proceedWithInput).toHaveBeenCalledWith('reviewactivity-1', { cardHolder: 'J. Doe', amount: 120, retry: true });
  });

  it('refuses raw JSON that does not parse', async () => {
    const { reviews } = await renderDrawer(REVIEW);
    await click(buttonOf('Proceed with Changes'));
    await click(buttonOf('Edit as JSON'));
    await typeInto(fieldsWithValue(/"cardHolder"/)[0], '{ not json');
    await click(buttonOf('Review Changes'));

    expect(byText('Arguments must be valid JSON.')).toBeTruthy();
    expect(reviews.proceedWithInput).not.toHaveBeenCalled();
  });

  it('offers a form for an argument the schema only calls an object', async () => {
    const { reviews } = await renderDrawer({
      ...REVIEW,
      taskInput: { claim: { id: 'C-1', amount: 120 } },
      formSchema: JSON.stringify({ type: 'object', properties: { claim: { type: 'object' } } }),
    });
    await click(buttonOf('Proceed with Changes'));
    // The claim's own fields, not a JSON box holding it.
    await typeInto(fieldsWithValue('120')[0], '150');
    await confirmChanges();
    expect(reviews.proceedWithInput).toHaveBeenCalledWith('reviewactivity-1', { claim: { id: 'C-1', amount: 150 } });
  });

  // A nilable parameter (never required), a recorded null, and a key the schema does not describe.
  const RECORDED = { orderId: 'A1', coupon: null, extra: 'x' };
  const withRecorded: ReviewActivityInfo = {
    ...REVIEW,
    taskInput: RECORDED,
    formSchema: JSON.stringify({
      type: 'object',
      properties: { orderId: { type: 'string' }, coupon: { type: ['string', 'null'] } },
      required: ['orderId'],
    }),
  };

  it('submits the recorded arguments with the edits laid over them', async () => {
    const { reviews } = await renderDrawer(withRecorded);
    await click(buttonOf('Proceed with Changes'));
    await typeInto(fieldsWithValue('A1')[0], 'A2');
    await confirmChanges();
    expect(reviews.proceedWithInput).toHaveBeenCalledWith('reviewactivity-1', { orderId: 'A2', coupon: null, extra: 'x' });
  });

  it('says nothing changed only when what is submitted is the recorded value', async () => {
    const { reviews } = await renderDrawer(withRecorded);
    await click(buttonOf('Proceed with Changes'));
    await click(buttonOf('Review Changes'));
    expect(byText(/^Nothing was changed/)).toBeTruthy();
    await click(buttonOf('Proceed with Changes', dialogTitled('Review Changes')));
    expect(reviews.proceedWithInput).toHaveBeenCalledWith('reviewactivity-1', RECORDED);
  });

  it('does not drop JSON edits silently when going back to the form', async () => {
    const { reviews } = await renderDrawer(REVIEW);
    await click(buttonOf('Proceed with Changes'));
    await click(buttonOf('Edit as JSON'));
    await typeInto(fieldsWithValue(/"cardHolder"/)[0], '{"cardHolder":"J. Doe","amount":120}');

    await click(buttonOf('Back to form'));
    // Still in raw mode, saying why, until the edits are discarded on purpose.
    expect(byText(/The form does not pick up JSON edits/)).toBeTruthy();
    expect(fieldsWithValue(/J\. Doe/)).toHaveLength(1);

    await click(buttonOf('Discard JSON edits'));
    expect(fieldsWithValue('Jane Doe')).toHaveLength(1);
    await click(buttonOf('Edit as JSON'));
    expect(fieldsWithValue(/"cardHolder": "Jane Doe"/)).toHaveLength(1);
    expect(reviews.proceedWithInput).not.toHaveBeenCalled();
  });

  it('names who may decide the review, or that anyone may', async () => {
    await renderDrawer({ ...REVIEW, userRoles: ['Finance'] });
    expect(byText('Eligible Roles')).toBeTruthy();
    expect(byText('Finance')).toBeTruthy();

    await unmount();
    await renderDrawer({ ...REVIEW, userRoles: [] });
    expect(byText('Not restricted')).toBeTruthy();
  });

  it('offers no decision on a review another integration serves', async () => {
    await renderDrawer(REVIEW, { item: { ...ITEM, taskQueue: 'billing' }, runtimeTaskQueue: 'orders' });
    expect(byText('This review is served by a different integration (billing), so it cannot be decided from here.')).toBeTruthy();
    expect(queryByText('Decisions')).toBeNull();
    expect(queryByText('Administer')).toBeNull();
  });
});
