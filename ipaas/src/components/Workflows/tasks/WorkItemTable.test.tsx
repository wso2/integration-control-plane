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

import { afterEach, describe, expect, it, vi } from 'vitest';
import { byText, click, mount, queryByText, unmount } from './testDom';
import WorkItemTable from './WorkItemTable';
import type { WorkItem } from './workItem';

const item = (patch: Partial<WorkItem>): WorkItem => ({
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

const checkboxes = () => [...document.body.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];

afterEach(unmount);

describe('WorkItemTable', () => {
  it('selects all from the header, and keeps a disabled box on a row it cannot select', async () => {
    const onToggleAll = vi.fn();
    const onToggleSelect = vi.fn();
    const onOpen = vi.fn();
    await mount(
      <WorkItemTable items={[item({ taskId: 'r-1' }), item({ taskId: 't-1', kind: 'task', title: 'Approve' })]} loading={false} emptyMessage="none" onOpen={onOpen} selectable selectedIds={[]} onToggleSelect={onToggleSelect} onToggleAll={onToggleAll} />,
    );
    const boxes = checkboxes();
    // The header's, the review's, and the human task's: disabled, not missing.
    expect(boxes).toHaveLength(3);
    expect(boxes[2].disabled).toBe(true);
    await click(boxes[0]);
    expect(onToggleAll).toHaveBeenCalled();
    // Choosing a row does not open it.
    await click(boxes[1]);
    expect(onToggleSelect).toHaveBeenCalledWith('r-1');
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('opens a row, and says what a review asks for under its title', async () => {
    const onOpen = vi.fn();
    const review = item({ trigger: 'ON_FAILURE' });
    await mount(<WorkItemTable items={[review]} loading={false} emptyMessage="none" onOpen={onOpen} />);
    expect(byText('Decision after failure')).toBeTruthy();
    expect(byText('Review')).toBeTruthy();
    expect(checkboxes()).toHaveLength(0);
    await click(byText('chargeCard'));
    expect(onOpen).toHaveBeenCalledWith(review);
  });

  it('says so when nothing matches, and stands in skeleton rows while loading', async () => {
    await mount(<WorkItemTable items={[]} loading={false} emptyMessage="No tasks match these filters." onOpen={vi.fn()} />);
    expect(byText('No tasks match these filters.')).toBeTruthy();

    await unmount();
    await mount(<WorkItemTable items={[]} loading emptyMessage="No tasks match these filters." onOpen={vi.fn()} />);
    expect(queryByText('No tasks match these filters.')).toBeNull();
    expect(document.body.querySelectorAll('tbody tr')).toHaveLength(5);
  });
});
